import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Simple MapLibre map showing branches heat by orderCount
const BranchMap = ({ branches = [] }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const fallbackStyleUrl = 'https://demotiles.maplibre.org/style.json';

  // Build GeoJSON from branches
  const buildGeoJson = () => ({
    type: 'FeatureCollection',
    features: branches.map((b) => ({
      type: 'Feature',
      properties: {
        name: b.province,
        orderCount: b.orderCount || 0,
      },
      geometry: {
        type: 'Point',
        coordinates: [b.lng, b.lat],
      },
    })),
  });

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const customStyle = (import.meta.env.VITE_VIETMAP_STYLE_URL || '').trim();
    const styleUrl = customStyle || fallbackStyleUrl;

    mapRef.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: [106, 16],
      zoom: 5,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    mapRef.current.on('load', () => {
      const data = buildGeoJson();

      mapRef.current.addSource('branches', {
        type: 'geojson',
        data,
      });

      // Heat layer to tint vùng xung quanh marker (đỏ đậm khi nhiều đơn)
      mapRef.current.addLayer({
        id: 'branches-heat',
        type: 'heatmap',
        source: 'branches',
        maxzoom: 12,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'orderCount'], 0, 0, 50, 1],
          'heatmap-intensity': 1,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(255,59,48,0)',
            0.2,
            'rgba(255,59,48,0.25)',
            0.4,
            'rgba(255,59,48,0.45)',
            0.6,
            'rgba(255,59,48,0.65)',
            0.8,
            'rgba(255,59,48,0.85)',
            1,
            'rgba(139,0,0,1)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 20, 10, 50],
          'heatmap-opacity': 0.8,
        },
      });

      // Circle markers: đỏ đậm khi nhiều order
      mapRef.current.addLayer({
        id: 'branches-circle',
        type: 'circle',
        source: 'branches',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'orderCount'],
            0,
            6,
            50,
            20,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'orderCount'],
            0,
            '#e67683ff',
            10,
            '#a7031bff',
            50,
            '#380000ff',
          ],
          'circle-opacity': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // Label for city + orderCount
      mapRef.current.addLayer({
        id: 'branches-label',
        type: 'symbol',
        source: 'branches',
        layout: {
          'text-field': ['format', ['get', 'name'], '\n', ['get', 'orderCount'], ' orders'],
          'text-size': 12,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-font': ['Noto Sans Regular'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ff2222ff',
          'text-halo-color': '#fbfbfbff',
          'text-halo-width': 1.5,
        },
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data when branches change
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('branches');
    if (source && source.setData) {
      source.setData(buildGeoJson());
    }
  }, [branches]);

  return (
    <div className="relative">
      <div
        ref={mapContainer}
        className="w-full rounded-xl border border-stone-200 overflow-hidden"
        style={{ minHeight: 360 }}
      />
      {!branches?.length && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-500 bg-white/70">
          No branch data available
        </div>
      )}
    </div>
  );
};

export default BranchMap;
