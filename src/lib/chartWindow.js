import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Shared chart window. Lives in `?w=` so tabs, scroll-spy, and refresh keep it. */
export const CHART_WINDOWS = [
  { id: '7d', label: 'Weekly', days: 7 },
  { id: '30d', label: 'Monthly', days: 30 },
  { id: 'all', label: 'All', days: 0 },
];

export const DEFAULT_CHART_WINDOW = 'all';

export function parseChartWindow(value) {
  return CHART_WINDOWS.some((w) => w.id === value) ? value : DEFAULT_CHART_WINDOW;
}

export function useChartWindow() {
  const [params, setParams] = useSearchParams();
  const value = parseChartWindow(params.get('w'));
  const setValue = useCallback((id) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!id || id === DEFAULT_CHART_WINDOW) next.delete('w');
      else next.set('w', id);
      return next;
    }, { replace: true });
  }, [setParams]);
  return [value, setValue];
}
