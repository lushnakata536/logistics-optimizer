// src/utils/legacyConverter.ts

// src/utils/legacyConverter.ts
import type {OsmGraph, OsmNode, OsmEdge} from '../../types/graph';

// Типы, совместимые с твоей курсовой
export type LegacyElementNode = { data: { id: string; label?: string; lat: number; lng: number } };
export type LegacyElementEdge = { data: { source: string; target: string; distance?: number; time?: number; cost?: number; label?: string } };
export type LegacyElement = LegacyElementNode | LegacyElementEdge;

export function isLegacyNode(el: LegacyElement): el is LegacyElementNode {
    return (el as any).data?.id !== undefined && (el as any).data?.lat !== undefined;
}

export function isLegacyEdge(el: LegacyElement): el is LegacyElementEdge {
    return (el as any).data?.source !== undefined && (el as any).data?.target !== undefined;
}

export function convertLegacyElementsToOsmGraph(elements: LegacyElement[]): OsmGraph {
    const nodes: OsmNode[] = [];
    const edges: OsmEdge[] = [];

    for (const el of elements) {
        if (isLegacyNode(el)) {
            nodes.push({
                id: el.data.id,
                lat: el.data.lat,
                lng: el.data.lng,
            });
        } else if (isLegacyEdge(el)) {
            const d = el.data.distance ?? 0;
            const t = el.data.time ?? 0;
            const c = el.data.cost ?? 0;
            edges.push({
                id: `${el.data.source}-${el.data.target}`,
                source: el.data.source,
                target: el.data.target,
                distance: d,
                time: t,
                cost: c,
            });
        }
    }

    return { nodes, edges };
}
