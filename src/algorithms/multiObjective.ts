// src/algorithms/multiObjective.ts

import {type OsmGraph, type OsmEdge, buildAdjacency } from '../types/graph';

export type CriteriaVector = {
    distance: number;
    time: number;
    cost: number;
};

export type Label = {
    nodeId: string;
    costs: CriteriaVector;
    prevNodeId?: string;
    viaEdgeId?: string;
    parentLabel?: Label;
};

export type MultiObjectiveResult = {
    labels: Label[];
};

function addCosts(a: CriteriaVector, b: CriteriaVector): CriteriaVector {
    return {
        distance: a.distance + b.distance,
        time: a.time + b.time,
        cost: a.cost + b.cost,
    };
}

// true, якщо a домінує b
export function dominates(a: CriteriaVector, b: CriteriaVector): boolean {
    const notWorse =
        a.distance <= b.distance &&
        a.time     <= b.time &&
        a.cost     <= b.cost;

    const strictlyBetter =
        a.distance < b.distance ||
        a.time     < b.time ||
        a.cost     < b.cost;

    return notWorse && strictlyBetter;
}

export function multiObjectiveLabelSetting(
    graph: OsmGraph,
    startId: string,
    endId: string
): MultiObjectiveResult {
    const adj = buildAdjacency(graph);

    const labelsAtNode = new Map<string, Label[]>();

    const startLabel: Label = {
        nodeId: startId,
        costs: { distance: 0, time: 0, cost: 0 },
    };

    labelsAtNode.set(startId, [startLabel]);

    const queue: Label[] = [startLabel];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const outgoing: OsmEdge[] = adj.get(current.nodeId) ?? [];

        for (const edge of outgoing) {
            const edgeCosts: CriteriaVector = {
                distance: edge.distance,
                time: edge.time,
                cost: edge.cost,
            };

            const newCosts = addCosts(current.costs, edgeCosts);

            const newLabel: Label = {
                nodeId: edge.target,
                costs: newCosts,
                prevNodeId: current.nodeId,
                viaEdgeId: edge.id,
                parentLabel: current,
            };

            const existing = labelsAtNode.get(edge.target) ?? [];

            // 1) доминирует ли кто-то новую метку?
            let dominatedByExisting = false;
            for (const oldLabel of existing) {
                if (dominates(oldLabel.costs, newLabel.costs)) {
                    dominatedByExisting = true;
                    break;
                }
            }
            if (dominatedByExisting) continue;

            // 2) удаляем метки, которые доминируются новой
            const filtered = existing.filter(
                (oldLabel) => !dominates(newLabel.costs, oldLabel.costs)
            );

            filtered.push(newLabel);
            labelsAtNode.set(edge.target, filtered);

            // 3) добавляем в очередь
            queue.push(newLabel);
        }
    }

    return {
        labels: labelsAtNode.get(endId) ?? [],
    };
}

export function reconstructPath(label: Label): string[] {
    const path: string[] = [];
    let cur: Label | undefined = label;
    while (cur) {
        path.unshift(cur.nodeId);
        cur = cur.parentLabel;
    }
    return path;
}
