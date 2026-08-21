import { useEffect, useState } from 'react';
import { api, type ProjectSummary } from '../api/client';
import { sampleProject, useStore } from '../model/store';
import type { Project } from '../model/types';

export function ProjectBar() {
  const { project, dirty, remoteId, setProject, setProjectName, setRemoteId, markSaved } = useStore();
  const [loggedIn, setLoggedIn] = useState(api.isLoggedIn());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [status, setStatus] = useState('');

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

  const auth = async (mode: 'login' | 'register') => {
    try {
      await (mode === 'login' ? api.login(email, password) : api.register(email, password));
      setLoggedIn(true);
      setStatus('');
    } catch (e) {
      setStatus(String(e));
    }
  };

  const save = async () => {
    try {
      if (remoteId) {
        await api.updateProject(remoteId, project);
      } else {
        const r = await api.createProject(project);
        setRemoteId(r.id);
      }
      markSaved();
      setStatus('Saved');
      void refresh();
    } catch (e) {
      setStatus(String(e));
    }
  };

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
      <button onClick={exportJson}>Export JSON</button>
      <label className="btn">
        Import JSON
        <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </label>
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
    </header>
  );
}
