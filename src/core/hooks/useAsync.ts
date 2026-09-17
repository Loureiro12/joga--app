import { useCallback, useEffect, useState } from 'react';

type AsyncState<T> = { data: T | null; loading: boolean; error: boolean; reload: () => void };

/**
 * Carrega dados de um serviço com estados de loading/erro (para Skeleton e ErrorState).
 * Suficiente para a fase 1; na fase 2 pode ser trocado por TanStack Query sem tocar nos serviços.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({ data: null, loading: true, error: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    load()
      .then((data) => alive && setState({ data, loading: false, error: false }))
      .catch(() => alive && setState({ data: null, loading: false, error: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
