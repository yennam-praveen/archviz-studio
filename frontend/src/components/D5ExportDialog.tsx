import { useState } from 'react';
import { useStore } from '../model/store';
import type { Project } from '../model/types';
import { exportGLB } from '../export/models';
import { MATERIALS, DEFAULT_WALL_MATERIAL, DEFAULT_FLOOR_MATERIAL } from '../model/materials';

const STEPS = [
  ['Export', 'Click "Export .glb" below — the file downloads to your device.'],
  ['Import', 'Open D5 Render, then File ▸ Import (or drag the .glb straight into the viewport).'],
  ['Materials', 'D5 keeps each material as its own named slot (listed below) — reassign each to a real D5 material in the Asset panel.'],
  ['Light & render', "D5's own sun/sky and assets apply on top — set your sun position, add site assets, then render."],
];

/** Distinct material labels used in the current project, so the architect knows what to expect in D5's material list. */
function usedMaterialLabels(project: Project): string[] {
  const keys = new Set<string>();
  for (const level of project.levels) {
    for (const w of level.walls) keys.add(w.material ?? DEFAULT_WALL_MATERIAL);
    for (const f of level.floors) keys.add(f.material ?? DEFAULT_FLOOR_MATERIAL);
    if (level.roof) keys.add(level.roof.material ?? 'roof_tile');
  }
  return [...keys].map((k) => MATERIALS[k]?.label ?? k).sort();
}

export function D5ExportDialog({ onClose }: { onClose(): void }) {
  const project = useStore((s) => s.project);
  const [status, setStatus] = useState('');
  const materials = usedMaterialLabels(project);

  const doExport = async () => {
    try {
      setStatus('Exporting…');
      await exportGLB(project);
      setStatus('Downloaded — now open D5 Render and import the .glb file.');
    } catch (e) {
      setStatus(`Export failed: ${e}`);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal d5" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Send to D5 Render</strong>
          <span className="hint">Photoreal lighting &amp; assets in D5</span>
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
        </div>
        <ol className="help-steps d5-steps">
          {STEPS.map(([title, text]) => (
            <li key={title}><b>{title}</b> — {text}</li>
          ))}
        </ol>
        {materials.length > 0 && (
          <div className="d5-materials">
            <h3>Materials in this project</h3>
            <p className="hint">{materials.join(', ')}</p>
          </div>
        )}
        <div className="row">
          <button className="primary" onClick={doExport}>Export .glb</button>
        </div>
        {status && <p className={status.startsWith('Export failed') ? 'warn' : 'hint'}>{status}</p>}
      </div>
    </div>
  );
}
