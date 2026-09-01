import { useEffect, useRef, useState } from 'react';
import { loadProjects, loadOverlay, applyOverlay } from './ggindex';
import { loadPrices, applyPrices } from './prices';

/**
 * Loads the dashboard from three independent sources and reports each one's
 * state separately.
 *
 * ## Why this is not one `loading` boolean
 *
 * PR #10 made the whole page wait on the live sources, for a good reason: the
 * figures `data.json` gets wrong are exactly the ones gg-index corrects, so
 * painting the snapshot first showed numbers already known to be wrong and
 * showed them as though they were right. A wrong number that quietly settles
 * is worse than a slow one, because nothing on screen tells you which of the
 * two you are looking at.
 *
 * That reasoning is about *specific fields*, though, not the page. Holder
 * counts and activation counts get corrected; the burn history, the tier
 * table, the LP positions and the project config do not -- for those,
 * `data.json` is simply the answer. Blocking the entire dashboard on an
 * overlay that will only ever touch two objects made everything else wait for
 * no reason.
 *
 * So the split is: paint every field the snapshot gets right immediately, and
 * render the corrected fields as skeletons until their source lands. Nothing
 * displays a value that is about to change, and nothing waits on a correction
 * it was never going to receive.
 *
 * ## The snapshot is still the floor
 *
 * If a live source fails or times out, its state becomes `stale` and the
 * snapshot value is shown rather than a skeleton spinning forever. A dashboard
 * that renders an hour-old number and says so beats one that renders nothing.
 */

const TIMEOUT_MS = 8000;

export function useDashboard() {
  const [data, setData] = useState(null);
  const [sources, setSources] = useState({
    snapshot: 'loading',
    overlay: 'loading',
    prices: 'loading',
  });

  // Prices refresh on a timer, and a slow response for an earlier tick must
  // not overwrite a newer one.
  const seq = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    let timer = null;
    const mark = (key, state) => setSources((s) => ({ ...s, [key]: state }));

    (async () => {
      let snapshot;
      try {
        const res = await fetch('/data.json?v=' + Date.now(), { signal: ac.signal });
        snapshot = await res.json();
      } catch (err) {
        if (!ac.signal.aborted) {
          console.error('snapshot failed', err);
          setSources({ snapshot: 'error', overlay: 'error', prices: 'error' });
        }
        return;
      }
      if (ac.signal.aborted) return;

      // Paint. From here the page is interactive and only the corrected
      // fields are still outstanding.
      setData(snapshot);
      mark('snapshot', 'ready');

      // A source that never answers must not leave a skeleton animating
      // forever -- past the deadline the snapshot value is shown instead.
      const deadline = setTimeout(() => {
        setSources((s) => ({
          snapshot: s.snapshot,
          overlay: s.overlay === 'loading' ? 'stale' : s.overlay,
          prices: s.prices === 'loading' ? 'stale' : s.prices,
        }));
      }, TIMEOUT_MS);

      let catalog;
      try {
        catalog = await loadProjects(ac.signal);
      } catch (err) {
        if (!ac.signal.aborted) {
          console.warn('gg-index catalog unavailable; snapshot stands', err);
          clearTimeout(deadline);
          setSources((s) => ({ ...s, overlay: 'stale', prices: 'stale' }));
        }
        return;
      }
      if (ac.signal.aborted) return;

      // Independent of each other, and each lands on its own. Awaiting both
      // together would hold the faster one hostage to the slower.
      loadOverlay(ac.signal, catalog)
        .then((overlay) => {
          if (ac.signal.aborted) return;
          setData((current) => applyOverlay(current, overlay));
          mark('overlay', 'ready');
        })
        .catch((err) => {
          if (ac.signal.aborted) return;
          console.warn('overlay failed; snapshot figures stand', err);
          mark('overlay', 'stale');
        });

      const pullPrices = async () => {
        const mine = ++seq.current;
        try {
          const prices = await loadPrices(catalog, ac.signal, snapshot);
          if (ac.signal.aborted || mine !== seq.current) return;
          setData((current) => applyPrices(current, prices));
          mark('prices', 'ready');
        } catch (err) {
          if (ac.signal.aborted || mine !== seq.current) return;
          console.warn('price load failed', err);
          mark('prices', 'stale');
        }
      };

      await pullPrices();
      clearTimeout(deadline);
      if (!ac.signal.aborted) timer = setInterval(pullPrices, 60_000);
    })();

    return () => {
      ac.abort();
      if (timer) clearInterval(timer);
    };
  }, []);

  return {
    data,
    sources,
    /** True while `key`'s figures are still being corrected. */
    pending: (key) => sources[key] === 'loading',
    /** True once every source has settled, one way or the other. */
    settled: Object.values(sources).every((s) => s !== 'loading'),
  };
}
