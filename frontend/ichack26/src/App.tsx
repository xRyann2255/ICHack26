import { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Wind } from 'lucide-react'
import Scene from './components/Scene'
import SplitView from './components/SplitView'
import DemoOrchestrator from './components/DemoOrchestrator'
import MetricsPanel from './components/MetricsPanel'
import HomePage from './components/HomePage'
import { type VisibilityState, DEFAULT_VISIBILITY } from './components/VisibilityToggles'
import { SceneProvider, useScene } from './context/SceneContext'
import './App.css'

type ViewMode = 'cinematic' | 'split' | 'combined'
type AppState = 'home' | 'loading' | 'ready'

// ============================================================================
// Scene Loader (monitors WebSocket connection and scene readiness)
// ============================================================================

interface SceneLoaderProps {
  onSceneReady: () => void
}

function SceneLoader({ onSceneReady }: SceneLoaderProps) {
  const { connectionStatus, sceneData, windFieldData, fetchSceneData, enterPlanningMode, isDataLoaded } = useScene()
  const [hasRequestedData, setHasRequestedData] = useState(false)
  const [hasTransitioned, setHasTransitioned] = useState(false)

  // Debug logging
  useEffect(() => {
    console.log('[SceneLoader] Status:', {
      connectionStatus,
      hasSceneData: !!sceneData,
      hasWindFieldData: !!windFieldData,
      isDataLoaded,
      hasRequestedData,
      hasTransitioned
    })
  }, [connectionStatus, sceneData, windFieldData, isDataLoaded, hasRequestedData, hasTransitioned])

  useEffect(() => {
    // Once connected, automatically request scene data
    if (connectionStatus === 'connected' && !hasRequestedData) {
      console.log('[SceneLoader] Requesting scene and wind field data...')
      fetchSceneData(2) // Request all data with downsample=2
      setHasRequestedData(true)
    }
  }, [connectionStatus, hasRequestedData, fetchSceneData])

  useEffect(() => {
    // Use isDataLoaded which checks both scene and wind field internally
    if (isDataLoaded && !hasTransitioned) {
      console.log('[SceneLoader] All data loaded, entering route planning mode')
      setHasTransitioned(true)
      enterPlanningMode() // Automatically enter route planning mode
      onSceneReady()
    }
  }, [isDataLoaded, hasTransitioned, onSceneReady, enterPlanningMode])

  // Fallback timeout - if loading takes too long, proceed anyway
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!hasTransitioned) {
        console.log('[SceneLoader] Timeout reached, proceeding to ready state anyway')
        console.log('[SceneLoader] Debug - sceneData:', !!sceneData, 'windFieldData:', !!windFieldData)
        setHasTransitioned(true)
        enterPlanningMode()
        onSceneReady()
      }
    }, 15000) // 15 second timeout

    return () => clearTimeout(timeout)
  }, [hasTransitioned, enterPlanningMode, onSceneReady, sceneData, windFieldData])

  return (
    <div style={loadingStyles.container}>
      <div style={loadingStyles.content}>
        <div style={loadingStyles.spinner} />
        <div style={loadingStyles.text}>Loading Scene...</div>
        <div style={loadingStyles.hint}>
          {connectionStatus === 'disconnected' && 'Connecting to server...'}
          {connectionStatus === 'connecting' && 'Establishing connection...'}
          {connectionStatus === 'connected' && !hasRequestedData && 'Connected! Requesting data...'}
          {connectionStatus === 'connected' && hasRequestedData && !sceneData && 'Loading terrain data...'}
          {connectionStatus === 'connected' && sceneData && !windFieldData && 'Loading wind field...'}
          {connectionStatus === 'connected' && isDataLoaded && 'Data loaded! Preparing scene...'}
          {connectionStatus === 'error' && 'Connection error - retrying...'}
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          {connectionStatus === 'disconnected' && 'Make sure the backend server is running on ws://localhost:8765'}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main App Content (after home page)
// ============================================================================

function AppContent() {
  const [viewMode, setViewMode] = useState<ViewMode>('cinematic')
  const [visibility, setVisibility] = useState<VisibilityState>(DEFAULT_VISIBILITY)

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e' }}>

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
  )
}

// ============================================================================
// Main App Wrapper (with home page)
// ============================================================================

function App() {
  const [appState, setAppState] = useState<AppState>('home')

  const handlePlanRoute = () => {
    setAppState('loading')
  }

  if (appState === 'home') {
    return <HomePage onPlanRoute={handlePlanRoute} />
  }

  // Single SceneProvider wraps both loading and ready states
  // This preserves the WebSocket connection and scene data across the transition
  return (
    <SceneProvider wsUrl="ws://localhost:8765" autoConnect={true}>
      {appState === 'loading' ? (
        <SceneLoader onSceneReady={() => setAppState('ready')} />
      ) : (
        <AppContent />
      )}
    </SceneProvider>
  )
}

// ============================================================================
// Styles
// ============================================================================

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

const loadingStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 24,
  },
  spinner: {
    width: 60,
    height: 60,
    border: '4px solid rgba(78, 205, 196, 0.2)',
    borderTop: '4px solid #4ecdc4',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  text: {
    fontSize: 24,
    fontWeight: 600,
    color: '#4ecdc4',
  },
  hint: {
    fontSize: 14,
    color: '#888',
  },
}

export default App
