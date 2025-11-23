// src/osm/overpass.ts

// src/osm/overpass.ts
import type {OsmGraph, OsmNode, OsmEdge} from '../types/graph';
import { haversineKm } from '../algorithms/haversine';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// bbox вокруг точки (в градусах)
function makeBBox(lat: number, lng: number, radiusKm: number) {
    const dLat = radiusKm / 111; // ~111 км на градус широты
    const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
    const south = lat - dLat;
    const north = lat + dLat;
    const west = lng - dLon;
    const east = lng + dLon;
    return { south, west, north, east };
}

/**
 * Загружает дорожний граф вокруг точки lat/lng.
 * radiusKm – радиус в км (1–3 для города).
 */
export async function loadRoadGraphAround(
    lat: number,
    lng: number,
    radiusKm = 2
): Promise<OsmGraph> {
    const { south, west, north, east } = makeBBox(lat, lng, radiusKm);

    // Overpass-запрос: все дороги (highway) в bbox
    const query = `
    [out:json][timeout:25];
    (
      way["highway"](${south},${west},${north},${east});
    );
    (._;>;);
    out body;
  `;

    // ВАЖНО: используем GET и параметр data= (так Overpass ожидает)
    const params = new URLSearchParams({ data: query });
    const url = `${OVERPASS_URL}?${params.toString()}`;

    console.log('[OSM] Requesting graph:', url);

    const res = await fetch(url, {
        method: 'GET',
    });

    if (!res.ok) {
        throw new Error(`Overpass error: ${res.status} ${res.statusText}`);
    }

    let data: any;
    try {
        data = await res.json();
    } catch (e) {
        console.error('[OSM] Failed to parse JSON from Overpass', e);
        throw new Error('Не вдалося розпарсити відповідь Overpass як JSON');
    }

    if (!data || !Array.isArray(data.elements)) {
        console.error('[OSM] Unexpected Overpass response:', data);
        throw new Error('Overpass повернув неочікуваний формат даних');
    }

    console.log('[OSM] elements:', data.elements.length);

    // --- Разбор ответов Overpass ---

    const nodeMap = new Map<number, { lat: number; lng: number }>();
    const ways: { id: number; nodes: number[]; tags?: any }[] = [];

    for (const el of data.elements as any[]) {
        if (el.type === 'node') {
            nodeMap.set(el.id, { lat: el.lat, lng: el.lon });
        } else if (el.type === 'way' && Array.isArray(el.nodes)) {
            ways.push({ id: el.id, nodes: el.nodes, tags: el.tags });
        }
    }

    if (!ways.length) {
        console.warn('[OSM] No highway ways returned for this bbox');
    }

    const nodes: OsmNode[] = [];
    const edges: OsmEdge[] = [];

    const usedNodeIds = new Set<number>();
    ways.forEach((w) => w.nodes.forEach((nid) => usedNodeIds.add(nid)));

    for (const nid of usedNodeIds) {
        const coords = nodeMap.get(nid);
        if (!coords) continue;
        nodes.push({
            id: String(nid),
            lat: coords.lat,
            lng: coords.lng,
        });
    }

    // простая модель скорости по типу дороги
    function speedFromTags(tags: any): number {
        if (!tags) return 40;
        if (tags.maxspeed) {
            const m = String(tags.maxspeed).match(/(\d+)/);
            if (m) return parseInt(m[1], 10);
        }
        if (tags.highway === 'motorway') return 100;
        if (tags.highway === 'trunk') return 90;
        if (tags.highway === 'primary') return 70;
        if (tags.highway === 'secondary') return 60;
        if (tags.highway === 'tertiary') return 50;
        if (tags.highway === 'residential') return 40;
        return 40;
    }

    const edgeSet = new Set<string>();

    for (const way of ways) {
        const v = way.nodes;
        const speed = speedFromTags(way.tags);

        for (let i = 0; i < v.length - 1; i++) {
            const aId = v[i];
            const bId = v[i + 1];
            const a = nodeMap.get(aId);
            const b = nodeMap.get(bId);
            if (!a || !b) continue;

            const distKm = haversineKm([a.lat, a.lng], [b.lat, b.lng]);
            const timeH = distKm / speed;
            const cost = distKm;

            const edgeKey1 = `${aId}-${bId}`;
            const edgeKey2 = `${bId}-${aId}`;

            if (!edgeSet.has(edgeKey1)) {
                edges.push({
                    id: edgeKey1,
                    source: String(aId),
                    target: String(bId),
                    distance: distKm,
                    time: timeH,
                    cost,
                });
                edgeSet.add(edgeKey1);
            }

            if (!edgeSet.has(edgeKey2)) {
                edges.push({
                    id: edgeKey2,
                    source: String(bId),
                    target: String(aId),
                    distance: distKm,
                    time: timeH,
                    cost,
                });
                edgeSet.add(edgeKey2);
            }
        }
    }

    console.log('[OSM] Built graph:', { nodes: nodes.length, edges: edges.length });

    return { nodes, edges };
}
