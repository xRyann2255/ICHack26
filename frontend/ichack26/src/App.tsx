import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import './App.css'

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1a1a2e' }}>
      <Canvas
        camera={{
          position: [200, 200, 150],
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
  )
}

export default App
