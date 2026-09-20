import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Date range. Lives in `?w=` so tabs and refresh keep it. */
export const CHART_WINDOWS = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: 'all', label: 'All', days: 0 },
];

/** Bar/line interval. Lives in `?i=`. Independent of the range. */
export const CHART_INTERVALS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

export const DEFAULT_CHART_WINDOW = 'all';
export const DEFAULT_CHART_INTERVAL = 'daily';

export function parseChartWindow(value) {
  return CHART_WINDOWS.some((w) => w.id === value) ? value : DEFAULT_CHART_WINDOW;
}

export function parseChartInterval(value) {
  return CHART_INTERVALS.some((w) => w.id === value) ? value : DEFAULT_CHART_INTERVAL;
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

export function useChartInterval() {
  const [params, setParams] = useSearchParams();
  const value = parseChartInterval(params.get('i'));
  const setValue = useCallback((id) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!id || id === DEFAULT_CHART_INTERVAL) next.delete('i');
      else next.set('i', id);
      return next;
    }, { replace: true });
  }, [setParams]);
  return [value, setValue];
}

export function useChartView() {
  const [range, setRange] = useChartWindow();
  const [interval, setInterval] = useChartInterval();
  return { range, setRange, interval, setInterval };
}
