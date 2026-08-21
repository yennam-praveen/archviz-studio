import { useState } from 'react';
import { ProjectBar } from './components/ProjectBar';
import { DimensionPanel } from './components/DimensionPanel';
import { Plan2D } from './components/Plan2D';
import { Scene3D } from './components/Scene3D';

export default function App() {
  const [drawMode, setDrawMode] = useState(false);
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
