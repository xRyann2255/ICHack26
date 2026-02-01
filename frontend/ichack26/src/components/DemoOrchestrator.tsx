/**
 * Demo Orchestrator Component
 *
 * Manages the multi-phase demo: route planning → route creation → drone flight.
 * State machine: idle → route_planning → route_creation → transition → drone_flight → complete
 */

import { useState, useEffect } from 'react'
import RouteCreationView from './RouteCreationView'
import DroneFlightView from './DroneFlightView'
import TransitionOverlay from './TransitionOverlay'
import RoutePlanningView from './RoutePlanningView'
import MetricsPanel from './MetricsPanel'
import SimulationClock from './SimulationClock'
import { useScene } from '../context/SceneContext'
import type { VisibilityState } from './VisibilityToggles'

// ============================================================================
// Types
// ============================================================================

export type DemoPhase =
  | 'idle'
  | 'route_planning'
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
  /** Callback when simulation starts (drone flight begins) */
  onSimulationStart?: () => void
  /** Callback when cinematic is complete */
  onCinematicComplete?: () => void
  /** Trigger to replay the cinematic */
  replayTrigger?: number
}

// ============================================================================
// Component
// ============================================================================

export default function DemoOrchestrator({
  autoStart = true,
  routeCreationSpeed = 0.008,
  transitionDuration = 2500,
  visibility,
  onSimulationStart,
  onCinematicComplete,
  replayTrigger,
}: DemoOrchestratorProps) {
  const { simulation, paths, routePlanningMode, enterPlanningMode, exitPlanningMode, resetSimulation, setPlaybackPaused, startSimulation } = useScene()

  // Demo state
  const [phase, setPhase] = useState<DemoPhase>('idle')
  const [routeProgress, setRouteProgress] = useState(0)
  const [lastReplayTrigger, setLastReplayTrigger] = useState(0)

  // Wind field visibility
  const showWindField = visibility?.windField ?? true

  // Handle replay - restart simulation immediately
  useEffect(() => {
    console.log('[DemoOrchestrator] Replay effect triggered:', { replayTrigger, phase, lastReplayTrigger })
    // Only trigger if replayTrigger has actually changed
    if (replayTrigger && replayTrigger > 0 && replayTrigger !== lastReplayTrigger && (phase === 'complete' || phase === 'drone_flight')) {
      console.log('[DemoOrchestrator] Replaying simulation')
      setLastReplayTrigger(replayTrigger)

      // Get start and end points from the existing paths
      if (paths && (paths.naive || paths.optimized)) {
        const pathToUse = paths.optimized || paths.naive
        if (pathToUse && pathToUse.length >= 2) {
          const start = pathToUse[0]
          const end = pathToUse[pathToUse.length - 1]

          console.log('[DemoOrchestrator] Restarting simulation with:', { start, end })

          // Reset local state
          resetSimulation()
          setPlaybackPaused(false)

          // Restart the simulation from the backend
          startSimulation(start, end, 'both')

          // Set phase to drone_flight (it will transition automatically when data arrives)
          setPhase('drone_flight')
        }
      }
    }
  }, [replayTrigger, phase, lastReplayTrigger, paths, resetSimulation, setPlaybackPaused, startSimulation])

  // Handle entering planning mode
  const handlePlanRoute = () => {
    enterPlanningMode()
    setPhase('route_planning')
  }

  // Handle planning a new route after completion
  const handlePlanNewRoute = () => {
    // enterPlanningMode() resets simulation state and sets routePlanningMode to 'selecting_start'
    // The effect watching routePlanningMode will then set phase to 'route_planning'
    enterPlanningMode()
    setPhase('route_planning')
  }

  // Transition to route_planning when context enters planning mode
  useEffect(() => {
    if (routePlanningMode !== 'idle' && phase === 'idle') {
      setPhase('route_planning')
    }
  }, [routePlanningMode, phase])

  // Handle cancel during planning (when routePlanningMode goes back to idle)
  useEffect(() => {
    if (routePlanningMode === 'idle' && phase === 'route_planning') {
      setPhase('idle')
    }
  }, [routePlanningMode, phase])

  // Start route creation when paths are received after planning
  useEffect(() => {
    // Only start if we're in route_planning phase AND actively calculating (user clicked "Calculate Route")
    // This prevents triggering on stale data from previous simulations
    if (paths && phase === 'route_planning' && routePlanningMode === 'calculating') {
      const isSimulationStarted = simulation.status === 'paths_received' ||
        simulation.status === 'simulating'
      const hasValidPaths = (paths.naive && paths.naive.length > 0) ||
        (paths.optimized && paths.optimized.length > 0)

      if (isSimulationStarted && hasValidPaths) {
        console.log('[DemoOrchestrator] Routes calculated, starting route creation', {
          status: simulation.status,
          naiveLength: paths.naive?.length,
          optimizedLength: paths.optimized?.length,
          phase,
          routePlanningMode
        })
        // Reset planning mode before transitioning
        exitPlanningMode()
        setPhase('route_creation_naive')
        setRouteProgress(0)
      }
    }
  }, [simulation.status, paths, phase, routePlanningMode, exitPlanningMode])

  // Legacy auto-start disabled - users should use the "Plan Route" button
  // useEffect(() => {
  //   if (autoStart && paths && phase === 'idle') {
  //     const isSimulationStarted = simulation.status === 'paths_received' ||
  //       simulation.status === 'simulating' ||
  //       simulation.status === 'complete'
  //     const hasValidPaths = (paths.naive && paths.naive.length > 0) ||
  //       (paths.optimized && paths.optimized.length > 0)
  //
  //     if (isSimulationStarted && hasValidPaths) {
  //       console.log('[DemoOrchestrator] Starting route creation (legacy auto-start)', {
  //         status: simulation.status,
  //         naiveLength: paths.naive?.length,
  //         optimizedLength: paths.optimized?.length,
  //         phase
  //       })
  //       setPhase('route_creation_naive')
  //       setRouteProgress(0)
  //     }
  //   }
  // }, [autoStart, simulation.status, paths, phase])

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
      // Call the callback to hide UI when simulation starts
      if (onSimulationStart) {
        onSimulationStart()
      }
    }, transitionDuration)

    return () => clearTimeout(timeout)
  }, [phase, transitionDuration, onSimulationStart])

  // Detect simulation completion
  useEffect(() => {
    if (phase === 'drone_flight' && simulation.status === 'complete') {
      setPhase('complete')
      // Notify parent that cinematic is complete
      if (onCinematicComplete) {
        onCinematicComplete()
      }
    }
  }, [phase, simulation.status, onCinematicComplete])

  // Render based on phase
  const renderPhase = () => {
    switch (phase) {
      case 'idle':
        return (
          <div style={styles.idleContainer}>
            <div style={styles.idleContent}>
              <div style={styles.idleTitle}>Wind-Aware Drone Routing</div>
              <div style={styles.idleSubtitle}>
                Compare naive vs. optimized flight paths through dynamic wind fields
              </div>
              <button style={styles.planRouteButton} onClick={handlePlanRoute}>
                Plan Route
              </button>
            </div>
          </div>
        )

      case 'route_planning':
        return <RoutePlanningView showWindField={showWindField} />

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
        return (
          <>
            <DroneFlightView showWindField={showWindField} />
            <SimulationClock
              simulationTime={simulation.currentFrame.optimized?.time || simulation.currentFrame.naive?.time || 0}
            />
          </>
        )

      case 'complete':
        return (
          <>
            <DroneFlightView showWindField={showWindField} />
            <MetricsPanel />
            <SimulationClock
              simulationTime={simulation.currentFrame.optimized?.time || simulation.currentFrame.naive?.time || 0}
            />
            <div style={styles.completeOverlay}>
              <button style={styles.newRouteButton} onClick={handlePlanNewRoute}>
                Plan New Route
              </button>
            </div>
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
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  },
  idleContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    padding: '40px',
  },
  idleTitle: {
    fontSize: 48,
    fontWeight: 700,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    textShadow: '0 4px 20px rgba(0,0,0,0.3)',
    textAlign: 'center',
  },
  idleSubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    textAlign: 'center',
    maxWidth: '500px',
    lineHeight: 1.5,
  },
  planRouteButton: {
    marginTop: '20px',
    padding: '18px 48px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: '#4ecdc4',
    color: '#000',
    fontSize: '18px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 8px 30px rgba(78, 205, 196, 0.4)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  idleMessage: {
    fontSize: 24,
    fontWeight: 600,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    textAlign: 'center',
    maxWidth: '500px',
    lineHeight: 1.5,
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
  completeOverlay: {
    position: 'absolute',
    bottom: 30,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
  },
  newRouteButton: {
    padding: '14px 32px',
    border: 'none',
    borderRadius: '10px',
    backgroundColor: 'rgba(78, 205, 196, 0.9)',
    color: '#000',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
}
