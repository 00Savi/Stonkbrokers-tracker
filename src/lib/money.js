import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Display USD figures in USD, EUR, or ETH. EUR is ECB via Frankfurter. */

export const CURRENCIES = [
  { id: 'USD', label: 'USD' },
  { id: 'EUR', label: 'EUR' },
  { id: 'ETH', label: 'ETH' },
];

const DEFAULT_CURRENCY = 'USD';

let display = { ccy: DEFAULT_CURRENCY, ethUsd: 0, eurPerUsd: 0 };

/** Latest currency and rates. Formatters read this during render. */
export function readDisplay() {
  return display;
}

export function writeDisplay(next) {
  display = { ...display, ...next };
}

export function parseCurrency(value) {
  const id = String(value || '').toUpperCase();
  return CURRENCIES.some((c) => c.id === id) ? id : DEFAULT_CURRENCY;
}

export async function fetchEurPerUsd(signal) {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { signal });
    if (!res.ok) return null;
    const body = await res.json();
    const n = Number(body?.rates?.EUR);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function usdToCurrency(usd, ccy, { ethUsd = 0, eurPerUsd = 0 } = {}) {
  const n = Number(usd);
  if (!Number.isFinite(n)) return 0;
  if (ccy === 'ETH') return ethUsd > 0 ? n / ethUsd : 0;
  if (ccy === 'EUR') return eurPerUsd > 0 ? n * eurPerUsd : n;
  return n;
}

function compactAbs(abs, digits) {
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(abs / 1e3).toFixed(1)}k`;
  if (abs >= 1) return Math.round(abs).toLocaleString('en-US');
  return abs.toFixed(digits);
}

export function formatMoney(usd, ccy = 'USD', rates = {}) {
  const n = usdToCurrency(usd, ccy, rates);
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (ccy === 'ETH') {
    if (!(rates.ethUsd > 0)) return '—';
    if (abs >= 1e6) return `${sign}Ξ${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e4) return `${sign}Ξ${(abs / 1e3).toFixed(1)}k`;
    const body = abs >= 1 ? abs.toFixed(3) : abs >= 0.01 ? abs.toFixed(4) : abs.toFixed(6);
    return `${sign}Ξ${body.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`;
  }
  const prefix = ccy === 'EUR' ? '€' : '$';
  if (ccy === 'EUR' && !(rates.eurPerUsd > 0)) return '—';
  return `${sign}${prefix}${compactAbs(abs, abs < 0.01 ? 4 : 2)}`;
}

export function moneyTick(ccy, rates) {
  return (value) => formatMoney(value, ccy, rates);
}

/** `?c=` so a refresh keeps ETH / USD / EUR the way `?w=` keeps the range. */
export function useDisplayCurrency() {
  const [params, setParams] = useSearchParams();
  const value = parseCurrency(params.get('c'));
  const setValue = useCallback((id) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!id || id === DEFAULT_CURRENCY) next.delete('c');
      else next.set('c', parseCurrency(id));
      return next;
    }, { replace: true });
  }, [setParams]);
  return [value, setValue];
}

/** Writes the active currency and rates before children format a number. */
export function DisplayCurrencySync({ ethUsd = 0, children }) {
  const [ccy] = useDisplayCurrency();
  const [eurPerUsd, setEurPerUsd] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    fetchEurPerUsd(ac.signal).then((n) => {
      if (n > 0) setEurPerUsd(n);
    });
    return () => ac.abort();
  }, []);
  writeDisplay({ ccy, ethUsd: Number(ethUsd) || 0, eurPerUsd });
  return children;
}
