// src/algorithms/clustering.ts

export type Point2D = { id: string; lat: number; lng: number };

export type ClusterResult = {
    centers: { lat: number; lng: number }[];
    assignments: Record<string, number>; // pointId -> clusterIndex
};

function distanceSq(a: Point2D, b: { lat: number; lng: number }): number {
    const dx = a.lat - b.lat;
    const dy = a.lng - b.lng;
    return dx * dx + dy * dy;
}

export function kMeans(points: Point2D[], k: number, iterations = 20): ClusterResult {
    if (points.length === 0 || k <= 0) {
        return { centers: [], assignments: {} };
    }

    const centers: { lat: number; lng: number }[] = [];

    // простая инициализация: первые k точек
    for (let i = 0; i < k && i < points.length; i++) {
        centers.push({ lat: points[i].lat, lng: points[i].lng });
    }

    const assignments: Record<string, number> = {};

    for (let it = 0; it < iterations; it++) {
        // шаг 1: назначение
        for (const p of points) {
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let i = 0; i < centers.length; i++) {
                const d = distanceSq(p, centers[i]);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            assignments[p.id] = bestIdx;
        }

        // шаг 2: пересчет центров
        const sumLat = new Array(centers.length).fill(0);
        const sumLng = new Array(centers.length).fill(0);
        const count = new Array(centers.length).fill(0);

        for (const p of points) {
            const idx = assignments[p.id];
            sumLat[idx] += p.lat;
            sumLng[idx] += p.lng;
            count[idx] += 1;
        }

        for (let i = 0; i < centers.length; i++) {
            if (count[i] > 0) {
                centers[i] = {
                    lat: sumLat[i] / count[i],
                    lng: sumLng[i] / count[i],
                };
            }
        }
    }

    return { centers, assignments };
}
