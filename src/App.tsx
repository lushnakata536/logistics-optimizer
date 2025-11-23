// src/App.tsx

import React, { useMemo, useState } from 'react';
import { Layout } from './components/layout/Layout';
import {
    MapView,
    type RoutePolyline,
    type ClickMode,
} from './components/map/MapView';
import { ControlPanel } from './components/panels/ControlPanel';
import { ResultsPanel } from './components/panels/ResultsPanel';

import type { OsmGraph } from './types/graph';
import type { ProblemPoint } from './types/problem';

import { findNearestNode } from './components/utils/nearestNode';
import { loadRoadGraphAround } from './osm/overpass';

import { runDijkstra, runAStar } from './algorithms/singleCriteria';
import {
    multiObjectiveLabelSetting,
    reconstructPath,
} from './algorithms/multiObjective';
import { kMeans, type ClusterResult } from './algorithms/clustering';

// ===== типы для многоклиентських маршрутів (видимі ResultsPanel) =====

export type AlgoId = 'dijkstra' | 'astar' | 'multi';

export type MultiClientAlgoResult = {
    algo: AlgoId;
    title: string;
    order: string[]; // порядок клієнтів (ID)
    path: string[]; // шлях у вузлах графа
    totals: { distance: number; time: number; cost: number };
    clusterIndex: number | null; // null – глобальний маршрут; >=0 – маршрут для кластера
};

// контекст для побудови маршруту
type GreedyContext = {
    graph: OsmGraph;
    depot: ProblemPoint;
    clientsSubset: ProblemPoint[];
    alpha: number;
    beta: number;
    gamma: number;
    clusterIndex: number | null;
};

// маленька пауза, щоб не блокувати UI між важкими кроками
function waitFrame() {
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ===== допоміжні побудовники маршрутів =====

// greedy-маршрут ТІЛЬКИ для Дейкстри або A*
function buildGreedyRouteForAlgo(
    ctx: GreedyContext,
    algo: 'dijkstra' | 'astar',
): MultiClientAlgoResult | null {
    const { graph, depot, clientsSubset, alpha, beta, gamma, clusterIndex } = ctx;

    if (clientsSubset.length === 0) return null;

    const nearestCache = new Map<string, string | null>();

    const getNearestNodeId = (p: ProblemPoint): string | null => {
        if (p.nearestNodeId) return p.nearestNodeId;
        if (nearestCache.has(p.id)) return nearestCache.get(p.id)!;
        const nearest = findNearestNode(graph, p.lat, p.lng);
        const nodeId = nearest?.nodeId ?? null;
        nearestCache.set(p.id, nodeId);
        return nodeId;
    };

    const depotNodeId = depot.nearestNodeId ?? getNearestNodeId(depot);
    if (!depotNodeId) return null;

    const remaining = [...clientsSubset];
    let currentNode = depotNodeId;

    const order: string[] = [];
    let fullPath: string[] = [depotNodeId];
    let totalD = 0;
    let totalT = 0;
    let totalC = 0;

    while (remaining.length > 0) {
        let bestIdx = -1;
        let bestScore = Infinity;
        let bestPathNodes: string[] = [];
        let bestStepD = 0;
        let bestStepT = 0;
        let bestStepC = 0;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            const candidateNodeId =
                candidate.nearestNodeId ?? getNearestNodeId(candidate);
            if (!candidateNodeId) continue;

            const run = algo === 'dijkstra' ? runDijkstra : runAStar;
            const res = run(graph, currentNode, candidateNodeId, alpha, beta, gamma);
            if (!res || res.path.length < 2) continue;

            const score = res.totalWeight;
            if (score < bestScore) {
                bestScore = score;
                bestIdx = i;
                bestPathNodes = res.path;
                bestStepD = res.totals.distance;
                bestStepT = res.totals.time;
                bestStepC = res.totals.cost;
            }
        }

        if (bestIdx === -1 || bestPathNodes.length < 2) break;

        const chosen = remaining[bestIdx];

        order.push(chosen.id);
        fullPath = [...fullPath, ...bestPathNodes.slice(1)];
        totalD += bestStepD;
        totalT += bestStepT;
        totalC += bestStepC;

        const chosenNodeId =
            chosen.nearestNodeId ?? getNearestNodeId(chosen);
        if (!chosenNodeId) break;
        currentNode = chosenNodeId;

        remaining.splice(bestIdx, 1);
    }

    if (order.length === 0) return null;

    const title =
        algo === 'dijkstra'
            ? 'Дейкстра'
            : 'A*';

    return {
        algo,
        title,
        order,
        path: fullPath,
        totals: { distance: totalD, time: totalT, cost: totalC },
        clusterIndex,
    };
}

// label-setting: НЕ робить власний greedy, а проходить по готовому порядку
function buildLabelSettingAlongOrder(
    ctx: GreedyContext,
    baseOrder: string[],
): MultiClientAlgoResult | null {
    const { graph, depot, clientsSubset, alpha, beta, gamma, clusterIndex } = ctx;

    if (!baseOrder.length) return null;

    const byId = new Map<string, ProblemPoint>(
        clientsSubset.map((c) => [c.id, c]),
    );

    const nearestCache = new Map<string, string | null>();

    const getNearestNodeId = (p: ProblemPoint): string | null => {
        if (p.nearestNodeId) return p.nearestNodeId;
        if (nearestCache.has(p.id)) return nearestCache.get(p.id)!;
        const nearest = findNearestNode(graph, p.lat, p.lng);
        const nodeId = nearest?.nodeId ?? null;
        nearestCache.set(p.id, nodeId);
        return nodeId;
    };

    const depotNodeId = depot.nearestNodeId ?? getNearestNodeId(depot);
    if (!depotNodeId) return null;

    let currentNode = depotNodeId;
    let fullPath: string[] = [depotNodeId];
    let totalD = 0;
    let totalT = 0;
    let totalC = 0;
    const effectiveOrder: string[] = [];

    for (const clientId of baseOrder) {
        const client = byId.get(clientId);
        if (!client) continue;

        const targetNodeId =
            client.nearestNodeId ?? getNearestNodeId(client);
        if (!targetNodeId) continue;

        const mo = multiObjectiveLabelSetting(graph, currentNode, targetNodeId);
        if (!mo.labels.length) continue;

        // вибираємо найкращу Парето-метку за α·d + β·t + γ·c
        let bestLbl = mo.labels[0];
        let bestScore =
            alpha * bestLbl.costs.distance +
            beta * bestLbl.costs.time +
            gamma * bestLbl.costs.cost;

        for (const lbl of mo.labels.slice(1)) {
            const sc =
                alpha * lbl.costs.distance +
                beta * lbl.costs.time +
                gamma * lbl.costs.cost;
            if (sc < bestScore) {
                bestScore = sc;
                bestLbl = lbl;
            }
        }

        const legPath = reconstructPath(bestLbl);
        if (legPath.length < 2) continue;

        fullPath = [...fullPath, ...legPath.slice(1)];
        totalD += bestLbl.costs.distance;
        totalT += bestLbl.costs.time;
        totalC += bestLbl.costs.cost;
        effectiveOrder.push(clientId);
        currentNode = targetNodeId;
    }

    if (!effectiveOrder.length) return null;

    return {
        algo: 'multi',
        title: 'Багатокритеріальний (label-setting)',
        order: effectiveOrder,
        path: fullPath,
        totals: { distance: totalD, time: totalT, cost: totalC },
        clusterIndex,
    };
}

// послідовний розрахунок маршрутів для трьох алгоритмів
async function computeGreedyRoutesForClients(
    ctx: GreedyContext,
    onProgress?: (msg: string) => void,
): Promise<MultiClientAlgoResult[]> {
    const res: MultiClientAlgoResult[] = [];

    // 1) Дейкстра – свій greedy-порядок
    onProgress?.('Дейкстра: побудова маршруту…');
    console.log('Computing Dijkstra greedy route...');
    await waitFrame();
    const dj = buildGreedyRouteForAlgo(ctx, 'dijkstra');
    console.log('Dijkstra greedy route:', dj);
    if (dj) res.push(dj);

    // 2) A* – свій greedy-порядок (незалежний від Дейкстри)
    onProgress?.('A*: побудова маршруту…');
    console.log('Computing A* greedy route...');
    await waitFrame();
    const as = buildGreedyRouteForAlgo(ctx, 'astar');
    console.log('A* greedy route:', as);
    if (as) res.push(as);

    // 3) Label-setting – проходить по порядку Дейкстри,
    //    але оптимізує багатокритеріальні відрізки між точками
    if (dj && dj.order.length) {
        onProgress?.('Label-setting: побудова маршруту…');
        console.log('Computing Label-setting along Dijkstra order...');
        await waitFrame();
        const mo = buildLabelSettingAlongOrder(ctx, dj.order);
        console.log('Label-setting route:', mo);
        if (mo) res.push(mo);
    }

    onProgress?.('Готово');
    return res;
}

// ================= сам компонент App =================

const App: React.FC = () => {
    const [graph, setGraph] = useState<OsmGraph | null>(null);

    const [depot, setDepot] = useState<ProblemPoint | null>(null);
    const [clients, setClients] = useState<ProblemPoint[]>([]);
    const [clientCounter, setClientCounter] = useState<number>(1);

    const [clickMode, setClickMode] = useState<ClickMode>('NONE');

    const [alpha, setAlpha] = useState<number>(1);
    const [beta, setBeta] = useState<number>(0);
    const [gamma, setGamma] = useState<number>(0);

    const [clusterK, setClusterK] = useState<number>(2);
    const [clusterResult, setClusterResult] = useState<ClusterResult | null>(null);

    const [graphRadiusKm, setGraphRadiusKm] = useState<number>(0.7);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphError, setGraphError] = useState<string | null>(null);

    const [multiClientResults, setMultiClientResults] = useState<
        MultiClientAlgoResult[]
    >([]);

    const [routeVisibility, setRouteVisibility] = useState<Record<AlgoId, boolean>>(
        {
            dijkstra: true,
            astar: true,
            multi: true,
        },
    );

    const [selectedRouteClientIds, setSelectedRouteClientIds] = useState<string[]>(
        [],
    );

    const [routingLoading, setRoutingLoading] = useState(false);
    const [routingMessage, setRoutingMessage] = useState<string | null>(null);

    // ---- завантаження OSM-графа навколо складу ----

    const handleLoadGraphAroundDepot = async () => {
        if (!depot) {
            alert('Спочатку додайте склад (режим «Склад» і клік по мапі).');
            return;
        }

        setGraphLoading(true);
        setGraphError(null);

        try {
            const g = await loadRoadGraphAround(depot.lat, depot.lng, graphRadiusKm);
            setGraph(g);
            setMultiClientResults([]);
        } catch (e: any) {
            console.error('[OSM] load error', e);
            setGraphError(e?.message ?? 'Помилка завантаження OSM-графа');
        } finally {
            setGraphLoading(false);
        }
    };

    // ---- додавання точок кліком по мапі ----

    const handleAddPointOnMap = (
        type: 'DEPOT' | 'CLIENT',
        lat: number,
        lng: number,
    ) => {
        const nearest = findNearestNode(graph, lat, lng);

        if (type === 'DEPOT') {
            setDepot({
                id: 'Depot',
                type: 'DEPOT',
                lat,
                lng,
                nearestNodeId: nearest?.nodeId,
                nearestNodeDistKm: nearest?.distanceKm,
            });
        } else {
            const id = `C${clientCounter}`;
            setClientCounter((c) => c + 1);
            setClients((prev) => [
                ...prev,
                {
                    id,
                    type: 'CLIENT',
                    lat,
                    lng,
                    nearestNodeId: nearest?.nodeId,
                    nearestNodeDistKm: nearest?.distanceKm,
                },
            ]);
        }

        setClickMode('NONE');
    };

    // ---- оновлення / видалення клієнтів, очистка складу ----

    const handleUpdateClient = (id: string, lat: number, lng: number) => {
        const nearest = findNearestNode(graph, lat, lng);
        setClients((prev) =>
            prev.map((c) =>
                c.id === id
                    ? {
                        ...c,
                        lat,
                        lng,
                        nearestNodeId: nearest?.nodeId,
                        nearestNodeDistKm: nearest?.distanceKm,
                    }
                    : c,
            ),
        );
    };

    const handleRemoveClient = (id: string) => {
        setClients((prev) => prev.filter((c) => c.id !== id));
        setSelectedRouteClientIds((prev) => prev.filter((x) => x !== id));
    };

    const handleClearDepot = () => {
        setDepot(null);
        setGraph(null);
        setMultiClientResults([]);
    };

    // ---- вибір клієнтів для глобального маршруту ----

    const handleToggleClientInRoute = (id: string) => {
        setSelectedRouteClientIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    // ---- глобальний маршрут: склад → обрані клієнти ----

    const handleRunMultiClientRoute = async () => {
        if (!graph) {
            alert(
                'Граф ще не завантажений. Спочатку натисніть «Завантажити граф навколо складу».',
            );
            return;
        }
        if (!depot) {
            alert('Спочатку додайте склад.');
            return;
        }
        if (selectedRouteClientIds.length === 0) {
            alert('Оберіть хоча б одного клієнта прапорцем «У маршруті».');
            return;
        }

        const subset = clients.filter((c) => selectedRouteClientIds.includes(c.id));
        if (subset.length === 0) {
            alert('Обрані клієнти не знайдені.');
            return;
        }

        const ctx: GreedyContext = {
            graph,
            depot,
            clientsSubset: subset,
            alpha,
            beta,
            gamma,
            clusterIndex: null,
        };

        setRoutingLoading(true);
        setRoutingMessage('Підготовка маршруту…');

        try {
            const res = await computeGreedyRoutesForClients(ctx, (msg) =>
                setRoutingMessage(msg),
            );
            setMultiClientResults(res);
        } finally {
            setRoutingLoading(false);
            setRoutingMessage(null);
        }
    };

    // ---- кластеризація і маршрути по кластерах ----

    const handleRunClustering = () => {
        if (clients.length === 0) {
            alert('Немає клієнтів для кластеризації.');
            return;
        }
        const k = Math.max(1, Math.min(clusterK, clients.length));
        const points = clients.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng }));
        const res = kMeans(points, k, 25);
        setClusterResult(res);
    };

    const handleRunClusterRoutes = async () => {
        if (!graph) {
            alert(
                'Граф ще не завантажений. Спочатку натисніть «Завантажити граф навколо складу».',
            );
            return;
        }
        if (!depot) {
            alert('Спочатку додайте склад.');
            return;
        }
        if (!clusterResult) {
            alert('Спочатку запустіть k-means, щоб отримати кластери клієнтів.');
            return;
        }

        const results: MultiClientAlgoResult[] = [];

        setRoutingLoading(true);
        setRoutingMessage('Підготовка маршрутів по кластерах…');

        try {
            for (let cIdx = 0; cIdx < clusterResult.centers.length; cIdx++) {
                const clusterClients = clients.filter(
                    (cl) => clusterResult.assignments[cl.id] === cIdx,
                );
                if (clusterClients.length === 0) continue;

                const ctx: GreedyContext = {
                    graph,
                    depot,
                    clientsSubset: clusterClients,
                    alpha,
                    beta,
                    gamma,
                    clusterIndex: cIdx,
                };

                const label =
                    clusterClients.length === 1
                        ? `кластер ${cIdx + 1}: один клієнт`
                        : `кластер ${cIdx + 1}: ${clusterClients.length} клієнтів`;
                setRoutingMessage(`Маршрути для ${label}…`);

                const res = await computeGreedyRoutesForClients(ctx);
                results.push(...res);
            }

            setMultiClientResults(results);
        } finally {
            setRoutingLoading(false);
            setRoutingMessage(null);
        }
    };

    // ---- збереження / завантаження сценарію ----

    const handleSaveScenario = () => {
        const data = JSON.stringify(
            {
                depot,
                clients,
            },
            null,
            2,
        );

        const blob = new Blob([data], { type: 'application/json' });
        const ts = new Date();
        const name = `scenario-${ts.getFullYear()}${String(
            ts.getMonth() + 1,
        ).padStart(2, '0')}${String(ts.getDate()).padStart(
            2,
            '0',
        )}-${String(ts.getHours()).padStart(2, '0')}${String(
            ts.getMinutes(),
        ).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}.json`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleLoadScenario = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(String(e.target?.result));
                const d = parsed.depot ?? null;
                const cl = parsed.clients ?? [];
                setDepot(d);
                setClients(cl);
                setMultiClientResults([]);
                setClusterResult(null);
                setSelectedRouteClientIds([]);
            } catch {
                alert('Некоректний файл сценарію.');
            }
        };
        reader.readAsText(file);
    };

    // ---- видимість маршрутів за алгоритмами ----

    const handleToggleRouteVisibility = (algo: AlgoId, visible: boolean) => {
        setRouteVisibility((prev) => ({ ...prev, [algo]: visible }));
    };

    // ---- полілайни для карти ----

    const routes: RoutePolyline[] = useMemo(() => {
        if (!graph) return [];

        const result: RoutePolyline[] = [];

        multiClientResults.forEach((r, idx) => {
            if (!routeVisibility[r.algo]) return;
            if (!r.path.length) return;

            const coords: [number, number][] = r.path
                .map((id) => graph.nodes.find((n) => n.id === id))
                .filter(Boolean)
                .map((n) => [n!.lat, n!.lng]);

            let color = '#dc2626'; // Dijkstra
            if (r.algo === 'astar') color = '#16a34a';
            if (r.algo === 'multi') color = '#f97316';

            const isCluster = r.clusterIndex !== null;

            result.push({
                id: `multi-${idx}-${r.algo}`,
                coords,
                color,
                weight: isCluster ? 4 : 6,
                dashArray: isCluster ? '3 4' : undefined,
            });
        });

        return result;
    }, [graph, multiClientResults, routeVisibility]);

    return (
        <Layout>
            <div className="grid h-screen w-screen grid-cols-[360px_minmax(0,1fr)_360px] bg-slate-100 font-sans">
                {/* Левая панель */}
                <div className="overflow-y-auto border-r border-slate-200 bg-white shadow-sm">
                    <ControlPanel
                        depot={depot}
                        clients={clients}
                        clickMode={clickMode}
                        onChangeClickMode={setClickMode}
                        alpha={alpha}
                        beta={beta}
                        gamma={gamma}
                        onChangeAlpha={setAlpha}
                        onChangeBeta={setBeta}
                        onChangeGamma={setGamma}
                        clusterK={clusterK}
                        onChangeClusterK={setClusterK}
                        onRunClustering={handleRunClustering}
                        onLoadOsmGraphAroundDepot={handleLoadGraphAroundDepot}
                        graphLoading={graphLoading}
                        graphError={graphError}
                        graphRadiusKm={graphRadiusKm}
                        onChangeGraphRadiusKm={setGraphRadiusKm}
                        onUpdateClient={handleUpdateClient}
                        onRemoveClient={handleRemoveClient}
                        onClearDepot={handleClearDepot}
                        selectedRouteClientIds={selectedRouteClientIds}
                        onToggleClientInRoute={handleToggleClientInRoute}
                        onRunMultiClientRoute={handleRunMultiClientRoute}
                        onRunClusterRoutes={handleRunClusterRoutes}
                        onSaveScenario={handleSaveScenario}
                        onLoadScenario={handleLoadScenario}
                    />
                </div>

                {/* Карта */}
                <div className="overflow-hidden">
                    <div className="relative h-full">
                        {routingLoading && (
                            <div className="pointer-events-none absolute inset-0 flex items-start justify-center">
                                <div className="mt-4 rounded-md bg-white/90 px-3 py-2 text-xs text-slate-700 shadow">
                                    {routingMessage ?? 'Обчислення маршрутів…'}
                                </div>
                            </div>
                        )}

                        <MapView
                            graph={graph}
                            depot={depot}
                            clients={clients}
                            routes={routes}
                            clickMode={clickMode}
                            onAddPoint={handleAddPointOnMap}
                            clusterAssignments={clusterResult?.assignments}
                            clusterCenters={clusterResult?.centers}
                        />
                    </div>
                </div>

                {/* Правая панель */}
                <div className="overflow-y-auto border-l border-slate-200 bg-white shadow-sm">
                    <ResultsPanel
                        results={multiClientResults}
                        routeVisibility={routeVisibility}
                        onToggleRouteVisibility={handleToggleRouteVisibility}
                        clusterResult={clusterResult}
                        clients={clients}
                    />
                </div>
            </div>
        </Layout>
    );
};

export default App;
