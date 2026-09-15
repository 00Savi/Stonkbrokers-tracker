/**
 * Renders every route to a string and fails on any crash.
 *
 * This is not a substitute for looking at the page, but it catches the class
 * of bug that a `curl` cannot: the dev server returns 200 for every path
 * because index.html always exists, so a route whose component throws on
 * render is indistinguishable from one that works until you open it.
 *
 * Effects do not run under `renderToString`, so this proves the render pass is
 * clean -- imports resolve, no component is undefined, no field is read off
 * something null. Chart.js draws in an effect, so its canvases come out empty
 * here, which is fine: what is being tested is that the surrounding tree
 * builds at all.
 */
import { renderToString } from 'react-dom/server';
// React Router 7 exports StaticRouter from the package root; the
// `react-router-dom/server` subpath of v6 no longer exists.
import { StaticRouter } from 'react-router-dom';
import fs from 'node:fs';
import App from '../src/app.jsx';
import HomeView from '../src/components/views/HomeView';
import OverviewView from '../src/components/views/OverviewView';
import EcosystemView from '../src/components/views/EcosystemView';
import PortfolioView from '../src/components/views/PortfolioView';
import MemesTokensView from '../src/components/views/MemesTokensView';
import StonkDetailView from '../src/components/views/StonkDetailView';
import MancerDetailView from '../src/components/views/MancerDetailView';
import YardDetailView from '../src/components/views/YardDetailView';
import CardWallDetailView from '../src/components/views/CardWallDetailView';
import BonusDetailView from '../src/components/views/BonusDetailView';
import SpecialDetailView from '../src/components/views/SpecialDetailView';
import NightshadesDetailView from '../src/components/views/NightshadesDetailView';
import { protocolRevenueChart } from '../src/lib/yieldHistory';
import { dateKey } from '../src/lib/dates';

const snapshot = JSON.parse(fs.readFileSync('public/data.json', 'utf8'));

// The loader fires on mount, which never happens here; every route is
// therefore exercised in its skeleton state, which is the state this change
// introduced and so the one most worth proving renders.
globalThis.fetch = () =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) });

const ROUTES = [
  '/',
  '/rankings',
  '/ecosystem',
  '/ecosystem?tab=rankings',
  '/portfolio',
  '/tokens',
  '/stocks',
  '/stonkbrokers/roi',
  '/stonkbrokers/yield',
  '/stonkbrokers/revenue',
  '/stonkbrokers/liquidity',
  '/stonkbrokers/burn',
  '/stonkbrokers/activation',
  '/stonkbrokers/ownership',
  '/mancer/roi',
  '/mancer/yield',
  '/tickeryard/revenue',
  '/cardwall/burn',
  '/index/roi',
  '/rhmachines/revenue',
  '/oakmont/roi',
  '/coattail/roi',
  '/nightshades/roi',
  '/nightshades/yield',
  '/nightshades/roi?faction=ghosts',
  '/bonus',
  '/bonus/roi',
  '/stonkbrokers',
  '/bogus',
  '/stonkbrokers/not-a-tab',
];

let failed = 0;

console.log('routes (skeleton state — the loader has not resolved yet)');
for (const route of ROUTES) {
  try {
    const html = renderToString(
      <StaticRouter location={route}>
        <App />
      </StaticRouter>
    );
    console.log(`  ok    ${route.padEnd(28)} ${html.length} bytes`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${route.padEnd(28)} ${err.message}`);
  }
}

/**
 * Second pass: the views with real data in them.
 *
 * The pass above only ever exercises the empty state, because effects do not
 * run under `renderToString` so the loader never resolves and `data` stays
 * null. That leaves the populated branch -- every chart, every table row,
 * every field access -- completely untested, which is the half where the
 * interesting failures live. Rendering the views directly with the snapshot
 * is what actually covers it.
 */
console.log('\nviews (populated with public/data.json)');
const VIEWS = [
  ['HomeView', HomeView, { data: snapshot }],
  ['OverviewView', OverviewView, { data: snapshot, pending: false }],
  ['EcosystemView', EcosystemView, { data: snapshot }],
  ['PortfolioView', PortfolioView, { data: snapshot }],
  ['MemesTokensView·memes', MemesTokensView, { data: snapshot, type: 'memes' }],
  ['MemesTokensView·stocks', MemesTokensView, { data: snapshot, type: 'stocks' }],
  ['BonusDetailView', BonusDetailView, { data: snapshot }],
  ['Index·roi', SpecialDetailView, { data: snapshot, projectKey: 'index', activeTab: 'roi' }],
  ['Index·revenue', SpecialDetailView, { data: snapshot, projectKey: 'index', activeTab: 'revenue' }],
  ['Index·burn', SpecialDetailView, { data: snapshot, projectKey: 'index', activeTab: 'burn' }],
  ['Index·ownership', SpecialDetailView, { data: snapshot, projectKey: 'index', activeTab: 'ownership' }],
  ['Printer·revenue', SpecialDetailView, { data: snapshot, projectKey: 'printer', activeTab: 'revenue' }],
  ['Printer·burn', SpecialDetailView, { data: snapshot, projectKey: 'printer', activeTab: 'burn' }],
  ['Printer·ownership', SpecialDetailView, { data: snapshot, projectKey: 'printer', activeTab: 'ownership' }],
  ['Oakmont·roi', SpecialDetailView, { data: snapshot, projectKey: 'oakmont', activeTab: 'roi' }],
  ['Oakmont·yield', SpecialDetailView, { data: snapshot, projectKey: 'oakmont', activeTab: 'historical' }],
  ['Oakmont·revenue', SpecialDetailView, { data: snapshot, projectKey: 'oakmont', activeTab: 'revenue' }],
  ['Oakmont·burn', SpecialDetailView, { data: snapshot, projectKey: 'oakmont', activeTab: 'burn' }],
  ['Oakmont·wrap', SpecialDetailView, { data: snapshot, projectKey: 'oakmont', activeTab: 'activation' }],
  ['Oakmont·holders', SpecialDetailView, { data: snapshot, projectKey: 'oakmont', activeTab: 'ownership' }],
  ['Coattail·roi', SpecialDetailView, { data: snapshot, projectKey: 'coattail', activeTab: 'roi' }],
  ['Coattail·revenue', SpecialDetailView, { data: snapshot, projectKey: 'coattail', activeTab: 'revenue' }],
  ['Coattail·yield', SpecialDetailView, { data: snapshot, projectKey: 'coattail', activeTab: 'historical' }],
  ['Coattail·burn', SpecialDetailView, { data: snapshot, projectKey: 'coattail', activeTab: 'burn' }],
  ['Coattail·activation', SpecialDetailView, { data: snapshot, projectKey: 'coattail', activeTab: 'activation' }],
  ['Coattail·ownership', SpecialDetailView, { data: snapshot, projectKey: 'coattail', activeTab: 'ownership' }],
];

const TABS = ['roi', 'historical', 'revenue', 'liquidity', 'burn', 'activation', 'ownership'];
for (const [label, View] of [
  ['Stonk', StonkDetailView],
  ['Mancer', MancerDetailView],
  ['Yard', YardDetailView],
  ['CardWall', CardWallDetailView],
]) {
  for (const tab of TABS) {
    VIEWS.push([`${label}·${tab}`, View, { data: snapshot, activeTab: tab }]);
  }
}

{
  const emptyFaction = {
    market: { tokenPriceUsd: 0.01, nftFloorEth: 0.1, ethPriceUsd: 2000 },
    config: { ticker: 'GHOSTS', unitValue: 1_000_000, nftCa: '0x7cd6e36286f92f55cc8f498e36e10a975a332aac', tokenCa: '0xd6b619a75667cfcc827a3b9b75d807d98b5456d2' },
    activation: { activeCount: 94, percentActivated: 3.13, breakdown: { T0: 40, T1: 20, T2: 20, T3: 10, T4: 4 }, dualBurn: { totalBurnTokens: 0, equivalentBrokersBurnt: 0 }, history: { labels: [], cumulative: [], dailyActivations: [], dailyDeactivations: [] } },
    ownership: { currentMaxSupply: 3000, nftHolders: 80, stonkHolders: 200, ammVaultNfts: 10, circulatingNftSupply: 2990, ownershipRatio: 2.68 },
    tiers: [
      { tier: 'T0', name: 'Shade', reqTokens: 100000, weight: 100, trackedAnnualYieldUsd: 0, dailyDates: [], dailyYields: [] },
    ],
    dailySnapshots: [],
    revenue: {},
  };
  const nsSnap = {
    ...snapshot,
    projects: {
      ...snapshot.projects,
      nightshades: {
        ...emptyFaction,
        config: { ticker: 'NIGHT', kind: 'factions', factions: ['ghosts', 'zombies', 'knights', 'watchers'], unitValue: 1_000_000, logo: 'Nightshades.svg', maxSupply: 12000 },
        ownership: { ...emptyFaction.ownership, currentMaxSupply: 12000 },
        factions: {
          ghosts: emptyFaction,
          zombies: { ...emptyFaction, config: { ...emptyFaction.config, ticker: 'ZOMBIES' } },
          knights: { ...emptyFaction, config: { ...emptyFaction.config, ticker: 'KNIGHTS' } },
          watchers: { ...emptyFaction, config: { ...emptyFaction.config, ticker: 'WATCHERS' } },
        },
      },
    },
  };
  for (const tab of TABS) {
    VIEWS.push([`Nightshades·${tab}`, NightshadesDetailView, { data: nsSnap, activeTab: tab }]);
  }
}

for (const [name, View, props] of VIEWS) {
  try {
    const html = renderToString(
      <StaticRouter location="/stonkbrokers/roi">
        <View {...props} />
      </StaticRouter>
    );
    console.log(`  ok    ${name.padEnd(24)} ${html.length} bytes`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name.padEnd(24)} ${err.message}`);
  }
}

{
  const stonk = snapshot.projects?.stonk;
  const r = stonk?.revenue || {};
  const chart = protocolRevenueChart(stonk);
  const amm = (chart.cols || []).find((c) => c.key === 'amm');
  const lastWalk = Number(r.dailyAmm?.[r.dailyAmm.length - 1]) || 0;
  const lastHistDate = r.historyDates?.[r.historyDates.length - 1];
  const i = (chart.rawLabels || []).findIndex((d) => dateKey(d) === dateKey(lastHistDate));
  const plotted = Number(amm?.data?.[i]);
  if (lastWalk > 0 && Number(r.historyAmm?.at(-1)) === 0) {
    if (!(plotted > 0)) {
      failed++;
      console.error(
        `FAIL  stonk AMM ${lastHistDate} plotted ${plotted} while live walk is ${lastWalk}`,
      );
    } else {
      console.log(`ok    stonk AMM ${lastHistDate} uses live walk $${plotted.toFixed(0)}`);
    }
  }
}

console.log(failed ? `\n${failed} render(s) failed` : `\nall clean`);
process.exit(failed ? 1 : 0);
