import i18n from '../i18n';
import { Coordinates, Building } from '../types';

interface CacheEntry {
  name: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

type BattleGridBBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type BattleGrid = {
  width: number;
  height: number;
  cost: Uint8Array;
  bbox: BattleGridBBox;
};

type BattleGridOptions = {
  center: Coordinates;
  gridSize: number;
  worldMeters?: number;
};

type OverpassWay = {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

export interface LocationInfo {
  name: string;
  road?: string;
  suburb?: string;
  neighborhood?: string;
  feature?: string; // specific building/POI name
  type?: string;    // highway, shop, etc.
  category?: string;
  isUrban: boolean;
}

// Round coordinates to ~10m precision to increase cache hits
const getCacheKey = (coords: Coordinates) => {
  return `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
};

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1s to be safe (OSM limit is 1s)

const throttleRequest = async () => {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
  }
  lastRequestTime = Date.now();
};

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.nxtos.glitch.me/api/interpreter'
];

let currentMirrorIndex = 0;

const fetchWithFallback = async (query: string, timeoutMs: number = 10000): Promise<any> => {
  let lastError: Error | null = null;
  
  // Try up to 3 mirrors
  for (let i = 0; i < 3; i++) {
    const mirror = OVERPASS_MIRRORS[(currentMirrorIndex + i) % OVERPASS_MIRRORS.length];
    const url = `${mirror}?data=${encodeURIComponent(query)}`;
    
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      
      if (response.ok) {
        currentMirrorIndex = (currentMirrorIndex + i) % OVERPASS_MIRRORS.length;
        return await response.json();
      }
      
      throw new Error(`Overpass Mirror ${mirror} failed: ${response.status}`);
    } catch (error: any) {
      console.warn(`Mirror ${mirror} failed, trying next...`, error);
      lastError = error;
    }
  }
  
  throw lastError || new Error('All Overpass mirrors failed');
};

const battleGridCache = new Map<string, { grid: BattleGrid; timestamp: number }>();

const getBattleGridCacheKey = (opts: BattleGridOptions) => {
  const worldMeters = opts.worldMeters ?? 1024;
  return `${opts.center.lat.toFixed(5)},${opts.center.lng.toFixed(5)}|${opts.gridSize}|${worldMeters}`;
};

const metersToLatDegrees = (meters: number) => meters / 111_320;

const metersToLonDegrees = (meters: number, atLat: number) => {
  const latRad = (atLat * Math.PI) / 180;
  const denom = 111_320 * Math.max(0.2, Math.cos(latRad));
  return meters / denom;
};

const computeBBox = (center: Coordinates, worldMeters: number): BattleGridBBox => {
  const half = worldMeters * 0.5;
  const dLat = metersToLatDegrees(half);
  const dLon = metersToLonDegrees(half, center.lat);
  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lng - dLon,
    east: center.lng + dLon,
  };
};

const clampInt = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v | 0));

const lonLatToGrid = (bbox: BattleGridBBox, width: number, height: number, lon: number, lat: number) => {
  const x = ((lon - bbox.west) / (bbox.east - bbox.west)) * width;
  const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * height;
  return { x, y };
};

const pointInPolygon = (px: number, py: number, poly: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const rasterizePolygonAsWalls = (cost: Uint8Array, width: number, height: number, points: Array<{ x: number; y: number }>) => {
  if (points.length < 3) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;

  const x0 = clampInt(Math.floor(minX - 1), 0, width - 1);
  const y0 = clampInt(Math.floor(minY - 1), 0, height - 1);
  const x1 = clampInt(Math.ceil(maxX + 1), 0, width - 1);
  const y1 = clampInt(Math.ceil(maxY + 1), 0, height - 1);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (pointInPolygon(cx, cy, points)) {
        cost[y * width + x] = 255;
      }
    }
  }
};

const rasterizePolylineAsWalkable = (
  cost: Uint8Array,
  width: number,
  height: number,
  points: Array<{ x: number; y: number }>,
  radiusCells: number,
) => {
  if (points.length < 2) return;
  const r = Math.max(0, Math.min(6, radiusCells | 0));

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      const gx = clampInt(Math.floor(x), 0, width - 1);
      const gy = clampInt(Math.floor(y), 0, height - 1);

      for (let oy = -r; oy <= r; oy++) {
        const yy = gy + oy;
        if (yy < 0 || yy >= height) continue;
        for (let ox = -r; ox <= r; ox++) {
          const xx = gx + ox;
          if (xx < 0 || xx >= width) continue;
          cost[yy * width + xx] = 0;
        }
      }
    }
  }
};

const roadRadiusCells = (highway: string | undefined) => {
  if (!highway) return 1;
  if (highway === 'motorway' || highway === 'trunk') return 3;
  if (highway === 'primary' || highway === 'secondary') return 2;
  if (highway === 'tertiary') return 2;
  if (highway === 'residential' || highway === 'unclassified') return 1;
  if (highway === 'service' || highway === 'living_street') return 1;
  if (highway === 'pedestrian' || highway === 'footway' || highway === 'path' || highway === 'cycleway') return 1;
  return 1;
};

const overpassBBox = (bbox: BattleGridBBox) => `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

const isTaggedWay = (w: OverpassWay, tagKey: string) => {
  const tags = w.tags || {};
  return typeof tags[tagKey] === 'string' && tags[tagKey].length > 0;
};

export const mapDataService = {
  async getLocationInfo(coords: Coordinates): Promise<LocationInfo | null> {
    const key = getCacheKey(coords);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      try {
        return JSON.parse(cached.name) as LocationInfo;
      } catch {
        return { name: cached.name, isUrban: false };
      }
    }

    try {
      await throttleRequest();
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&zoom=18&addressdetails=1`;
      
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'User-Agent': 'Zombie-Crisis-Game-Bot'
        }
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      const address = data.address;
      
      if (!address) return null;

      const info: LocationInfo = {
        name: data.display_name.split(',')[0],
        road: address.road || address.pedestrian,
        suburb: address.suburb || address.neighborhood || address.neighbourhood,
        neighborhood: address.neighborhood || address.neighbourhood,
        feature: data.name || address.amenity || address.shop || address.tourism || address.building,
        type: data.type,
        category: data.category,
        isUrban: !!(address.city || address.town || address.village || address.suburb || address.neighbourhood || address.residential || address.road || address.pedestrian)
      };

      // Flatten name to something short and readable
      info.name = info.feature || info.road || info.suburb || data.display_name.split(',')[0];

      cache.set(key, { name: JSON.stringify(info), timestamp: Date.now() });
      return info;
    } catch (error) {
      console.error('MapDataService Error:', error);
      return null;
    }
  },

  async getNearbyLocationName(coords: Coordinates): Promise<string | null> {
    const info = await this.getLocationInfo(coords);
    return info ? info.name : null;
  },

  async getNearbyFeatures(coords: Coordinates): Promise<string[]> {
    try {
      await throttleRequest();
      // Overpass API is better for getting a list of features
      // Query nodes with names within 500m
      const query = `[out:json];node(around:500,${coords.lat},${coords.lng})[name];out;`;
      const data = await fetchWithFallback(query);
      
      const names = data.elements
        .map((e: any) => e.tags.name)
        .filter((name: string) => name && name.length > 1);
        
      // Remove duplicates
      return Array.from(new Set(names)) as string[];
    } catch (error) {
      console.error('Overpass Error:', error);
      return [];
    }
  },

  async getBuildingGeometries(coords: Coordinates): Promise<Building[]> {
    try {
      await throttleRequest();
      // Fetch buildings within 400m
      const query = `[out:json];(way(around:400,${coords.lat},${coords.lng})[building];);out geom;`;
      const data = await fetchWithFallback(query, 15000); // Higher timeout for complex geometries
      
      const buildings: Building[] = data.elements
        .filter((e: any) => e.type === 'way' && e.geometry)
        .map((e: any) => ({
          id: `building-${e.id}`,
          geometry: e.geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon })),
          tags: e.tags || {},
          name: e.tags?.[`name:${i18n.language.split('-')[0]}`] || e.tags?.name || e.tags?.['name:zh'] || e.tags?.['name:en'] || 'UNNAMED_BUILDING',
          type: e.tags?.building || 'building'
        }));
        
      return buildings;
    } catch (error) {
      console.error('getBuildingGeometries Error:', error);
      return [];
    }
  },

  async searchCities(query: string): Promise<any[]> {
    try {
      await throttleRequest();
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
      
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'User-Agent': 'Zombie-Crisis-Game-Bot'
        }
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      return data.map((item: any) => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      }));
    } catch (error) {
      console.error('searchCities Error:', error);
      return [];
    }
  },

  async getBattleGridFromOSM(opts: BattleGridOptions): Promise<BattleGrid> {
    const worldMeters = opts.worldMeters ?? 1024;
    const gridSize = Math.max(24, Math.min(128, Math.floor(opts.gridSize)));
    const cacheKey = getBattleGridCacheKey({ ...opts, gridSize, worldMeters });
    const cached = battleGridCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const { grid } = cached;
      return { ...grid, cost: grid.cost.slice() };
    }

    const bbox = computeBBox(opts.center, worldMeters);

    await throttleRequest();
    const query = `[out:json][timeout:25];(way["building"](${overpassBBox(bbox)});way["highway"](${overpassBBox(bbox)});way["natural"="water"](${overpassBBox(bbox)});way["waterway"="riverbank"](${overpassBBox(bbox)}););out geom;`;
    const data = await fetchWithFallback(query, 20_000);
    const elements: OverpassWay[] = Array.isArray(data?.elements) ? data.elements : [];

    const cost = new Uint8Array(gridSize * gridSize);
    cost.fill(0);

    const buildings: OverpassWay[] = [];
    const water: OverpassWay[] = [];
    const highways: OverpassWay[] = [];
    for (const el of elements) {
      if (el?.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
      if (isTaggedWay(el, 'building')) buildings.push(el);
      else if ((el.tags?.natural === 'water') || (el.tags?.waterway === 'riverbank')) water.push(el);
      else if (isTaggedWay(el, 'highway')) highways.push(el);
    }

    const rasterizeWayPolygon = (way: OverpassWay) => {
      const geom = way.geometry;
      if (!geom || geom.length < 3) return;
      const pts = geom.map((pt) => lonLatToGrid(bbox, gridSize, gridSize, pt.lon, pt.lat));
      rasterizePolygonAsWalls(cost, gridSize, gridSize, pts);
    };

    for (const w of water) rasterizeWayPolygon(w);
    for (const b of buildings) rasterizeWayPolygon(b);

    for (const h of highways) {
      const geom = h.geometry;
      if (!geom || geom.length < 2) continue;
      const pts = geom.map((pt) => lonLatToGrid(bbox, gridSize, gridSize, pt.lon, pt.lat));
      rasterizePolylineAsWalkable(cost, gridSize, gridSize, pts, roadRadiusCells(h.tags?.highway));
    }

    const grid: BattleGrid = { width: gridSize, height: gridSize, cost, bbox };
    battleGridCache.set(cacheKey, { grid: { ...grid, cost: cost.slice() }, timestamp: Date.now() });
    return grid;
  }
};
