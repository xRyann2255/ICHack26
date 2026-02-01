import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import SplitView from './components/SplitView'
import DemoOrchestrator from './components/DemoOrchestrator'
import ConnectionStatus from './components/ConnectionStatus'
import MetricsPanel from './components/MetricsPanel'
import CollapsibleSidebar from './components/CollapsibleSidebar'
import { type VisibilityState, DEFAULT_VISIBILITY } from './components/VisibilityToggles'
import { SceneProvider } from './context/SceneContext'
import './App.css'

type ViewMode = 'cinematic' | 'split' | 'combined'

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('cinematic')

  // UI Control States
  const [visibility, setVisibility] = useState<VisibilityState>(DEFAULT_VISIBILITY)
  const [windDirection, setWindDirection] = useState(0) // 0-15 index into WIND_DIRECTIONS
  const [showControls, setShowControls] = useState(true)

  return (
    <SceneProvider wsUrl="ws://localhost:8765" autoConnect={true}>
      <div style={{ width: '100vw', height: '100vh', background: '#87CEEB' }}>
        {/* WebSocket connection status overlay */}
        <ConnectionStatus />

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

          <button
            style={{
              ...viewToggleStyles.button,
              marginLeft: 8,
              ...(showControls ? viewToggleStyles.active : {}),
            }}
            onClick={() => setShowControls(!showControls)}
            title={showControls ? 'Hide Controls' : 'Show Controls'}
          >
            {showControls ? 'Hide UI' : 'Show UI'}
          </button>
        </div>

        {/* UI Controls (shown in non-cinematic modes) */}
        <CollapsibleSidebar
          visibility={visibility}
          onVisibilityChange={setVisibility}
          windDirection={windDirection}
          onWindDirectionChange={setWindDirection}
        />

        {/* 3D View based on mode */}
        {viewMode === 'cinematic' ? (
          <DemoOrchestrator
            autoStart={true}
            routeCreationSpeed={0.02}
            transitionDuration={2000}
          />
        ) : viewMode === 'split' ? (
          <>
            <SplitView
              syncCameras={true}
              visibility={visibility}
            />
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
              <Scene visibility={visibility} />
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
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    padding: 4,
    boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
  },
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: '#555',
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
