/**
 * Simulation Clock Component
 * 
 * Displays a clock showing simulated time (starting at 11:20 AM)
 * that progresses with the simulation.
 */

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface SimulationClockProps {
  /** Current simulation time in seconds */
  simulationTime: number
  /** Starting hour (0-23) */
  startHour?: number
  /** Starting minute (0-59) */
  startMinute?: number
}

export default function SimulationClock({
  simulationTime,
  startHour = 11,
  startMinute = 20
}: SimulationClockProps) {
  const [displayTime, setDisplayTime] = useState({ hours: startHour, minutes: startMinute, seconds: 0 })

  useEffect(() => {
    // Calculate total seconds
    const totalSeconds = Math.floor(simulationTime)

    // Calculate time components
    const minutesElapsed = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    // Calculate new time
    const totalMinutes = startMinute + minutesElapsed
    const hours = (startHour + Math.floor(totalMinutes / 60)) % 24
    const minutes = totalMinutes % 60

    setDisplayTime({ hours, minutes, seconds })
  }, [simulationTime, startHour, startMinute])

  // Format time as HH:MM:SS AM/PM
  const formatTime = () => {
    const isPM = displayTime.hours >= 12
    const displayHours = displayTime.hours % 12 || 12
    const displayMinutes = displayTime.minutes.toString().padStart(2, '0')
    const displaySeconds = displayTime.seconds.toString().padStart(2, '0')
    const period = isPM ? 'PM' : 'AM'

    return `${displayHours}:${displayMinutes}:${displaySeconds} ${period}`
  }

  return (
    <div style={styles.container}>
      <Clock size={16} style={styles.icon} />
      <span style={styles.time}>{formatTime()}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(5px)',
    borderRadius: '8px',
    color: '#4ecdc4',
    fontSize: '16px',
    fontWeight: 600,
    fontFamily: 'monospace',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    zIndex: 1000,
  },
  icon: {
    color: '#4ecdc4',
  },
  time: {
    letterSpacing: '0.05em',
  },
}
