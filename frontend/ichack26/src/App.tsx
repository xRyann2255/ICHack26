import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import SplitView from './components/SplitView'
import DemoOrchestrator from './components/DemoOrchestrator'
import ConnectionStatus from './components/ConnectionStatus'
import MetricsPanel from './components/MetricsPanel'
import { SceneProvider } from './context/SceneContext'
import './App.css'

type ViewMode = 'cinematic' | 'split' | 'combined'

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('cinematic')

  return (
    <SceneProvider wsUrl="ws://localhost:8765" autoConnect={true}>
      <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e' }}>
        {/* WebSocket connection status overlay */}
        <ConnectionStatus />

        {/* View mode toggle */}
        <div style={viewToggleStyles.container}>
          <button
            style={{
              ...viewToggleStyles.button,
              ...(viewMode === 'cinematic' ? viewToggleStyles.active : {}),
            }}
            onClick={() => setViewMode('cinematic')}
          >
            Cinematic
          </button>
          <button
            style={{
              ...viewToggleStyles.button,
              ...(viewMode === 'split' ? viewToggleStyles.active : {}),
            }}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button
            style={{
              ...viewToggleStyles.button,
              ...(viewMode === 'combined' ? viewToggleStyles.active : {}),
            }}
            onClick={() => setViewMode('combined')}
          >
            Combined
          </button>
        </div>

        {/* 3D View based on mode */}
        {viewMode === 'cinematic' ? (
          <DemoOrchestrator
            autoStart={true}
            routeCreationSpeed={0.02}
            transitionDuration={2000}
          />
        ) : viewMode === 'split' ? (
          <>
            <SplitView showWindField={true} syncCameras={true} />
            <MetricsPanel />
          </>
        ) : (
          <>
            <Canvas
              camera={{
                position: [600, 400, 600],
                fov: 60,
                near: 0.1,
                far: 5000,
              }}
              shadows
            >
              <color attach="background" args={['#1a1a2e']} />
              <fog attach="fog" args={['#1a1a2e', 500, 2000]} />
              <Scene />
            </Canvas>
            <MetricsPanel />
          </>
        )}
      </div>
    </SceneProvider>
  )
}

const viewToggleStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'flex',
    gap: 4,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    padding: 4,
  },
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  active: {
    backgroundColor: '#4a9eff',
    color: '#fff',
  },
}

export default App
