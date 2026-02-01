import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Wind } from 'lucide-react'
import Scene from './components/Scene'
import SplitView from './components/SplitView'
import DemoOrchestrator from './components/DemoOrchestrator'
import ConnectionStatus from './components/ConnectionStatus'
import MetricsPanel from './components/MetricsPanel'
import { type VisibilityState, DEFAULT_VISIBILITY } from './components/VisibilityToggles'
import { SceneProvider } from './context/SceneContext'
import './App.css'

type ViewMode = 'cinematic' | 'split' | 'combined'

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('cinematic')
  const [simulationStarted, setSimulationStarted] = useState(false)

  // UI Control States
  const [visibility, setVisibility] = useState<VisibilityState>(DEFAULT_VISIBILITY)

  return (
    <SceneProvider wsUrl="ws://localhost:8765" autoConnect={true}>
      <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e' }}>
        {/* WebSocket connection status overlay */}
        {!simulationStarted && <ConnectionStatus />}

        <div style={viewToggleStyles.container}>
          <button
            style={{
              ...viewToggleStyles.button,
              ...(viewMode === 'cinematic' ? viewToggleStyles.active : {}),
            }}
            onMouseEnter={(e) => {
              if (viewMode !== 'cinematic') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'cinematic') {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
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
            onMouseEnter={(e) => {
              if (viewMode !== 'split') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'split') {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
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
            onMouseEnter={(e) => {
              if (viewMode !== 'combined') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'combined') {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
            onClick={() => setViewMode('combined')}
          >
            Combined
          </button>
        </div>

        {/* Wind Field Toggle - Below View Selection */}
        <button
          style={{
            position: 'absolute',
            top: '68px',
            right: '16px',
            padding: '10px',
            background: visibility.windField ? 'rgba(78, 205, 196, 0.9)' : 'rgba(0, 0, 0, 0.75)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            zIndex: 1000,
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)'
            e.currentTarget.style.background = visibility.windField
              ? 'rgba(78, 205, 196, 1)'
              : 'rgba(0, 0, 0, 0.85)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.background = visibility.windField
              ? 'rgba(78, 205, 196, 0.9)'
              : 'rgba(0, 0, 0, 0.75)'
          }}
          onClick={() => setVisibility({ ...visibility, windField: !visibility.windField })}
          title={visibility.windField ? 'Hide Wind Field' : 'Show Wind Field'}
        >
          <Wind size={20} />
        </button>

        {/* 3D View based on mode */}
        {viewMode === 'cinematic' ? (
          <DemoOrchestrator
            autoStart={true}
            routeCreationSpeed={0.02}
            transitionDuration={2000}
            visibility={visibility}
            onSimulationStart={() => setSimulationStarted(true)}
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
              <color attach="background" args={['#1a1a2e']} />
              <fog attach="fog" args={['#1a1a2e', 500, 2000]} />
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    padding: 4,
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(5px)',
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
    backgroundColor: 'rgba(78, 205, 196, 0.9)',
    color: '#fff',
  },
}

export default App
