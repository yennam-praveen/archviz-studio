import { useEffect, useState } from 'react';
import { api, type ProjectSummary } from '../api/client';
import { sampleProject, useStore } from '../model/store';
import type { Project } from '../model/types';
import { exportGLB, exportUSDZ } from '../export/models';
import { exportPlanPDF } from '../export/pdf';
import { RenderDialog } from './RenderDialog';
import { ShareDialog } from './ShareDialog';
import { ImportPlanDialog } from './ImportPlanDialog';
import { HelpDialog } from './HelpDialog';

export function ProjectBar() {
  const { project, dirty, remoteId, setProject, setProjectName, setRemoteId, markSaved } = useStore();
  const [loggedIn, setLoggedIn] = useState(api.isLoggedIn());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [status, setStatus] = useState('');
  const [showRender, setShowRender] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHelp, setShowHelp] = useState(() => !localStorage.getItem('helpSeen'));
  useEffect(() => { if (!showHelp) localStorage.setItem('helpSeen', '1'); }, [showHelp]);

  const refresh = async () => {
    if (!api.isLoggedIn()) return;
    try {
      setProjects(await api.listProjects());
    } catch (e) {
      setStatus(String(e));
    }
  };
  useEffect(() => {
    void refresh();
  }, [loggedIn]);

  const run = (label: string, fn: () => Promise<void> | void) => async () => {
    try {
      setStatus(`${label}…`);
      await fn();
      setStatus('');
    } catch (e) {
      setStatus(`${label} failed: ${e}`);
    }
  };

  const auth = async (mode: 'login' | 'register') => {
    try {
      await (mode === 'login' ? api.login(email, password) : api.register(email, password));
      setLoggedIn(true);
      setStatus('');
    } catch (e) {
      setStatus(String(e));
    }
  };

  const save = run('Save', async () => {
    if (remoteId) {
      await api.updateProject(remoteId, project);
    } else {
      const r = await api.createProject(project);
      setRemoteId(r.id);
    }
    markSaved();
    void refresh();
  });

  const load = async (id: string) => {
    try {
      const r = await api.getProject(id);
      setProject(r.data, r.id);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/\s+/g, '_')}.json`;
    a.click();
  };

  const importJson = (file: File) => {
    file.text().then((t) => setProject(JSON.parse(t) as Project));
  };

  return (
    <header className="bar">
      <strong>ArchViz Studio</strong>
      <input className="name" value={project.name} onChange={(e) => setProjectName(e.target.value)} />
      <span className={dirty ? 'dot dirty' : 'dot'} title={dirty ? 'Unsaved changes' : 'Saved'} />
      <button onClick={() => setProject(sampleProject())}>New</button>
      <button onClick={() => setShowImport(true)}>Import plan</button>
      <div className="menu">
        <button>Export ▾</button>
        <div className="menu-items">
          <button onClick={run('glTF export', () => exportGLB(project))}>3D model (.glb) — Blender, Twinmotion</button>
          <button onClick={run('USDZ export', () => exportUSDZ(project))}>iPhone AR (.usdz)</button>
          <button onClick={run('PDF export', () => exportPlanPDF(project))}>Plan drawings (.pdf)</button>
          <button onClick={exportJson}>Project file (.json)</button>
          <label className="btn">
            Import project (.json)
            <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
        </div>
      </div>
      <button className="primary" onClick={() => setShowRender(true)}>Render image</button>
      <button onClick={() => setShowShare(true)}>Phone / AR</button>
      <button onClick={() => setShowHelp(true)} title="How to use">? Help</button>
      <span className="spacer" />
      {loggedIn ? (
        <>
          <select value={remoteId ?? ''} onChange={(e) => e.target.value && load(e.target.value)}>
            <option value="">Open project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="primary" onClick={save}>Save</button>
          <button onClick={() => { api.logout(); setLoggedIn(false); setRemoteId(null); }}>Logout</button>
        </>
      ) : (
        <>
          <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button onClick={() => auth('login')}>Login</button>
          <button onClick={() => auth('register')}>Register</button>
        </>
      )}
      {status && <span className="status">{status}</span>}
      {showRender && <RenderDialog onClose={() => setShowRender(false)} />}
      {showShare && <ShareDialog onClose={() => setShowShare(false)} />}
      {showImport && <ImportPlanDialog onClose={() => setShowImport(false)} />}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </header>
  );
}
