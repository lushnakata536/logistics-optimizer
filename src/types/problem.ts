// src/types/problem.ts

export type ProblemPointType = 'DEPOT' | 'CLIENT';

export type ProblemPoint = {
    id: string;
    type: ProblemPointType;
    lat: number;
    lng: number;
    demandKg?: number;
    nearestNodeId?: string;
    nearestNodeDistKm?: number;
};
