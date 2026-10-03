import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tabsForProject } from './routes';

/**
 * Scroll the active section into view, and keep `onActiveId` in sync as the
 * page is scrolled. Used by project pages (`/mancer/revenue`).
 */
export function useSectionScrollSpy({ sectionIds, activeId, onActiveId, ready }) {
  const skip = useRef(false);
  const lock = useRef(false);
  const releaseRef = useRef(null);
  const idsKey = (sectionIds || []).join('|');

  const armLock = () => {
    if (releaseRef.current) {
      window.removeEventListener('scrollend', releaseRef.current);
      clearTimeout(releaseRef.current.timer);
    }
    lock.current = true;
    const release = () => {
      lock.current = false;
      clearTimeout(release.timer);
      releaseRef.current = null;
    };
    releaseRef.current = release;
    window.addEventListener('scrollend', release, { once: true });
    release.timer = setTimeout(release, 2500);
  };

  useEffect(() => {
    if (!ready || !activeId) return;
    if (skip.current) {
      skip.current = false;
      return;
    }
    const el = document.getElementById(activeId);
    if (!el) return;
    // A click starts a smooth scroll. The spy must not retarget the URL
    // while that scroll is still moving past other sections.
    armLock();
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, activeId]);

  useEffect(() => {
    if (!ready) return undefined;
    const ids = idsKey ? idsKey.split('|') : [];
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return undefined;

    const obs = new IntersectionObserver(
      (entries) => {
        if (lock.current) return;
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!hit) return;
        const slug = hit.target.id;
        if (!slug || slug === activeId) return;
        skip.current = true;
        onActiveId?.(slug);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0.15, 0.4] },
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [ready, activeId, onActiveId, idsKey]);
}

/** Scroll the URL tab into view, and keep the URL in sync as the page is scrolled. */
export function useProjectScrollSpy(project, tab, meta, ready) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabs = tabsForProject(meta).map((t) => t.slug);
  const onActiveId = useCallback((slug) => {
    if (!project) return;
    const search = searchParams.toString();
    navigate(
      { pathname: `/${project}/${slug}`, search: search ? `?${search}` : '' },
      { replace: true },
    );
  }, [navigate, project, searchParams]);
  useSectionScrollSpy({
    sectionIds: tabs,
    activeId: tab,
    ready: !!(ready && project),
    onActiveId,
  });
}
