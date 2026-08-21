import { useEffect, useState } from 'react';
import { ProjectBar } from './components/ProjectBar';
import { DimensionPanel } from './components/DimensionPanel';
import { Plan2D } from './components/Plan2D';
import { Scene3D } from './components/Scene3D';
import { ARView } from './ar/ARView';
import { api } from './api/client';
import { migrate } from './model/store';
import type { Project } from './model/types';

/** `/?ar=<token>` opens the read-only phone/AR viewer for a shared project. */
function ARRoute({ token }: { token: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.getShared(token).then((r) => setProject(migrate(r.data))).catch((e) => setError(String(e)));
  }, [token]);
  if (error) return <div className="ar-page"><p className="ar-note warn">Could not load this project: {error}</p></div>;
  if (!project) return <div className="ar-page"><p className="ar-note">Loading project…</p></div>;
  return <ARView project={project} />;
}

export default function App() {
  const [drawMode, setDrawMode] = useState(false);
  const arToken = new URLSearchParams(location.search).get('ar');
  if (arToken) return <ARRoute token={arToken} />;

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
