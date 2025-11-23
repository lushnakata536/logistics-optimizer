// src/algorithms/singleCriteria.ts

import {type OsmGraph, type OsmNode, type OsmEdge, buildAdjacency } from '../types/graph';
import { haversineKm } from './haversine';

export type PathTotals = {
    distance: number;
    time: number;
    cost: number;
};

export type PathResult = {
    path: string[];
    totalWeight: number;
    totals: PathTotals;
};

const SPEED_KMH_DEFAULT = 60;
const PRICE_PER_KM_DEFAULT = 1;

function edgeMetricsWithFallback(edge: OsmEdge, defaultDistKm?: number): PathTotals {
    const distance = edge.distance ?? (defaultDistKm ?? 0);
    const time = edge.time ?? (defaultDistKm != null ? defaultDistKm / SPEED_KMH_DEFAULT : 0);
    const cost = edge.cost ?? (defaultDistKm != null ? defaultDistKm * PRICE_PER_KM_DEFAULT : 0);

    return { distance, time, cost };
}

function edgeWeight(edge: OsmEdge, a: number, b: number, g: number, defaultDistKm?: number) {
    const { distance, time, cost } = edgeMetricsWithFallback(edge, defaultDistKm);
    return a * distance + b * time + g * cost;
}

function heuristicWeight(
    from: OsmNode,
    to: OsmNode,
    a: number,
    b: number,
    g: number
): number {
    const dist = haversineKm([from.lat, from.lng], [to.lat, to.lng]);
    const time = dist / SPEED_KMH_DEFAULT;
    const cost = dist * PRICE_PER_KM_DEFAULT;
    return a * dist + b * time + g * cost;
}

export function runDijkstra(
    graph: OsmGraph,
    startId: string,
    endId: string,
    alpha: number,
    beta: number,
    gamma: number
): PathResult | null {
    const adj = buildAdjacency(graph);
    const byId = new Map<string, OsmNode>(graph.nodes.map(n => [n.id, n]));

    const start = byId.get(startId);
    const goal = byId.get(endId);
    if (!start || !goal) return null;

    const dist: Record<string, number> = {};
    const prev: Record<string, string | undefined> = {};
    const totalsD: Record<string, number> = {};
    const totalsT: Record<string, number> = {};
    const totalsC: Record<string, number> = {};

    const Q = new Set<string>(graph.nodes.map(n => n.id));

    for (const n of graph.nodes) {
        dist[n.id] = Infinity;
        totalsD[n.id] = 0;
        totalsT[n.id] = 0;
        totalsC[n.id] = 0;
    }
    dist[startId] = 0;

    while (Q.size) {
        let u: string | null = null;
        for (const id of Q) {
            if (u === null || dist[id] < dist[u]) u = id;
        }
        if (u === null) break;
        Q.delete(u);

        if (u === endId) break;

        const uNode = byId.get(u)!;
        const outs = adj.get(u) ?? [];

        for (const e of outs) {
            const vNode = byId.get(e.target);
            if (!vNode) continue;

            const defDist = haversineKm([uNode.lat, uNode.lng], [vNode.lat, vNode.lng]);
            const w = edgeWeight(e, alpha, beta, gamma, defDist);
            const alt = dist[u] + w;

            if (alt < dist[e.target]) {
                dist[e.target] = alt;
                prev[e.target] = u;

                const m = edgeMetricsWithFallback(e, defDist);
                totalsD[e.target] = totalsD[u] + m.distance;
                totalsT[e.target] = totalsT[u] + m.time;
                totalsC[e.target] = totalsC[u] + m.cost;
            }
        }
    }

    if (dist[endId] === Infinity && startId !== endId) return null;

    const path: string[] = [];
    let cur = endId;
    path.unshift(cur);
    while (cur !== startId) {
        const p = prev[cur];
        if (!p) break;
        cur = p;
        path.unshift(cur);
    }

    return {
        path,
        totalWeight: dist[endId],
        totals: {
            distance: totalsD[endId],
            time: totalsT[endId],
            cost: totalsC[endId],
        },
    };
}

export function runAStar(
    graph: OsmGraph,
    startId: string,
    endId: string,
    alpha: number,
    beta: number,
    gamma: number
): PathResult | null {
    const adj = buildAdjacency(graph);
    const byId = new Map<string, OsmNode>(graph.nodes.map(n => [n.id, n]));

    const start = byId.get(startId);
    const goal = byId.get(endId);
    if (!start || !goal) return null;

    const open = new Set<string>([startId]);
    const cameFrom: Record<string, string | undefined> = {};
    const gScore: Record<string, number> = {};
    const fScore: Record<string, number> = {};

    const totalsD: Record<string, number> = {};
    const totalsT: Record<string, number> = {};
    const totalsC: Record<string, number> = {};

    for (const n of graph.nodes) {
        gScore[n.id] = Infinity;
        fScore[n.id] = Infinity;
        totalsD[n.id] = 0;
        totalsT[n.id] = 0;
        totalsC[n.id] = 0;
    }

    gScore[startId] = 0;
    fScore[startId] = heuristicWeight(start, goal, alpha, beta, gamma);

    while (open.size) {
        let current = Array.from(open).reduce((x, y) =>
            fScore[x] < fScore[y] ? x : y
        );

        if (current === endId) break;

        open.delete(current);
        const curNode = byId.get(current)!;
        const outs = adj.get(current) ?? [];

        for (const e of outs) {
            const nextNode = byId.get(e.target);
            if (!nextNode) continue;

            const defDist = haversineKm([curNode.lat, curNode.lng], [nextNode.lat, nextNode.lng]);
            const w = edgeWeight(e, alpha, beta, gamma, defDist);
            const tentative = gScore[current] + w;

            if (tentative < (gScore[e.target] ?? Infinity)) {
                cameFrom[e.target] = current;
                gScore[e.target] = tentative;

                const m = edgeMetricsWithFallback(e, defDist);
                totalsD[e.target] = totalsD[current] + m.distance;
                totalsT[e.target] = totalsT[current] + m.time;
                totalsC[e.target] = totalsC[current] + m.cost;

                fScore[e.target] =
                    tentative + heuristicWeight(nextNode, goal, alpha, beta, gamma);
                open.add(e.target);
            }
        }
    }

    if (!cameFrom[endId] && startId !== endId) return null;

    const path: string[] = [];
    let cur = endId;
    path.unshift(cur);
    while (cur !== startId) {
        const p = cameFrom[cur];
        if (!p) break;
        cur = p;
        path.unshift(cur);
    }

    return {
        path,
        totalWeight: gScore[endId],
        totals: {
            distance: totalsD[endId],
            time: totalsT[endId],
            cost: totalsC[endId],
        },
    };
}
