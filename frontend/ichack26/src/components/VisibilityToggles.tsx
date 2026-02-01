/**
 * Visibility Toggles component for showing/hiding scene elements.
 *
 * Controls visibility of wind field, paths, drones, terrain, etc.
 */

import { useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface VisibilityState {
  windField: boolean;
  naivePath: boolean;
  optimizedPath: boolean;
  naiveDrone: boolean;
  optimizedDrone: boolean;
  terrain: boolean;
  waypoints: boolean;
  effects: boolean;
}

interface VisibilityTogglesProps {
  visibility: VisibilityState;
  onChange: (visibility: VisibilityState) => void;
}

// ============================================================================
// Toggle Configuration
// ============================================================================

interface ToggleConfig {
  key: keyof VisibilityState;
  label: string;
  color: string;
  group: 'elements' | 'routes' | 'drones' | 'effects';
}

const TOGGLES: ToggleConfig[] = [
  { key: 'terrain', label: 'Terrain', color: '#667788', group: 'elements' },
  { key: 'windField', label: 'Wind Field', color: '#4a9eff', group: 'elements' },
  { key: 'waypoints', label: 'Waypoints', color: '#ffd93d', group: 'elements' },
  { key: 'naivePath', label: 'Naive Path', color: '#ff6b6b', group: 'routes' },
  { key: 'optimizedPath', label: 'Optimized Path', color: '#4ecdc4', group: 'routes' },
  { key: 'naiveDrone', label: 'Naive Drone', color: '#ff6b6b', group: 'drones' },
  { key: 'optimizedDrone', label: 'Optimized Drone', color: '#4ecdc4', group: 'drones' },
  { key: 'effects', label: 'Post-Processing', color: '#bf7fff', group: 'effects' },
];

// ============================================================================
// Component
// ============================================================================

export default function VisibilityToggles({
  visibility,
  onChange,
}: VisibilityTogglesProps) {
  // Toggle a single visibility option
  const handleToggle = useCallback(
    (key: keyof VisibilityState) => {
      onChange({ ...visibility, [key]: !visibility[key] });
    },
    [visibility, onChange]
  );

  // Toggle all in a group
  const handleGroupToggle = useCallback(
    (group: 'elements' | 'routes' | 'drones' | 'effects', enabled: boolean) => {
      const groupKeys = TOGGLES.filter((t) => t.group === group).map((t) => t.key);
      const updates: Partial<VisibilityState> = {};
      groupKeys.forEach((key) => {
        updates[key] = enabled;
      });
      onChange({ ...visibility, ...updates });
    },
    [visibility, onChange]
  );

  // Check if all items in a group are visible
  const isGroupAllVisible = (group: 'elements' | 'routes' | 'drones' | 'effects') => {
    const groupToggles = TOGGLES.filter((t) => t.group === group);
    return groupToggles.every((t) => visibility[t.key]);
  };

  // Render toggles for a group
  const renderGroup = (group: 'elements' | 'routes' | 'drones' | 'effects', title: string) => {
    const groupToggles = TOGGLES.filter((t) => t.group === group);
    const allVisible = isGroupAllVisible(group);

    // For single-item groups, don't show the "Show All" button
    const showGroupToggle = groupToggles.length > 1;

    return (
      <div style={styles.group} key={group}>
        <div style={styles.groupHeader}>
          <span style={styles.groupTitle}>{title}</span>
          {showGroupToggle && (
            <button
              style={styles.groupToggle}
              onClick={() => handleGroupToggle(group, !allVisible)}
              title={allVisible ? 'Hide all' : 'Show all'}
            >
              {allVisible ? 'Hide All' : 'Show All'}
            </button>
          )}
        </div>
        <div style={styles.toggleList}>
          {groupToggles.map((toggle) => (
            <Toggle
              key={toggle.key}
              label={toggle.label}
              color={toggle.color}
              checked={visibility[toggle.key]}
              onChange={() => handleToggle(toggle.key)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Visibility</span>
      </div>
      <div style={styles.content}>
        {renderGroup('elements', 'Scene Elements')}
        {renderGroup('routes', 'Flight Paths')}
        {renderGroup('drones', 'Drones')}
        {renderGroup('effects', 'Visual Effects')}
      </div>
    </div>
  );
}

// ============================================================================
// Toggle Component
// ============================================================================

interface ToggleProps {
  label: string;
  color: string;
  checked: boolean;
  onChange: () => void;
}

function Toggle({ label, color, checked, onChange }: ToggleProps) {
  return (
    <label style={styles.toggle}>
      <div
        style={{
          ...styles.toggleSwitch,
          backgroundColor: checked ? color : 'rgba(255, 255, 255, 0.1)',
        }}
        onClick={onChange}
      >
        <div
          style={{
            ...styles.toggleKnob,
            transform: checked ? 'translateX(16px)' : 'translateX(2px)',
          }}
        />
      </div>
      <span
        style={{
          ...styles.toggleLabel,
          color: checked ? '#fff' : '#666',
        }}
      >
        {label}
      </span>
      <div
        style={{
          ...styles.colorDot,
          backgroundColor: color,
          opacity: checked ? 1 : 0.3,
        }}
      />
    </label>
  );
}

// ============================================================================
// Default Visibility State
// ============================================================================

export const DEFAULT_VISIBILITY: VisibilityState = {
  windField: false,
  naivePath: true,
  optimizedPath: true,
  naiveDrone: true,
  optimizedDrone: true,
  terrain: true,
  waypoints: false,
  effects: true,
};

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 16,
    right: 200,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 12,
    minWidth: 200,
    zIndex: 1000,
    backdropFilter: 'blur(5px)',
  },
  header: {
    padding: 12,
    borderBottom: '1px solid #333',
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: '#fff',
  },
  content: {
    padding: 12,
  },
  group: {
    marginBottom: 12,
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  groupToggle: {
    padding: '2px 6px',
    border: 'none',
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#888',
    cursor: 'pointer',
    fontSize: 9,
    transition: 'all 0.2s',
  },
  toggleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    padding: '4px 0',
  },
  toggleSwitch: {
    width: 34,
    height: 18,
    borderRadius: 9,
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    width: 14,
    height: 14,
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
  },
  toggleLabel: {
    flex: 1,
    fontSize: 12,
    transition: 'color 0.2s',
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    transition: 'opacity 0.2s',
  },
};
