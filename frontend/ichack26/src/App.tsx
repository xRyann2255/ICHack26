import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import ConnectionStatus from './components/ConnectionStatus'
import { SceneProvider } from './context/SceneContext'
import './App.css'

function App() {
  return (
    <SceneProvider wsUrl="ws://localhost:8765" autoConnect={true}>
      <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e' }}>
        {/* WebSocket connection status overlay */}
        <ConnectionStatus />

        {/* 3D Canvas */}
        <Canvas
          camera={{
            position: [200, 200, 150],
            up: [0, 0, 1],  // Z-up to match backend coordinate system
            fov: 60,
            near: 0.1,
            far: 10000,
          }}
          shadows
        >
          <color attach="background" args={['#1a1a2e']} />
          <fog attach="fog" args={['#1a1a2e', 100, 500]} />
          <Scene />
        </Canvas>
      </div>
    </SceneProvider>
  )
}

export default App
