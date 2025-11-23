import React, { useState, useMemo } from 'react';
import type { ClusterResult } from '../../algorithms/clustering';
import type { MultiClientAlgoResult, AlgoId } from '../../App';
import type { ProblemPoint } from '../../types/problem';

type ResultsPanelProps = {
    results: MultiClientAlgoResult[];
    routeVisibility: Record<AlgoId, boolean>;
    onToggleRouteVisibility: (algo: AlgoId, visible: boolean) => void;
    clusterResult: ClusterResult | null;
    clients: ProblemPoint[];
};

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
                                                              results,
                                                              routeVisibility,
                                                              onToggleRouteVisibility,
                                                              clusterResult,
                                                              clients,
                                                          }) => {
    const [activeTab, setActiveTab] = useState<'routes' | 'clusters'>('routes');

    // сгруппированные клиенты по кластерам
    const clusters = useMemo(() => {
        if (!clusterResult) return [];
        const membersMap: Record<number, ProblemPoint[]> = {};

        clusterResult.centers.forEach((_, i) => {
            membersMap[i] = [];
        });

        const assignments = clusterResult.assignments ?? {};
        for (const [clientId, idx] of Object.entries(assignments)) {
            const cl = clients.find(c => c.id === clientId);
            if (!cl) continue;
            if (!membersMap[idx]) membersMap[idx] = [];
            membersMap[idx].push(cl);
        }

        return clusterResult.centers.map((center, index) => ({
            index,
            center,
            members: membersMap[index] ?? [],
        }));
    }, [clusterResult, clients]);

    return (
        <div className="space-y-4 p-4 text-[14px]">
            <h1 className="mb-1 text-xl font-semibold">Результати</h1>

            {/* Таби */}
            <div className="mb-2 flex gap-1 border-b border-slate-200">
                <button
                    className={`px-3 py-1.5 text-sm font-medium ${
                        activeTab === 'routes'
                            ? 'border-b-2 border-blue-600 text-blue-700'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => setActiveTab('routes')}
                >
                    Маршрути
                </button>
                <button
                    className={`px-3 py-1.5 text-sm font-medium ${
                        activeTab === 'clusters'
                            ? 'border-b-2 border-blue-600 text-blue-700'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => setActiveTab('clusters')}
                >
                    Кластери
                </button>
            </div>

            {activeTab === 'routes' && (
                <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                    <div className="mb-2 text-sm font-semibold text-slate-700">
                        Маршрути склад → клієнти (greedy, Дейкстра / A* / label-setting)
                    </div>

                    {results.length === 0 && (
                        <div className="text-xs text-slate-500">
                            Маршрути ще не обчислювалися. Використайте одну з кнопок на лівій
                            панелі («Маршрут склад → обрані клієнти» або «Обчислити маршрути
                            по кластерах»).
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-2">
                            {results.map(r => (
                                <div
                                    key={`${r.algo}-${r.clusterIndex ?? 'global'}`}
                                    className="rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-xs"
                                >
                                    <div className="mb-1 flex items-center justify-between">
                                        <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-800">
                        {r.title}
                      </span>
                                            {r.clusterIndex !== null && (
                                                <span className="text-[11px] text-slate-500">
                          Кластер {r.clusterIndex + 1}
                        </span>
                                            )}
                                            {r.clusterIndex === null && (
                                                <span className="text-[11px] text-slate-500">
                          Глобальний маршрут (обрані клієнти)
                        </span>
                                            )}
                                        </div>
                                        <label className="flex items-center gap-1 text-[11px] text-slate-600">
                                            <input
                                                type="checkbox"
                                                checked={routeVisibility[r.algo]}
                                                onChange={e =>
                                                    onToggleRouteVisibility(r.algo, e.target.checked)
                                                }
                                            />
                                            <span>Показувати на мапі</span>
                                        </label>
                                    </div>
                                    <div className="mb-1">
                                        Маршрут:{' '}
                                        <span className="font-mono text-[11px]">
                      Depot
                                            {r.order.length > 0 && ' → ' + r.order.join(' → ')}
                    </span>
                                    </div>
                                    <div>
                                        Σ d:{' '}
                                        <b>{r.totals.distance.toFixed(2)} км</b>, Σ t:{' '}
                                        <b>{r.totals.time.toFixed(2)} год</b>, Σ c:{' '}
                                        <b>{r.totals.cost.toFixed(2)} грн</b>
                                    </div>
                                </div>
                            ))}

                            <div className="text-[11px] text-slate-500">
                                Для кожного набору клієнтів (глобально або в межах кластера)
                                порядок відвідування формується жадібно за принципом найближчого
                                клієнта за координатами. Для цього самого порядку будуються маршрути
                                Дейкстри, A* та багатокритеріальним label-setting; різниця між ними
                                проявляється у значеннях критеріїв та формі шляху.
                            </div>
                        </div>
                    )}
                </section>
            )}

            {activeTab === 'clusters' && (
                <section className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                    <div className="mb-1 text-sm font-semibold text-slate-700">
                        Кластеризація клієнтів
                    </div>

                    {!clusterResult && (
                        <div className="text-xs text-slate-500">
                            Кластери ще не обчислені. Запустіть k-means на лівій панелі.
                        </div>
                    )}

                    {clusterResult && clusters.length > 0 && (
                        <div className="space-y-2 text-xs text-slate-700">
                            <p className="text-[11px] text-slate-500">
                                Кольори точок клієнтів на мапі відповідають кластерам, центри
                                кластерів показані пунктирними колами. На основі цих кластерів
                                можна обчислювати окремі маршрути (кнопка «Обчислити маршрути по
                                кластерах»).
                            </p>

                            {clusters.map(cl => (
                                <div
                                    key={cl.index}
                                    className="rounded-md border border-slate-200 bg-white/80 px-3 py-2"
                                >
                                    <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      Кластер {cl.index + 1}
                    </span>
                                        <span className="text-[11px] text-slate-500">
                      Клієнтів: <b>{cl.members.length}</b>
                    </span>
                                    </div>
                                    <div className="mb-1 text-[11px] text-slate-600">
                                        Центр: ({cl.center.lat.toFixed(4)},{' '}
                                        {cl.center.lng.toFixed(4)})
                                    </div>
                                    {cl.members.length === 0 ? (
                                        <div className="text-[11px] text-slate-400">
                                            У цьому кластері поки немає клієнтів.
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-1 text-[11px]">
                                            {cl.members.map(m => (
                                                <span
                                                    key={m.id}
                                                    className="rounded-full bg-slate-100 px-2 py-0.5 font-mono"
                                                >
                          {m.id}
                        </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};
