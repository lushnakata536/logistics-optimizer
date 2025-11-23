import React, { type ChangeEvent } from 'react';
import type { ProblemPoint } from '../../types/problem';

type ControlPanelProps = {
    depot: ProblemPoint | null;
    clients: ProblemPoint[];

    clickMode: 'NONE' | 'DEPOT' | 'CLIENT';
    onChangeClickMode: (mode: 'NONE' | 'DEPOT' | 'CLIENT') => void;

    alpha: number;
    beta: number;
    gamma: number;
    onChangeAlpha: (v: number) => void;
    onChangeBeta: (v: number) => void;
    onChangeGamma: (v: number) => void;

    clusterK: number;
    onChangeClusterK: (k: number) => void;
    onRunClustering: () => void;

    onLoadOsmGraphAroundDepot: () => void;
    graphLoading?: boolean;
    graphError?: string | null;
    graphRadiusKm: number;
    onChangeGraphRadiusKm: (r: number) => void;

    onUpdateClient: (id: string, lat: number, lng: number) => void;
    onRemoveClient: (id: string) => void;
    onClearDepot: () => void;

    selectedRouteClientIds: string[];
    onToggleClientInRoute: (id: string) => void;
    onRunMultiClientRoute: () => void;
    onRunClusterRoutes: () => void;

    onSaveScenario: () => void;
    onLoadScenario: (file: File | null) => void;
};

export const ControlPanel: React.FC<ControlPanelProps> = ({
                                                              depot,
                                                              clients,
                                                              clickMode,
                                                              onChangeClickMode,
                                                              alpha,
                                                              beta,
                                                              gamma,
                                                              onChangeAlpha,
                                                              onChangeBeta,
                                                              onChangeGamma,
                                                              clusterK,
                                                              onChangeClusterK,
                                                              onRunClustering,
                                                              onLoadOsmGraphAroundDepot,
                                                              graphLoading,
                                                              graphError,
                                                              graphRadiusKm,
                                                              onChangeGraphRadiusKm,
                                                              onUpdateClient,
                                                              onRemoveClient,
                                                              onClearDepot,
                                                              selectedRouteClientIds,
                                                              onToggleClientInRoute,
                                                              onRunMultiClientRoute,
                                                              onRunClusterRoutes,
                                                              onSaveScenario,
                                                              onLoadScenario,
                                                          }) => {
    const handleScenarioFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        onLoadScenario(file);
        e.target.value = '';
    };

    return (
        <div className="space-y-4 p-4 text-[14px]">
            <h1 className="mb-1 text-xl font-semibold">Налаштування задачі</h1>

            {/* 1. Додавання точок кліком по мапі */}
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                    Додавання точок кліком по мапі
                </h2>
                <div className="flex flex-wrap gap-2">
                    <button
                        className={`rounded-md px-3 py-1.5 text-sm font-medium border ${
                            clickMode === 'DEPOT'
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                : 'border-slate-300 bg-white text-slate-700'
                        }`}
                        onClick={() =>
                            onChangeClickMode(clickMode === 'DEPOT' ? 'NONE' : 'DEPOT')
                        }
                    >
                        Склад
                    </button>
                    <button
                        className={`rounded-md px-3 py-1.5 text-sm font-medium border ${
                            clickMode === 'CLIENT'
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                : 'border-slate-300 bg-white text-slate-700'
                        }`}
                        onClick={() =>
                            onChangeClickMode(clickMode === 'CLIENT' ? 'NONE' : 'CLIENT')
                        }
                    >
                        Клієнт
                    </button>
                </div>
                <p className="text-xs text-slate-500">
                    Поточний режим:{' '}
                    <span className="font-semibold">
            {clickMode === 'NONE' ? 'вимкнено' : clickMode}
          </span>
                </p>
            </section>

            {/* 2. Точки задачі */}
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <h2 className="mb-1 text-sm font-semibold text-slate-700">
                    Точки задачі
                </h2>

                {/* Склад */}
                <div className="mb-2">
                    <div className="mb-1 ефлекс items-center justify-between text-xs flex">
                        <span className="font-semibold text-slate-700">Склад</span>
                        {depot && (
                            <button
                                className="text-[11px] text-red-600 hover:text-red-800"
                                onClick={onClearDepot}
                            >
                                Очистити
                            </button>
                        )}
                    </div>
                    {depot ? (
                        <div className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs">
                            <div className="flex justify-between">
                                <span className="font-medium">{depot.id}</span>
                                <span className="text-slate-500">
                  ({depot.lat.toFixed(4)}, {depot.lng.toFixed(4)})
                </span>
                            </div>
                            {depot.nearestNodeId && (
                                <div className="mt-1 text-[11px] text-slate-500">
                                    Вузол графа: <b>{depot.nearestNodeId}</b> (
                                    ~{depot.nearestNodeDistKm?.toFixed(3)} км)
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500">
                            Склад не задано. Увімкніть режим «Склад» та клікніть по мапі.
                        </p>
                    )}
                </div>

                {/* Клієнти */}
                <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">
              Клієнти ({clients.length})
            </span>
                    </div>

                    {clients.length === 0 && (
                        <p className="text-xs text-slate-500">
                            Увімкніть режим «Клієнт» та додайте точки клієнтів кліком по
                            мапі.
                        </p>
                    )}

                    {clients.length > 0 && (
                        <div className="max-h-40 space-y-1 overflow-y-auto">
                            {clients.map(c => (
                                <div
                                    key={c.id}
                                    className="flex flex-col gap-1 rounded-md border border-slate-300 bg-white px-2 py-1"
                                >
                                    <div className="flex items-center gap-2">
                    <span className="w-10 text-xs font-semibold text-slate-700">
                      {c.id}
                    </span>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            className="w-24 rounded-md border border-slate-300 px-1 py-0.5 text-[11px]"
                                            value={c.lat}
                                            onChange={e =>
                                                onUpdateClient(c.id, +e.target.value, c.lng)
                                            }
                                        />
                                        <input
                                            type="number"
                                            step="0.0001"
                                            className="w-24 rounded-md border border-slate-300 px-1 py-0.5 text-[11px]"
                                            value={c.lng}
                                            onChange={e =>
                                                onUpdateClient(c.id, c.lat, +e.target.value)
                                            }
                                        />
                                        <button
                                            className="ml-auto text-[11px] text-red-600 hover:text-red-800"
                                            onClick={() => onRemoveClient(c.id)}
                                            title="Видалити клієнта"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                                        {c.nearestNodeId ? (
                                            <span>
                        Вузол: <b>{c.nearestNodeId}</b> (~
                                                {c.nearestNodeDistKm?.toFixed(3)} км)
                      </span>
                                        ) : (
                                            <span>Вузол: —</span>
                                        )}
                                        <label className="flex items-center gap-1">
                                            <input
                                                type="checkbox"
                                                checked={selectedRouteClientIds.includes(c.id)}
                                                onChange={() => onToggleClientInRoute(c.id)}
                                            />
                                            <span>У маршруті</span>
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* 3. Ваги пошуку */}
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <h2 className="text-sm font-semibold text-slate-700">Ваги пошуку</h2>
                <p className="text-xs text-slate-500">
                    Визначають, наскільки важливі відстань, час та вартість у
                    узагальненій вазі ребер при побудові маршрутів для алгоритмів
                    Дейкстри, A* та багатокритеріального label-setting.
                </p>
                <div className="flex flex-col gap-2">
                    <label className="flex flex-col text-xs text-slate-600">
                        Вага відстані α
                        <input
                            type="number"
                            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            value={alpha}
                            onChange={e => onChangeAlpha(+e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col text-xs text-slate-600">
                        Вага часу β
                        <input
                            type="number"
                            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            value={beta}
                            onChange={e => onChangeBeta(+e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col text-xs text-slate-600">
                        Вага вартості γ
                        <input
                            type="number"
                            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            value={gamma}
                            onChange={e => onChangeGamma(+e.target.value)}
                        />
                    </label>
                </div>
            </section>

            {/* 4. Граф OSM */}
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                    Граф OSM (завантаження)
                </h2>

                <label className="flex items-center justify-between text-xs text-slate-600">
                    Радіус навколо складу, км:
                    <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        className="ml-2 w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        value={graphRadiusKm}
                        onChange={e =>
                            onChangeGraphRadiusKm(+e.target.value || 0.1)
                        }
                    />
                </label>

                <button
                    className="mt-1 inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    onClick={onLoadOsmGraphAroundDepot}
                    disabled={graphLoading}
                >
                    {graphLoading ? 'Завантаження…' : 'Завантажити граф навколо складу'}
                </button>

                {graphError && (
                    <p className="text-xs text-red-600">
                        Помилка завантаження OSM-графа: {graphError}
                    </p>
                )}
                {!graphError && (
                    <p className="text-[11px] text-slate-500">
                        Завантажується дорожній граф OpenStreetMap у вказаному радіусі від
                        складу. Маршрути будуються по цих дорогах.
                    </p>
                )}
            </section>

            {/* 5. Маршрут: склад → клієнти */}
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                    Маршрут: склад → клієнти
                </h2>
                <p className="text-xs text-slate-500">
                    Порядок відвідування клієнтів обирається жадібно за принципом
                    найближчого сусіда (за координатами), а для цього порядку
                    додатково обчислюються маршрути Дейкстри, A* та
                    багатокритеріальним label-setting.
                </p>
                <button
                    className="mt-1 w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    onClick={onRunMultiClientRoute}
                >
                    Маршрут склад → обрані клієнти (greedy)
                </button>
            </section>

            {/* 6. Кластеризація клієнтів */}
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                    Кластеризація клієнтів (k-means)
                </h2>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                            Кількість кластерів k:
                            <input
                                type="number"
                                min={1}
                                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                value={clusterK}
                                onChange={e => onChangeClusterK(+e.target.value || 1)}
                            />
                        </label>
                        <button
                            className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                            onClick={onRunClustering}
                        >
                            Запустити k-means
                        </button>
                    </div>
                    <button
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        onClick={onRunClusterRoutes}
                    >
                        Обчислити маршрути по кластерах
                    </button>
                    <p className="text-[11px] text-slate-500">
                        Для кожного кластера будується окремий greedy-маршрут (Дейкстра,
                        A*, label-setting) від складу через усіх клієнтів цього кластера.
                    </p>
                </div>
            </section>

            {/* 7. Збереження / завантаження задачі */}
            <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                    Збереження та завантаження задачі
                </h2>
                <div className="flex flex-wrap gap-2">
                    <button
                        className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                        onClick={onSaveScenario}
                    >
                        Зберегти склад і клієнтів
                    </button>

                    <div>
                        <input
                            id="scenarioFile"
                            type="file"
                            accept="application/json"
                            className="hidden"
                            onChange={handleScenarioFileChange}
                        />
                        <label
                            htmlFor="scenarioFile"
                            className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                            Завантажити сценарій
                        </label>
                    </div>
                </div>
                <p className="text-[11px] text-slate-500">
                    Файл містить координати складу та клієнтів, а також (за наявності)
                    їхню прив’язку до вузлів дорожнього графа.
                </p>
            </section>
        </div>
    );
};
