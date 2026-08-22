const STEPS = [
  ['Add walls', 'Type start point, length and direction — each wall chains from the last — or click two points on the plan.'],
  ['Doors & windows', 'Select a wall, press + Door / + Window, then edit width, height, sill and position.'],
  ['Floor, materials, roof', 'Rebuild floor, pick wall/floor/roof materials, choose flat, gable or hip roof.'],
  ['Sun study', 'Drag time and month; set latitude and north offset for your site to get real shadows.'],
  ['Walk inside', 'First-person view at eye height: click the 3D view, WASD to move, Esc to release.'],
  ['Render image', 'Fast preview in seconds on any PC, or a photoreal path-traced render on a desktop GPU.'],
  ['Export', '.glb for Blender/Twinmotion, .usdz for iPhone AR, dimensioned A3 PDF plans, or the project file.'],
  ['Import plan', 'Upload a scan or photo of a floor plan; walls and openings are extracted automatically for you to check.'],
  ['Phone / AR', 'Save, then scan the QR with an Android phone to place the building on a table or 1:1 on site.'],
];

export function HelpDialog({ onClose }: { onClose(): void }) {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>How to use ArchViz Studio</strong>
          <span className="hint">2-minute walkthrough</span>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>
        <video
          className="help-video"
          controls
          autoPlay
          muted
          playsInline
          poster={`${base}tutorial/poster.jpg`}
          src={`${base}tutorial/how-to-use.mp4`}
        />
        <ol className="help-steps">
          {STEPS.map(([title, text]) => (
            <li key={title}><b>{title}</b> — {text}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
