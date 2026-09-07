import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { tabsForProject } from './routes';

/**
 * Scroll the active section into view, and keep `onActiveId` in sync as the
 * page is scrolled. Used by project pages (`/mancer/revenue`) and ecosystem
 * (`/ecosystem?tab=revenue`).
 */
export function useSectionScrollSpy({ sectionIds, activeId, onActiveId, ready }) {
  const skip = useRef(false);
  const idsKey = (sectionIds || []).join('|');

  useEffect(() => {
    if (!ready || !activeId) return;
    if (skip.current) {
      skip.current = false;
      return;
    }
    const el = document.getElementById(activeId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [ready, activeId]);

  useEffect(() => {
    if (!ready) return undefined;
    const ids = idsKey ? idsKey.split('|') : [];
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!nodes.length) return undefined;

    const obs = new IntersectionObserver(
      (entries) => {
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
  const tabs = tabsForProject(meta).map((t) => t.slug);
  const onActiveId = useCallback((slug) => {
    if (!project) return;
    navigate(`/${project}/${slug}`, { replace: true });
  }, [navigate, project]);
  useSectionScrollSpy({
    sectionIds: tabs,
    activeId: tab,
    ready: !!(ready && project),
    onActiveId,
  });
}
