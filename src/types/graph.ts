// src/types/graph.ts

export type OsmNode = {
    id: string;      // ID вузла дорожнього графа
    lat: number;
    lng: number;
};

export type OsmEdge = {
    id: string;
    source: string;  // id вузла
    target: string;  // id вузла
    distance: number; // км
    time: number;     // год
    cost: number;     // грн / умовна вартість
    highwayType?: string;
    maxSpeedKmh?: number;
    oneWay?: boolean;
};

export type OsmGraph = {
    nodes: OsmNode[];
    edges: OsmEdge[];
    // опционально кешируем adjacency
    adj?: Map<string, OsmEdge[]>;
};

// Побудова adjacency-списку
export function buildAdjacency(graph: OsmGraph): Map<string, OsmEdge[]> {
    if (graph.adj) return graph.adj;

    const adj = new Map<string, OsmEdge[]>();

    for (const e of graph.edges) {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source)!.push(e);
    }

    graph.adj = adj;
    return adj;
}
