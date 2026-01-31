import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import ConnectionStatus from './components/ConnectionStatus'
import MetricsPanel from './components/MetricsPanel'
import { SceneProvider } from './context/SceneContext'
import './App.css'

function App() {
  return (
    <SceneProvider wsUrl="ws://localhost:8765" autoConnect={true}>
      <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e' }}>
        {/* WebSocket connection status overlay */}
        <ConnectionStatus />

        {/* Metrics comparison panel (shows when simulation completes) */}
        <MetricsPanel />

        {/* 3D Canvas */}
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
      </div>
    </SceneProvider>
  )
}

export default App
