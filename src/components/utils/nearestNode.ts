// src/utils/nearestNode.ts

// src/utils/nearestNode.ts
import type {OsmGraph} from '../../types/graph';
import { haversineKm } from '../../algorithms/haversine';

export function findNearestNode(
    graph: OsmGraph | null,
    lat: number,
    lng: number
): { nodeId: string; distanceKm: number } | null {
    if (!graph || !graph.nodes.length) return null;

    let bestId = graph.nodes[0].id;
    let bestDist = haversineKm(
        [lat, lng],
        [graph.nodes[0].lat, graph.nodes[0].lng]
    );

    for (const n of graph.nodes) {
        const d = haversineKm([lat, lng], [n.lat, n.lng]);
        if (d < bestDist) {
            bestDist = d;
            bestId = n.id;
        }
    }

    return { nodeId: bestId, distanceKm: bestDist };
}
