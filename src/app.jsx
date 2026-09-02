import React from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { TopNav, TabBar, SiteFooter } from './components/Shell';
import ChartShareLayer from './components/ChartShareLayer';
import { ChartMobileSync } from './lib/charts';
import EcosystemView from './components/views/EcosystemView';
import PortfolioView from './components/views/PortfolioView';
import StonkDetailView from './components/views/StonkDetailView';
import MancerDetailView from './components/views/MancerDetailView';
import YardDetailView from './components/views/YardDetailView';
import CardWallDetailView from './components/views/CardWallDetailView';
import BonusDetailView from './components/views/BonusDetailView';
import MemesTokensView from './components/views/MemesTokensView';
import SpecialDetailView from './components/views/SpecialDetailView';
import { useDashboard } from './lib/useDashboard';
import { PROJECT_BY_SLUG, TAB_BY_SLUG, DEFAULT_TAB, BONUS_LIVE } from './lib/routes';
import { SkeletonCard } from './components/kit';

const DETAIL_VIEWS = {
  stonk: StonkDetailView,
  mancer: MancerDetailView,
  tickeryard: YardDetailView,
  cardwall: CardWallDetailView,
  index: (props) => <SpecialDetailView {...props} projectKey="index" />,
  printer: (props) => <SpecialDetailView {...props} projectKey="printer" />,
  oakmont: (props) => <SpecialDetailView {...props} projectKey="oakmont" />,
};

/**
 * A project page at /:project/:tab.
 *
 * The tab is a route parameter rather than component state, which is the whole
 * point of the exercise: /stonkbrokers/burn survives a refresh, can be
 * bookmarked, and can be linked to. Previously every one of these was
 * `useState('roi')`, so a refresh anywhere in the app returned you to the
 * StonkBrokers ROI tab regardless of where you were.
 *
 * An unknown project or tab redirects rather than rendering blank -- a typo in
 * a shared link should land somewhere real.
 */
function ProjectPage({ data }) {
  const { project, tab } = useParams();
  const key = PROJECT_BY_SLUG[project];
  const activeTab = TAB_BY_SLUG[tab];

  if (!key) return <Navigate to="/" replace />;
  if (key === 'bonus') return <Navigate to={BONUS_LIVE ? '/bonus' : '/'} replace />;
  if (!activeTab) return <Navigate to={`/${project}/${DEFAULT_TAB}`} replace />;

  const View = DETAIL_VIEWS[key];
  if (!View) return <Navigate to="/" replace />;

  return (
    <>
      <TabBar />
      <div className="pt-5">
        {data ? (
          <View data={data} activeTab={activeTab} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
      </div>
    </>
  );
}

/** Scroll to the top when the path changes, but not when only a tab does. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const project = pathname.split('/')[1];
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [project]);
  return null;
}

export default function App() {
  const { data, sources, pending } = useDashboard();
  const booting = sources.snapshot === 'loading';

  if (sources.snapshot === 'error') {
    return (
      <div className="flex min-h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-[13px] text-danger">Could not load the ledger.</p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
            <code className="text-muted">data.json</code> did not respond. Nothing else on this
            page is trustworthy without it, so nothing is shown.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScrollToTop />
      <TopNav live={sources.prices === 'ready'} data={data} pending={booting} />
      <ChartMobileSync />
      <ChartShareLayer />

      <main className="mx-auto w-full max-w-[1500px] px-3 sm:px-4">
        <Routes>
          {/* Home is the portfolio scanner: one wallet paste, no project
              vocabulary to learn first. Project pages stay one click away. */}
          <Route path="/" element={<Navigate to="/portfolio" replace />} />
          <Route path="/rankings" element={<Navigate to="/ecosystem?tab=rankings" replace />} />
          <Route
            path="/ecosystem"
            element={
              <Section title="Ecosystem Overview">
                {data ? <EcosystemView data={data} pending={booting} /> : <SkeletonCard rows={6} />}
              </Section>
            }
          />
          <Route
            path="/portfolio"
            element={
              <Section title="Portfolio">
                {data ? <PortfolioView data={data} /> : <SkeletonCard rows={5} />}
              </Section>
            }
          />
          <Route
            path="/tokens"
            element={
              <Section title="Robinhood Tokens">
                {data ? <MemesTokensView data={data} type="memes" /> : <SkeletonCard rows={5} />}
              </Section>
            }
          />
          <Route
            path="/stocks"
            element={
              <Section title="Robinhood Stock Tokens">
                {data ? <MemesTokensView data={data} type="stocks" /> : <SkeletonCard rows={5} />}
              </Section>
            }
          />
          <Route
            path="/bonus"
            element={
              BONUS_LIVE ? (
                <div className="pt-5">
                  <BonusDetailView data={data} />
                </div>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/:project/:tab"
            element={<ProjectPage data={data} />}
          />
          <Route path="/:project" element={<RedirectToDefaultTab />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

function RedirectToDefaultTab() {
  const { project } = useParams();
  if (!PROJECT_BY_SLUG[project]) return <Navigate to="/" replace />;
  if (project === 'bonus') return <Navigate to={BONUS_LIVE ? '/bonus' : '/'} replace />;
  return <Navigate to={`/${project}/${DEFAULT_TAB}`} replace />;
}

function Section({ children }) {
  return <div className="pb-16 pt-6">{children}</div>;
}
