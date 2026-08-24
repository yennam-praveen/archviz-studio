import { useEffect, useState } from 'react';
import { api, type PlanImportResult } from '../api/client';
import { migrate, useStore } from '../model/store';
import { levelBounds } from '../model/geometry';

/**
 * Upload a floor plan (photo, scan, PDF) → Claude extracts walls and openings → preview → apply.
 * The plan image is kept as an underlay in the 2D editor so the architect can verify and fix.
 */
export function ImportPlanDialog({ onClose }: { onClose(): void }) {
  const setProject = useStore((s) => s.setProject);
  const setUnderlay = useStore((s) => s.setUnderlay);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [widthM, setWidthM] = useState('');
  const [depthM, setDepthM] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PlanImportResult | null>(null);

  useEffect(() => {
    if (!file || file.type === 'application/pdf') { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const analyse = async () => {
    if (!file) return;
    if (!api.isLoggedIn()) { setError('Log in first — plan analysis runs on the server.'); return; }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await api.importPlan(file, {
        widthM: parseFloat(widthM) || undefined,
        depthM: parseFloat(depthM) || undefined,
        notes: notes.trim() || undefined,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // No AI, no server, no API key: drop the plan straight in as an underlay and let the architect
  // trace walls by hand with the normal wall tool. Width/origin can be fine-tuned afterwards in the
  // Dimensions panel ("Plan underlay") once a known wall length gives an exact scale.
  const traceManually = () => {
    if (!file || file.type === 'application/pdf') return;
    setUnderlay({ url: URL.createObjectURL(file), widthM: parseFloat(widthM) || 12, opacity: 0.45, origin: [0, 0] });
    onClose();
  };

  const apply = () => {
    if (!result) return;
    const project = migrate(structuredClone(result.project));
    setProject(project);
    if (preview && file) {
      // Fit the image to the extracted footprint as a starting point; the panel lets the architect adjust.
      const b = levelBounds(project.levels[0]);
      const url = URL.createObjectURL(file);
      setUnderlay({
        url,
        widthM: b ? (b.x1 - b.x0) * 1.15 : 12,
        origin: b ? [b.x0 - (b.x1 - b.x0) * 0.075, b.y0 - (b.y1 - b.y0) * 0.075] : [0, 0],
        opacity: 0.45,
      });
    } else {
      setUnderlay(null);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal import" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Import a site / floor plan</strong>
          <span className="hint">PNG, JPEG, WebP or PDF — a photo of a paper plan works too.</span>
          <span className="spacer" />
          <button onClick={onClose} disabled={busy}>Close</button>
        </div>

        <div className="import-grid">
          <div className="import-left">
            <label className="btn file-btn">
              {file ? file.name : 'Choose plan file…'}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(''); }} />
            </label>
            {preview && <img className="import-preview" src={preview} alt="plan" />}
            {file?.type === 'application/pdf' && <p className="hint">PDF selected (first pages are analysed).</p>}
          </div>

          <div className="import-right">
            <p className="hint">Optional — if you know the overall dimensions, the result will be scaled exactly:</p>
            <div className="grid2">
              <label className="field"><span>Overall width (m, east–west)</span>
                <input type="number" step="0.1" value={widthM} onChange={(e) => setWidthM(e.target.value)} /></label>
              <label className="field"><span>Overall depth (m, north–south)</span>
                <input type="number" step="0.1" value={depthM} onChange={(e) => setDepthM(e.target.value)} /></label>
            </div>
            <label className="field"><span>Notes for the analysis (optional)</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. dimensions are in mm; ignore the garage; two storeys" /></label>
            <div className="row">
              <button className="primary" disabled={!file || busy} onClick={analyse}>
                {busy ? 'Analysing plan… (20–90 s)' : 'Analyse plan (AI)'}
              </button>
              <button disabled={!file || busy || file?.type === 'application/pdf'} onClick={traceManually}>
                Skip AI — trace manually
              </button>
            </div>
            <p className="hint">
              "Analyse plan" needs a Claude API key set up on the server. No key? Use <b>Skip AI — trace manually</b>
              instead — the plan drops in as a reference image and you draw walls over it by hand (works for images, not PDF).
              Fine-tune its size and position afterwards in the Dimensions panel under "Plan underlay".
            </p>
            {error && <p className="warn">{error}</p>}

            {result && (
              <div className="import-result">
                <h3>Result <small className={`conf ${result.confidence}`}>{result.confidence} confidence</small></h3>
                <p><b>{result.stats.walls}</b> walls, <b>{result.stats.openings}</b> doors/windows, <b>{result.stats.levels}</b> level{result.stats.levels === 1 ? '' : 's'}</p>
                <p className="hint">Scale: {result.scale_basis} (units on plan: {result.units_found_on_plan})</p>
                {result.rooms.length > 0 && (
                  <p className="hint">Rooms: {result.rooms.map((r) => `${r.name} ${r.approx_area_m2.toFixed(0)} m²`).join(' · ')}</p>
                )}
                {result.warnings.length > 0 && (
                  <ul className="warn-list">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                )}
                <div className="row">
                  <button className="primary" onClick={apply}>Use this plan</button>
                  <span className="hint">Replaces the current project. The plan image stays under the 2D view for checking.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
