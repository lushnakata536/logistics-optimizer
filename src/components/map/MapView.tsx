import React from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Polyline,
    Tooltip,
    CircleMarker,
    useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { OsmGraph } from '../../types/graph';
import type { ProblemPoint } from '../../types/problem';

const icon = new L.Icon({
    iconUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    iconRetinaUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

// кольори кластерів
const CLUSTER_COLORS = [
    '#ef4444',
    '#3b82f6',
    '#22c55e',
    '#f97316',
    '#a855f7',
    '#14b8a6',
];

export type RoutePolyline = {
    id: string;
    coords: [number, number][];
    color?: string;
    weight?: number;
    dashArray?: string;
};

export type ClickMode = 'NONE' | 'DEPOT' | 'CLIENT';

type MapViewProps = {
    graph: OsmGraph | null;
    depot: ProblemPoint | null;
    clients: ProblemPoint[];
    routes: RoutePolyline[];
    clickMode: ClickMode;
    onAddPoint: (type: 'DEPOT' | 'CLIENT', lat: number, lng: number) => void;
    clusterAssignments?: Record<string, number>; // clientId -> clusterIndex
    clusterCenters?: { lat: number; lng: number }[];
};

function ClickHandler({
                          clickMode,
                          onAddPoint,
                      }: {
    clickMode: ClickMode;
    onAddPoint: (type: 'DEPOT' | 'CLIENT', lat: number, lng: number) => void;
}) {
    useMapEvents({
        click(e) {
            if (clickMode === 'NONE') return;
            const type = clickMode === 'DEPOT' ? 'DEPOT' : 'CLIENT';
            onAddPoint(type, e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

export const MapView: React.FC<MapViewProps> = ({
                                                    graph,
                                                    depot,
                                                    clients,
                                                    routes,
                                                    clickMode,
                                                    onAddPoint,
                                                    clusterAssignments,
                                                    clusterCenters,
                                                }) => {
    const center: [number, number] = depot
        ? [depot.lat, depot.lng]
        : [50.4501, 30.5234];

    const baseEdges: [number, number][][] =
        graph?.edges.map((e) => {
            const s = graph.nodes.find((n) => n.id === e.source);
            const t = graph.nodes.find((n) => n.id === e.target);
            if (!s || !t) return [] as [number, number][];
            return [
                [s.lat, s.lng],
                [t.lat, t.lng],
            ];
        }) ?? [];

    return (
        <div className="h-full w-full">
            <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                <ClickHandler clickMode={clickMode} onAddPoint={onAddPoint} />

                {/* Дорожній граф */}
                {baseEdges.map((coords, idx) =>
                    coords.length === 2 ? (
                        <Polyline
                            key={`e-${idx}`}
                            positions={coords}
                            pathOptions={{
                                weight: 1.5,
                                color: '#60a5fa',
                                opacity: 0.5,
                            }}
                        />
                    ) : null,
                )}

                {/* Склад */}
                {depot && (
                    <Marker position={[depot.lat, depot.lng]} icon={icon}>
                        <Tooltip direction="top" offset={[0, -20]} opacity={1} permanent>
                            {depot.id} (склад)
                        </Tooltip>
                    </Marker>
                )}

                {/* Клієнти */}
                {clients.map((c) => {
                    const idx = clusterAssignments?.[c.id];
                    const color =
                        idx !== undefined
                            ? CLUSTER_COLORS[idx % CLUSTER_COLORS.length]
                            : '#0f766e';

                    return (
                        <CircleMarker
                            key={c.id}
                            center={[c.lat, c.lng]}
                            radius={8}
                            pathOptions={{ color }}
                        >
                            <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent>
                                {c.id}
                                {idx !== undefined ? ` (кластер ${idx + 1})` : ''}
                            </Tooltip>
                        </CircleMarker>
                    );
                })}

                {/* Центри кластерів */}
                {clusterCenters?.map((c, i) => (
                    <CircleMarker
                        key={`center-${i}`}
                        center={[c.lat, c.lng]}
                        radius={10}
                        pathOptions={{
                            color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
                            dashArray: '3 3',
                        }}
                    >
                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                            Центр {i + 1}
                        </Tooltip>
                    </CircleMarker>
                ))}

                {/* Маршрути */}
                {routes.map((r) => (
                    <Polyline
                        key={r.id}
                        positions={r.coords}
                        pathOptions={{
                            weight: r.weight ?? 5,
                            color: r.color ?? '#ff0000',
                            dashArray: r.dashArray,
                            opacity: 0.95,
                        }}
                    />
                ))}
            </MapContainer>
        </div>
    );
};
