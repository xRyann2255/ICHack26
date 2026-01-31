import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// You'll need to set your Mapbox token here or via environment variable
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE';

// London center coordinates
const LONDON_CENTER: [number, number] = [-0.1276, 51.5074];

// Generate sample wind turbulence data points around London
function generateSampleTurbulenceData(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const centerLng = LONDON_CENTER[0];
  const centerLat = LONDON_CENTER[1];

  // Create a grid of turbulence points
  const gridSize = 30;
  const spread = 0.05; // ~5km spread

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const lng = centerLng - spread + (i / gridSize) * spread * 2;
      const lat = centerLat - spread + (j / gridSize) * spread * 2;

      // Simulate turbulence patterns:
      // - Higher near "building clusters" (simulated with sin waves)
      // - Varies with position to create realistic patterns
      const distFromCenter = Math.sqrt(
        Math.pow(lng - centerLng, 2) + Math.pow(lat - centerLat, 2)
      );

      // Create interesting turbulence patterns
      const buildingEffect = Math.sin(lng * 500) * Math.cos(lat * 500) * 0.3;
      const streetCanyonEffect = Math.sin((lng + lat) * 300) * 0.2;
      const baseNoise = Math.random() * 0.3;
      const centralHighTurbulence = Math.max(0, 0.5 - distFromCenter * 10);

      const turbulenceIntensity = Math.min(1, Math.max(0,
        0.2 + buildingEffect + streetCanyonEffect + baseNoise + centralHighTurbulence
      ));

      features.push({
        type: 'Feature',
        properties: {
          turbulence: turbulenceIntensity,
          // Weight for heatmap (higher turbulence = more intensity)
          weight: turbulenceIntensity,
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

interface WindMapProps {
  className?: string;
}

export default function WindMap({ className }: WindMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [lng, setLng] = useState(LONDON_CENTER[0]);
  const [lat, setLat] = useState(LONDON_CENTER[1]);
  const [zoom, setZoom] = useState(13);
  const [pitch, setPitch] = useState(45);

  useEffect(() => {
    if (map.current) return; // Initialize map only once
    if (!mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11', // Dark style works well with heatmap
      center: [lng, lat],
      zoom: zoom,
      pitch: pitch, // 3D tilt angle
      bearing: -17.6, // Rotation angle
      antialias: true,
    });

    const currentMap = map.current;

    currentMap.on('move', () => {
      if (!currentMap) return;
      setLng(Number(currentMap.getCenter().lng.toFixed(4)));
      setLat(Number(currentMap.getCenter().lat.toFixed(4)));
      setZoom(Number(currentMap.getZoom().toFixed(2)));
      setPitch(Number(currentMap.getPitch().toFixed(0)));
    });

    currentMap.on('load', () => {
      setMapLoaded(true);

      // Add 3D terrain
      currentMap.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
      currentMap.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

      // Add 3D buildings layer
      const layers = currentMap.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      currentMap.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#1a1a2e',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.8,
          },
        },
        labelLayerId
      );

      // Add wind turbulence data source
      const turbulenceData = generateSampleTurbulenceData();
      currentMap.addSource('wind-turbulence', {
        type: 'geojson',
        data: turbulenceData,
      });

      // Add heatmap layer for wind turbulence
      currentMap.addLayer(
        {
          id: 'turbulence-heat',
          type: 'heatmap',
          source: 'wind-turbulence',
          maxzoom: 18,
          paint: {
            // Increase weight based on turbulence intensity
            'heatmap-weight': ['get', 'turbulence'],

            // Increase intensity as zoom level increases
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.5,
              15, 1.5,
            ],

            // Color gradient from blue (low) to red (high turbulence)
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 0, 0)',
              0.1, 'rgba(0, 50, 150, 0.4)',      // Dark blue - calm
              0.3, 'rgba(0, 150, 200, 0.6)',     // Cyan - light turbulence
              0.5, 'rgba(50, 200, 100, 0.7)',    // Green - moderate
              0.7, 'rgba(255, 200, 0, 0.8)',     // Yellow - elevated
              0.9, 'rgba(255, 100, 0, 0.9)',     // Orange - high
              1.0, 'rgba(255, 0, 50, 1)',        // Red - severe turbulence
            ],

            // Adjust radius by zoom level
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 15,
              13, 25,
              16, 40,
            ],

            // Opacity adjustment
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.8,
              16, 0.6,
            ],
          },
        },
        '3d-buildings' // Place heatmap below buildings
      );

      // Add sky layer for atmosphere effect
      currentMap.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15,
        },
      });
    });

    // Add navigation controls
    currentMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
    currentMap.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    return () => {
      currentMap.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Info overlay */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.75)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
          Wind Turbulence Map - London
        </div>
        <div>Lng: {lng} | Lat: {lat}</div>
        <div>Zoom: {zoom} | Pitch: {pitch}°</div>
        <div style={{ marginTop: '8px', opacity: 0.7, fontSize: '11px' }}>
          Drag to pan • Scroll to zoom • Right-drag to rotate
        </div>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '40px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.75)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        fontSize: '12px',
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Turbulence Intensity</div>
        <div style={{
          width: '150px',
          height: '12px',
          background: 'linear-gradient(to right, #003296, #0096c8, #32c864, #ffc800, #ff6400, #ff0032)',
          borderRadius: '4px',
          marginBottom: '4px',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* Loading indicator */}
      {!mapLoaded && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '20px 40px',
          borderRadius: '8px',
        }}>
          Loading map...
        </div>
      )}
    </div>
  );
}
