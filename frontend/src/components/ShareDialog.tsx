import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { useStore } from '../model/store';

export function ShareDialog({ onClose }: { onClose(): void }) {
  const remoteId = useStore((s) => s.remoteId);
  const dirty = useStore((s) => s.dirty);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  useEffect(() => {
    if (!api.isLoggedIn()) { setError('Log in and save the project first — the phone loads it from the server.'); return; }
    if (!remoteId) { setError('Save the project first — the phone loads it from the server.'); return; }
    api.shareProject(remoteId)
      .then(({ token }) => setLink(`${location.origin}${import.meta.env.BASE_URL}?ar=${encodeURIComponent(token)}`))
      .catch((e) => setError(String(e)));
  }, [remoteId]);

  useEffect(() => {
    if (link && canvasRef.current) void QRCode.toCanvas(canvasRef.current, link, { width: 240, margin: 1 });
  }, [link]);

  const revoke = async () => {
    if (!remoteId) return;
    await api.unshareProject(remoteId);
    setLink('');
    setError('Link revoked. Reopen this dialog to create a new one.');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Open on phone — AR</strong>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>
        {error && <p className="warn">{error}</p>}
        {link && (
          <>
            <canvas ref={canvasRef} className="qr" />
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="row">
              <button onClick={() => navigator.clipboard.writeText(link)}>Copy link</button>
              <button className="danger" onClick={revoke}>Revoke link</button>
            </div>
            {dirty && <p className="warn">You have unsaved changes — save first so the phone sees the latest version.</p>}
            <p className="hint">
              Scan with an Android phone in Chrome. <b>Tabletop</b> places a scale model on a table;
              <b> On-site 1:1</b> places the building on the actual plot. Anyone with this link can view (not edit) the project.
            </p>
            {isLocalhost && (
              <p className="warn">
                This link points at <code>localhost</code>, which the phone cannot reach. Run <code>npm run dev:lan</code> (HTTPS on your LAN IP)
                or deploy to an HTTPS host, then reopen this dialog.
              </p>
            )}
            {!secure && <p className="warn">WebXR only runs over HTTPS.</p>}
          </>
        )}
      </div>
    </div>
  );
}
