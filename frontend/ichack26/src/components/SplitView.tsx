/**
 * Split View Component
 *
 * Side-by-side comparison of naive vs optimized routes.
 * Both panels show the same wind field but different drones.
 */

import { useState, useRef, useCallback } from 'react'
import * as THREE from 'three'
import SimulationPanel from './SimulationPanel'

// ============================================================================
// Types
// ============================================================================

export interface SplitViewProps {
  /** Show wind field in panels */
  showWindField?: boolean
  /** Sync cameras between panels */
  syncCameras?: boolean
}

// ============================================================================
// Main Component
// ============================================================================

export default function SplitView({
  showWindField = true,
  syncCameras = true,
}: SplitViewProps) {
  // Camera sync state
  const [masterCamera, setMasterCamera] = useState<THREE.Camera | null>(null)
  const cameraRef = useRef<THREE.Camera | null>(null)

  // Handle camera changes from the control panel
  const handleCameraChange = useCallback((camera: THREE.Camera) => {
    cameraRef.current = camera
    setMasterCamera(camera)
  }, [])

  return (
    <div style={styles.container}>
      {/* Left panel - Naive route */}
      <div style={styles.panelWrapper}>
        <SimulationPanel
          routeType="naive"
          label="Naive Route"
          labelColor="rgba(255, 107, 107, 0.9)"
          showWindField={showWindField}
          isControlPanel={true}
          onCameraChange={syncCameras ? handleCameraChange : undefined}
        />
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Right panel - Optimized route */}
      <div style={styles.panelWrapper}>
        <SimulationPanel
          routeType="optimized"
          label="Wind-Optimized Route"
          labelColor="rgba(78, 205, 196, 0.9)"
          showWindField={showWindField}
          cameraRef={syncCameras ? cameraRef : undefined}
          isControlPanel={false}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
  },
  panelWrapper: {
    flex: 1,
    height: '100%',
    position: 'relative',
  },
  divider: {
    width: 3,
    backgroundColor: '#333',
    boxShadow: '0 0 10px rgba(0,0,0,0.5)',
    zIndex: 10,
  },
}
