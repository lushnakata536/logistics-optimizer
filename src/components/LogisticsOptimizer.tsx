// LogisticsOptimizer.tsx
import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const icon = new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

const SPEED_KMH_DEFAULT = 60;
const PRICE_PER_KM_DEFAULT = 1;

type ElementNode = { data: { id: string; label?: string; lat: number; lng: number } };
type ElementEdge = { data: { source: string; target: string; distance?: number; time?: number; cost?: number; label?: string } };
type Element = ElementNode | ElementEdge;

type PathResult = {
    path: string[];
    totalWeight: number;
    totals: { distance: number; time: number; cost: number };
};

function haversineKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

const isValidGraphData = (data: any) =>
    Array.isArray(data) &&
    data.every(
        (el) =>
            el?.data &&
            (
                (el.data.id && typeof el.data.lat === 'number' && typeof el.data.lng === 'number') ||
                (el.data.source && el.data.target)
            )
    );

function ClickToAdd({ onClickMap }: { onClickMap: (coords: [number, number]) => void }) {
    useMapEvents({ click(e) { onClickMap([e.latlng.lat, e.latlng.lng]); } });
    return null;
}

function edgeMetricsWithFallback(edge: ElementEdge["data"], defaultDistKm?: number) {
    const distance = edge.distance ?? defaultDistKm ?? 0;
    const time = edge.time ?? (defaultDistKm != null ? defaultDistKm / SPEED_KMH_DEFAULT : 0);
    const cost = edge.cost ?? (defaultDistKm != null ? defaultDistKm * PRICE_PER_KM_DEFAULT : 0);
    return { distance, time, cost };
}
function edgeWeight(edge: ElementEdge["data"], a: number, b: number, g: number, defaultDistKm?: number) {
    const { distance, time, cost } = edgeMetricsWithFallback(edge, defaultDistKm);
    return a * distance + b * time + g * cost;
}
function buildAdj(nodes: ElementNode[], edges: ElementEdge[]) {
    const byId = new Map<string, ElementNode["data"]>(nodes.map((n) => [n.data.id, n.data]));
    const adj = new Map<string, ElementEdge["data"][]>();
    edges.forEach((e) => {
        const list = adj.get(e.data.source) ?? [];
        list.push(e.data);
        adj.set(e.data.source, list);
    });
    return { byId, adj };
}
function heuristicWeight(from: ElementNode["data"], to: ElementNode["data"], a: number, b: number, g: number) {
    const dist = haversineKm([from.lat, from.lng], [to.lat, to.lng]);
    const time = dist / SPEED_KMH_DEFAULT;
    const cost = dist * PRICE_PER_KM_DEFAULT;
    return a * dist + b * time + g * cost;
}
function runAStar(nodes: ElementNode[], edges: ElementEdge[], startId: string, endId: string, a: number, b: number, g: number): PathResult | null {
    const { byId, adj } = buildAdj(nodes, edges);
    const start = byId.get(startId); const goal = byId.get(endId);
    if (!start || !goal) return null;
    const open = new Set<string>([startId]);
    const cameFrom: Record<string, string | undefined> = {};
    const gScore: Record<string, number> = {};
    const fScore: Record<string, number> = {};
    const totalsD: Record<string, number> = {};
    const totalsT: Record<string, number> = {};
    const totalsC: Record<string, number> = {};
    nodes.forEach(n => { gScore[n.data.id] = Infinity; fScore[n.data.id] = Infinity; totalsD[n.data.id] = 0; totalsT[n.data.id] = 0; totalsC[n.data.id] = 0; });
    gScore[startId] = 0; fScore[startId] = heuristicWeight(start, goal, a, b, g);
    while (open.size) {
        let current = Array.from(open).reduce((x, y) => (fScore[x] < fScore[y] ? x : y));
        if (current === endId) break;
        open.delete(current);
        const outs = adj.get(current) ?? [];
        for (const e of outs) {
            const curNode = byId.get(current)!;
            const nextNode = byId.get(e.target);
            if (!nextNode) continue;
            const defDist = haversineKm([curNode.lat, curNode.lng], [nextNode.lat, nextNode.lng]);
            const w = edgeWeight(e, a, b, g, defDist);
            const tentative = gScore[current] + w;
            if (tentative < (gScore[e.target] ?? Infinity)) {
                cameFrom[e.target] = current;
                gScore[e.target] = tentative;
                const m = edgeMetricsWithFallback(e, defDist);
                totalsD[e.target] = totalsD[current] + m.distance;
                totalsT[e.target] = totalsT[current] + m.time;
                totalsC[e.target] = totalsC[current] + m.cost;
                fScore[e.target] = tentative + heuristicWeight(nextNode, goal, a, b, g);
                open.add(e.target);
            }
        }
    }
    if (!cameFrom[endId] && startId !== endId) return null;
    const path: string[] = []; let cur = endId; path.unshift(cur);
    while (cur !== startId) { const p = cameFrom[cur]; if (!p) break; cur = p; path.unshift(cur); }
    return { path, totalWeight: gScore[endId], totals: { distance: totalsD[endId], time: totalsT[endId], cost: totalsC[endId] } };
}
function runDijkstra(nodes: ElementNode[], edges: ElementEdge[], startId: string, endId: string, a: number, b: number, g: number): PathResult | null {
    const { byId, adj } = buildAdj(nodes, edges);
    const start = byId.get(startId); const goal = byId.get(endId);
    if (!start || !goal) return null;
    const dist: Record<string, number> = {};
    const prev: Record<string, string | undefined> = {};
    const totalsD: Record<string, number> = {};
    const totalsT: Record<string, number> = {};
    const totalsC: Record<string, number> = {};
    const Q = new Set<string>(nodes.map(n => n.data.id));
    nodes.forEach(n => { dist[n.data.id] = Infinity; totalsD[n.data.id] = 0; totalsT[n.data.id] = 0; totalsC[n.data.id] = 0; });
    dist[startId] = 0;
    while (Q.size) {
        let u: string | null = null;
        for (const id of Q) if (u === null || dist[id] < dist[u]) u = id;
        if (u === null) break;
        Q.delete(u);
        if (u === endId) break;
        const outs = adj.get(u) ?? [];
        for (const e of outs) {
            const uNode = byId.get(u)!;
            const vNode = byId.get(e.target);
            if (!vNode) continue;
            const defDist = haversineKm([uNode.lat, uNode.lng], [vNode.lat, vNode.lng]);
            const w = edgeWeight(e, a, b, g, defDist);
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
    const path: string[] = []; let cur = endId; path.unshift(cur);
    while (cur !== startId) { const p = prev[cur]; if (!p) break; cur = p; path.unshift(cur); }
    return { path, totalWeight: dist[endId], totals: { distance: totalsD[endId], time: totalsT[endId], cost: totalsC[endId] } };
}

export default function LogisticsOptimizer() {
    const [elements, setElements] = useState<Element[]>([]);
    const nodes = useMemo(() => elements.filter((el: any) => el.data?.id) as ElementNode[], [elements]);
    const edges = useMemo(() => elements.filter((el: any) => el.data?.source) as ElementEdge[], [elements]);

    const [edgeDraft, setEdgeDraft] = useState<{ from: string; to: string }>({ from: '', to: '' });
    const [createReverse, setCreateReverse] = useState<boolean>(true);

    const [startId, setStartId] = useState<string>('');
    const [endId, setEndId] = useState<string>('');
    const [alpha, setAlpha] = useState<number>(1);
    const [beta, setBeta] = useState<number>(0);
    const [gamma, setGamma] = useState<number>(0);

    const [dj, setDj] = useState<PathResult | null>(null);
    const [as, setAs] = useState<PathResult | null>(null);

    // ✅ множественный выбор подсветки
    const [showAstar, setShowAstar] = useState<boolean>(true);
    const [showDijkstra, setShowDijkstra] = useState<boolean>(true);

    const [edgeModal, setEdgeModal] = useState<{ open: boolean; from: string; to: string; distance: string; time: string; cost: string }>({
        open: false, from: '', to: '', distance: '', time: '', cost: ''
    });
    const [nodeModal, setNodeModal] = useState<{ open: boolean; lat: number; lng: number; id: string }>({
        open: false, lat: 0, lng: 0, id: ''
    });

    function importFromJson(ev: React.ChangeEvent<HTMLInputElement>) {
        const file = ev.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(String(e.target?.result));
                if (!isValidGraphData(parsed)) throw new Error('Invalid format');
                setElements(parsed);
                resetSearch();
                ev.target.value = '';
            } catch {
                alert('Файл не є коректним JSON графом. Очікується масив елементів (вузли: id,lat,lng; ребра: source,target, ...).');
            }
        };
        reader.readAsText(file);
    }
    function exportJson() {
        const data = JSON.stringify(elements, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const ts = new Date();
        const name = `graph-${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}-${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}${String(ts.getSeconds()).padStart(2,'0')}.json`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function clearGraph() {
        setElements([]); resetSearch();
    }
    function resetSearch() {
        setEdgeDraft({ from: '', to: '' });
        setStartId(''); setEndId('');
        setDj(null); setAs(null);
    }

    function requestNewNodeAt([lat, lng]: [number, number]) { setNodeModal({ open: true, lat, lng, id: '' }); }
    function submitNodeModal(e?: React.FormEvent) {
        e?.preventDefault?.();
        const id = (nodeModal.id || '').trim();
        if (!id) return;
        if (nodes.some((n) => n.data.id === id)) { alert(`Вузол з ID "${id}" вже існує.`); return; }
        setElements((prev) => [...prev, { data: { id, label: id, lat: nodeModal.lat, lng: nodeModal.lng } }]);
        if (!startId) setStartId(id);
        setNodeModal({ open: false, lat: 0, lng: 0, id: '' });
    }
    function closeNodeModal() { setNodeModal({ open: false, lat: 0, lng: 0, id: '' }); }

    function onMarkerClick(id: string) {
        setEdgeDraft((d) => {
            if (!d.from) return { from: id, to: '' };
            if (!d.to && id !== d.from) { openEdgeModal(d.from, id); return { ...d, to: id }; }
            return { from: id, to: '' };
        });
    }
    function openEdgeModal(from: string, to: string) {
        const a = nodes.find((n) => n.data.id === from)?.data;
        const b = nodes.find((n) => n.data.id === to)?.data;
        let distance = '', time = '', cost = '';
        if (a && b) {
            const dist = haversineKm([a.lat, a.lng], [b.lat, b.lng]);
            distance = dist.toFixed(2);
            time = (dist / SPEED_KMH_DEFAULT).toFixed(2);
            cost = (dist * PRICE_PER_KM_DEFAULT).toFixed(2);
        }
        setEdgeModal({ open: true, from, to, distance, time, cost });
    }
    function submitEdgeModal(e?: React.FormEvent) {
        e?.preventDefault?.();
        const { from, to, distance, time, cost } = edgeModal;
        if (!from || !to) return;
        const d = parseFloat(distance), t = parseFloat(time), c = parseFloat(cost);
        if (!isFinite(d) || !isFinite(t) || !isFinite(c)) return;
        const edgeAB: ElementEdge = { data: { source: from, target: to, distance: d, time: t, cost: c, label: `d:${d} t:${t} c:${c}` } };
        const newEls: Element[] = [edgeAB];
        if (createReverse) {
            const edgeBA: ElementEdge = { data: { source: to, target: from, distance: d, time: t, cost: c, label: `d:${d} t:${t} c:${c}` } };
            newEls.push(edgeBA);
        }
        setElements((prev) => [...prev, ...newEls]);
        setEdgeDraft({ from, to: '' });
        setEdgeModal({ open: false, from: '', to: '', distance: '', time: '', cost: '' });
    }
    function closeEdgeModal() { setEdgeModal({ open: false, from: '', to: '', distance: '', time: '', cost: '' }); }

    function runBoth() {
        if (!startId || !endId) { alert('Оберіть "Від" та "До" вузли.'); return; }
        setDj(runDijkstra(nodes, edges, startId, endId, alpha, beta, gamma));
        setAs(runAStar(nodes, edges, startId, endId, alpha, beta, gamma));
    }

    const polylines = useMemo(() => {
        const ls: [number, number][][] = [];
        edges.forEach((e) => {
            const s = nodes.find((n) => n.data.id === e.data.source)?.data;
            const t = nodes.find((n) => n.data.id === e.data.target)?.data;
            if (s && t) ls.push([[s.lat, s.lng], [t.lat, t.lng]]);
        });
        return ls;
    }, [nodes, edges]);

    const pathAstar = useMemo(() => {
        if (!as || as.path.length < 2) return [];
        const coords: [number, number][] = [];
        for (const id of as.path) {
            const n = nodes.find((x) => x.data.id === id)?.data;
            if (n) coords.push([n.lat, n.lng]);
        }
        return coords;
    }, [as, nodes]);

    const pathDijkstra = useMemo(() => {
        if (!dj || dj.path.length < 2) return [];
        const coords: [number, number][] = [];
        for (const id of dj.path) {
            const n = nodes.find((x) => x.data.id === id)?.data;
            if (n) coords.push([n.lat, n.lng]);
        }
        return coords;
    }, [dj, nodes]);

    const nodeIds = nodes.map(n => n.data.id);

    return (
        <div className="p-4">
            <h1 className="text-xl font-bold mb-3">Оптимізація логістичних маршрутів (карта)</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="space-y-2">
                    <div className="flex gap-3 items-center flex-wrap">
                        <label>Від:
                            <select value={startId} onChange={(e) => setStartId(e.target.value)} className="border p-1 ml-2">
                                <option value="">—</option>
                                {nodeIds.map(id => <option key={id} value={id}>{id}</option>)}
                            </select>
                        </label>
                        <label>До:
                            <select value={endId} onChange={(e) => setEndId(e.target.value)} className="border p-1 ml-2">
                                <option value="">—</option>
                                {nodeIds.map(id => <option key={id} value={id}>{id}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="flex gap-4 items-center flex-wrap">
                        <label>α:<input type="number" value={alpha} onChange={(e) => setAlpha(+e.target.value)} className="border p-1 ml-2 w-24" /></label>
                        <label>β:<input type="number" value={beta} onChange={(e) => setBeta(+e.target.value)} className="border p-1 ml-2 w-24" /></label>
                        <label>γ:<input type="number" value={gamma} onChange={(e) => setGamma(+e.target.value)} className="border p-1 ml-2 w-24" /></label>
                        <button onClick={runBoth} className="bg-blue-600 text-white px-4 py-2 rounded">Обчислити</button>
                    </div>
                    {/* множественный выбор подсветки */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={showAstar} onChange={(e) => setShowAstar(e.target.checked)} />
                            Показувати шлях A*
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={showDijkstra} onChange={(e) => setShowDijkstra(e.target.checked)} />
                            Показувати шлях Dijkstra
                        </label>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                        <input id="jsonFile" type="file" accept="application/json" onChange={importFromJson} className="hidden" />
                        <label htmlFor="jsonFile" className="bg-gray-600 text-white px-3 py-2 rounded cursor-pointer">Імпортувати JSON</label>
                        <button onClick={exportJson} className="bg-slate-700 text-white px-3 py-2 rounded">Експортувати JSON</button>
                        <button onClick={clearGraph} className="bg-red-600 text-white px-3 py-2 rounded">Очистити граф</button>
                    </div>
                    <div className="text-xs text-gray-600">Формат: вузли (id,lat,lng), ребра (source,target,distance,time,cost)</div>
                    <div className="flex items-center gap-2 text-sm">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={createReverse} onChange={(e) => setCreateReverse(e.target.checked)} />
                            Створювати зворотне ребро (B→A)
                        </label>
                    </div>
                </div>

                <div className="space-y-3">
                    {dj && (
                        <div className="p-3 border rounded">
                            <div className="font-semibold mb-1">Dijkstra</div>
                            <div>вага: <b>{dj.totalWeight?.toFixed?.(3) ?? dj.totalWeight}</b></div>
                            <div>шлях: {dj.path.length ? <b>{dj.path.join(' → ')}</b> : '—'}</div>
                            <div>Σ d: <b>{dj.totals.distance.toFixed(2)} км</b>, Σ t: <b>{dj.totals.time.toFixed(2)} год</b>, Σ c: <b>{dj.totals.cost.toFixed(2)} грн</b></div>
                        </div>
                    )}
                    {as && (
                        <div className="p-3 border rounded">
                            <div className="font-semibold mb-1">A*</div>
                            <div>вага: <b>{as.totalWeight?.toFixed?.(3) ?? as.totalWeight}</b></div>
                            <div>шлях: {as.path.length ? <b>{as.path.join(' → ')}</b> : '—'}</div>
                            <div>Σ d: <b>{as.totals.distance.toFixed(2)} км</b>, Σ t: <b>{as.totals.time.toFixed(2)} год</b>, Σ c: <b>{as.totals.cost.toFixed(2)} грн</b></div>
                        </div>
                    )}
                    {!dj && !as && <div className="text-sm text-gray-600">Вибери вузли «Від» та «До», налаштуй α/β/γ і натисни «Обчислити».</div>}
                </div>
            </div>

            <div className="grid grid-cols-1">
                <div style={{ height: 520, position: 'relative', zIndex: 0 }}>
                    <MapContainer center={[50.4501, 30.5234]} zoom={11} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <ClickToAdd onClickMap={requestNewNodeAt} />

                        {nodes.map((n) => (
                            <Marker key={n.data.id} position={[n.data.lat, n.data.lng]} icon={icon} eventHandlers={{ click: () => onMarkerClick(n.data.id) }}>
                                <Tooltip direction="top" offset={[0, -20]} opacity={1} permanent>
                                    {n.data.label || n.data.id}
                                </Tooltip>
                            </Marker>
                        ))}

                        {/* Базовые ребра */}
                        {polylines.map((coords, i) => (<Polyline key={`e-${i}`} positions={coords} />))}

                        {/* Подсветка путей (обе/любая) */}
                        {showAstar && pathAstar.length >= 2 && (
                            <Polyline key="astar" positions={pathAstar} pathOptions={{ weight: 6, color: '#b77373' }} />
                        )}
                        {showDijkstra && pathDijkstra.length >= 2 && (
                            <Polyline key="dijkstra" positions={pathDijkstra} pathOptions={{ weight: 5, color: '#7c3aed', dashArray: '8 6' }} />
                        )}
                    </MapContainer>
                </div>
            </div>

            {/* Модалки */}
            {nodeModal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={closeNodeModal}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: 16, width: 360, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                        <h3 className="font-semibold mb-2">Новий вузол</h3>
                        <form onSubmit={submitNodeModal} className="space-y-2">
                            <label className="block text-sm">ID / Назва вузла
                                <input className="border p-1 w/full" value={nodeModal.id} onChange={(e) => setNodeModal((m) => ({ ...m, id: e.target.value }))} placeholder="Напр., Sklad-1" autoFocus />
                            </label>
                            <div className="text-xs text-gray-600">Координати: {nodeModal.lat.toFixed(5)}, {nodeModal.lng.toFixed(5)}</div>
                            <div className="flex gap-2 justify-end pt-2">
                                <button type="button" onClick={closeNodeModal} className="px-3 py-1 bg-gray-200 rounded">Скасувати</button>
                                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">Створити вузол</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {edgeModal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={closeEdgeModal}>
                    <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 8, padding: 16, width: 380, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
                        <h3 className="font-semibold mb-2">Нове ребро: {edgeModal.from} → {edgeModal.to}</h3>
                        <form onSubmit={submitEdgeModal} className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block text-sm">Відстань (км)
                                    <input className="border p-1 w-full" value={edgeModal.distance} onChange={(e) => setEdgeModal((m) => ({ ...m, distance: e.target.value }))} />
                                </label>
                                <label className="block text-sm">Час (год)
                                    <input className="border p-1 w-full" value={edgeModal.time} onChange={(e) => setEdgeModal((m) => ({ ...m, time: e.target.value }))} />
                                </label>
                                <label className="block text-sm col-span-2">Ціна (грн)
                                    <input className="border p-1 w-full" value={edgeModal.cost} onChange={(e) => setEdgeModal((m) => ({ ...m, cost: e.target.value }))} />
                                </label>
                            </div>
                            <label className="flex items-center gap-2 text-sm mt-1">
                                <input type="checkbox" checked={createReverse} onChange={(e) => setCreateReverse(e.target.checked)} />
                                Створювати зворотне ребро (B→A)
                            </label>
                            <div className="flex gap-2 justify-end pt-2">
                                <button type="button" onClick={closeEdgeModal} className="px-3 py-1 bg-gray-200 rounded">Скасувати</button>
                                <button type="submit" className="px-3 py-1 bg-green-600 text-white rounded">
                                    Створити {createReverse ? 'ребра A↔B' : 'ребро A→B'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
