import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'

function RotatingCube() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.5
      meshRef.current.rotation.y += delta * 0.7
    }
  })

  return (
    <mesh ref={meshRef} position={[0, 1, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#4a9eff" />
    </mesh>
  )
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
    </>
  )
}

export default function Scene() {
  return (
    <>
      <Lighting />
      <RotatingCube />

      {/* Ground grid for reference */}
      <Grid
        position={[0, 0, 0]}
        args={[100, 100]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#444"
        sectionSize={20}
        sectionThickness={1}
        sectionColor="#888"
        fadeDistance={200}
        infiniteGrid
      />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        minDistance={5}
        maxDistance={500}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.1}
      />
    </>
  )
}
