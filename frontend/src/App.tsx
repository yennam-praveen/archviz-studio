import { useEffect, useState } from 'react';
import { ProjectBar } from './components/ProjectBar';
import { DimensionPanel } from './components/DimensionPanel';
import { Plan2D } from './components/Plan2D';
import { Scene3D } from './components/Scene3D';
import { ARView } from './ar/ARView';
import { api } from './api/client';
import { migrate, sampleProject } from './model/store';
import type { Project } from './model/types';
import { useIsMobile } from './hooks/useMediaQuery';

/** `/?ar=<token>` opens the read-only phone/AR viewer for a shared project. */
function ARRoute({ token }: { token: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    // `demo` needs no backend — lets the AR viewer be tried from a static host (GitHub Pages).
    if (token === 'demo') { setProject(sampleProject()); return; }
    api.getShared(token).then((r) => setProject(migrate(r.data))).catch((e) => setError(String(e)));
  }, [token]);
  if (error) return <div className="ar-page"><p className="ar-note warn">Could not load this project: {error}</p></div>;
  if (!project) return <div className="ar-page"><p className="ar-note">Loading project…</p></div>;
  return <ARView project={project} />;
}

type MobileTab = 'edit' | 'plan' | '3d';

export default function App() {
  const [drawMode, setDrawMode] = useState(false);
  const [tab, setTab] = useState<MobileTab>('3d');
  const isMobile = useIsMobile();
  const arToken = new URLSearchParams(location.search).get('ar');
  if (arToken) return <ARRoute token={arToken} />;

  if (isMobile) {
    return (
      <div className="app mobile">
        <ProjectBar compact />
        <div className="main mobile">
          {tab === 'edit' && <DimensionPanel drawMode={drawMode} setDrawMode={(v) => { setDrawMode(v); if (v) setTab('plan'); }} />}
          {tab === 'plan' && (
            <div className="view">
              <Plan2D drawMode={drawMode} onDrawDone={() => setDrawMode(false)} />
            </div>
          )}
          {tab === '3d' && (
            <div className="view">
              <Scene3D />
            </div>
          )}
        </div>
        <nav className="tabbar">
          {([['edit', 'Edit'], ['plan', 'Plan'], ['3d', '3D']] as [MobileTab, string][]).map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="app">
      <ProjectBar />
      <div className="main">
        <DimensionPanel drawMode={drawMode} setDrawMode={setDrawMode} />
        <div className="views">
          <div className="view">
            <div className="view-title">Plan</div>
            <Plan2D drawMode={drawMode} onDrawDone={() => setDrawMode(false)} />
          </div>
          <div className="view">
            <div className="view-title">3D</div>
            <Scene3D />
          </div>
        </div>
      </div>
    </div>
  );
}
