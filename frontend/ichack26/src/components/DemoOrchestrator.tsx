/**
 * Demo Orchestrator Component
 *
 * Manages the two-phase demo: route creation → drone flight.
 * State machine: idle → route_creation → transition → drone_flight → complete
 */

import { useState, useEffect } from 'react'
import RouteCreationView from './RouteCreationView'
import DroneFlightView from './DroneFlightView'
import TransitionOverlay from './TransitionOverlay'
import MetricsPanel from './MetricsPanel'
import { useScene } from '../context/SceneContext'
import type { VisibilityState } from './VisibilityToggles'

// ============================================================================
// Types
// ============================================================================

export type DemoPhase =
  | 'idle'
  | 'route_creation_naive'
  | 'route_creation_optimized'
  | 'transition'
  | 'drone_flight'
  | 'complete'

export interface DemoOrchestratorProps {
  /** Auto-start demo when paths are received */
  autoStart?: boolean
  /** Speed of route creation animation (0-1 per tick) */
  routeCreationSpeed?: number
  /** Duration of transition overlay in ms */
  transitionDuration?: number
  /** Visibility state for wind field, etc */
  visibility?: Partial<VisibilityState>
}

// ============================================================================
// Component
// ============================================================================

export default function DemoOrchestrator({
  autoStart = true,
  routeCreationSpeed = 0.015,
  transitionDuration = 2500,
  visibility,
}: DemoOrchestratorProps) {
  const { simulation, paths } = useScene()

  // Demo state
  const [phase, setPhase] = useState<DemoPhase>('idle')
  const [routeProgress, setRouteProgress] = useState(0)

  // Wind field visibility
  const showWindField = visibility?.windField ?? true

  // Start demo when paths are received or simulation starts
  useEffect(() => {
    // Start if we have paths and we're in idle phase
    // This catches both 'paths_received' status and 'simulating' status
    // to handle timing differences between browsers (especially Firefox)
    if (autoStart && paths && phase === 'idle') {
      const isSimulationStarted = simulation.status === 'paths_received' ||
        simulation.status === 'simulating' ||
        simulation.status === 'complete'
      const hasValidPaths = (paths.naive && paths.naive.length > 0) ||
        (paths.optimized && paths.optimized.length > 0)

      if (isSimulationStarted && hasValidPaths) {
        console.log('[DemoOrchestrator] Starting route creation', {
          status: simulation.status,
          naiveLength: paths.naive?.length,
          optimizedLength: paths.optimized?.length,
          phase
        })
        setPhase('route_creation_naive')
        setRouteProgress(0)
      }
    }
  }, [autoStart, simulation.status, paths, phase])

  // Route creation animation - Naive
  useEffect(() => {
    if (phase !== 'route_creation_naive') return

    const interval = setInterval(() => {
      setRouteProgress(prev => {
        if (prev >= 1) {
          // Naive route done, start optimized
          setPhase('route_creation_optimized')
          return 0 // Reset progress for next route
        }
        return Math.min(1, prev + routeCreationSpeed)
      })
    }, 50)

    return () => clearInterval(interval)
  }, [phase, routeCreationSpeed])

  // Route creation animation - Optimized
  useEffect(() => {
    if (phase !== 'route_creation_optimized') return

    const interval = setInterval(() => {
      setRouteProgress(prev => {
        if (prev >= 1) {
          // Both routes done, transition
          setPhase('transition')
          return 1
        }
        return Math.min(1, prev + routeCreationSpeed)
      })
    }, 50)

    return () => clearInterval(interval)
  }, [phase, routeCreationSpeed])

  // Transition to drone flight
  useEffect(() => {
    if (phase !== 'transition') return

    const timeout = setTimeout(() => {
      setPhase('drone_flight')
    }, transitionDuration)

    return () => clearTimeout(timeout)
  }, [phase, transitionDuration])

  // Detect simulation completion
  useEffect(() => {
    if (phase === 'drone_flight' && simulation.status === 'complete') {
      setPhase('complete')
    }
  }, [phase, simulation.status])

  // Render based on phase
  const renderPhase = () => {
    switch (phase) {
      case 'idle':
        return (
          <div style={styles.idleContainer}>
            <div style={styles.idleMessage}>
              Waiting for simulation to start...
            </div>
            <div style={styles.idleHint}>
              Click "Start Simulation" in the control panel
            </div>
          </div>
        )

      case 'route_creation_naive':
        return (
          <RouteCreationView
            progress={routeProgress}
            currentRoute="naive"
            showWindField={showWindField}
          />
        )

      case 'route_creation_optimized':
        return (
          <RouteCreationView
            progress={routeProgress}
            currentRoute="optimized"
            showWindField={showWindField}
          />
        )

      case 'transition':
        return (
          <>
            {/* Show final routes in background */}
            <RouteCreationView
              progress={1}
              currentRoute="optimized"
              showWindField={showWindField}
            />
            <TransitionOverlay
              message="Routes Computed"
              subtitle="Starting Flight Simulation..."
              accentColor="#4ecdc4"
              showSpinner={true}
            />
          </>
        )

      case 'drone_flight':
        return <DroneFlightView showWindField={showWindField} />

      case 'complete':
        return (
          <>
            <DroneFlightView showWindField={showWindField} />
            <MetricsPanel />
          </>
        )

      default:
        return null
    }
  }

  return (
    <div style={styles.container}>
      {renderPhase()}
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  idleContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
  },
  idleMessage: {
    fontSize: 24,
    fontWeight: 600,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  idleHint: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  phaseIndicator: {
    position: 'absolute',
    top: 60,
    right: 16,
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  phaseButtons: {
    display: 'flex',
    gap: 4,
  },
}
