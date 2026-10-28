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
import { createRequire } from 'node:module';
import { earnedUsdForNft, earnedUsdForTokenPosition, nftAcquireCostUsd, portfolioValueSeries, walletDailyDrops } from '../src/lib/portfolioHistory.js';
import { applyPrices, pricesLanded } from '../src/lib/prices.js';
import App from '../src/app.jsx';
import HomeView from '../src/components/views/HomeView';
import OverviewView from '../src/components/views/OverviewView';
import EcosystemView from '../src/components/views/EcosystemView';
import PortfolioView from '../src/components/views/PortfolioView';
import BrokerScanView from '../src/components/views/BrokerScanView';
import FloorCheckView from '../src/components/views/FloorCheckView';
import AnvilScanView from '../src/components/views/AnvilScanView';
import MemesTokensView from '../src/components/views/MemesTokensView';
import StonkDetailView from '../src/components/views/StonkDetailView';
import InternDetailView from '../src/components/views/InternDetailView';
import MancerDetailView from '../src/components/views/MancerDetailView';
import YardDetailView from '../src/components/views/YardDetailView';
import CardWallDetailView from '../src/components/views/CardWallDetailView';
import MutualFunDetailView from '../src/components/views/MutualFunDetailView';
import BonusDetailView from '../src/components/views/BonusDetailView';
import SpecialDetailView from '../src/components/views/SpecialDetailView';
import NightshadesDetailView from '../src/components/views/NightshadesDetailView';
import { UnderwaterCard } from '../src/components/UnderwaterCard';
import { ProtocolFeeVolumePanels } from '../src/components/HistoryCharts';
import { AnalysisProvider } from '../src/components/SectionInsights';
import { protocolRevenueChart, resampleSeries, holderRevenueOnLabels } from '../src/lib/yieldHistory';
import { rollupNightshadesOwnership } from '../src/lib/nightshades';
import { tokenValuation } from '../src/lib/valuation';
import { compactNum, compactUsd } from '../src/components/kit';
import { applyLiveMachines, dropsForMachine, freshAlleyDrops } from '../src/lib/cardwallDrops';
import { dateKey } from '../src/lib/dates';
import { PROJECTS, tabsForProject } from '../src/lib/routes';
import { activationTokenCostUsd, nftArtFromUri, tokenPriceAtTs } from '../src/lib/portfolioHistory';
import { attributedStonkBurn, dailyAttributedBurnSeries, firstInternActivationDay } from '../src/lib/burn';
import { navNftScanTargets, navTokenScanTargets } from '../src/lib/portfolioScan';
import { windowLen } from '../src/lib/yieldHistory';
import { CHART_WINDOWS, CHART_INTERVALS, DEFAULT_CHART_WINDOW, DEFAULT_CHART_INTERVAL } from '../src/lib/chartWindow';
import { activityDatasets, divergingAxis, levelAxis, pointValue, xTicksFor } from '../src/lib/charts';
import { walletName } from '../src/lib/wallets';
import { tierRoiDatasets } from '../src/lib/yieldHistory';
import { buildTopicShareCard } from '../src/lib/projectShare';
import { copySectionEl } from '../src/components/CopyControl';
import { internIdsForBroker } from '../src/lib/interns';
import { parseBrokerId } from '../src/lib/brokerScan';
import { internAvailability, liveFloorIndex, parseFloorCount, priceHoldings, purchaseCost, stonkBrokerFloor, walletUsd } from '../src/lib/floorCheck';
import { ANVIL_VAULTS, internRowState, internStatusLine, predictTbaAddress, rankVaultRows, rowsFromVaultBook, snipeCostFor, wallFloorEth, wallStars } from '../src/lib/anvilScan';
import { cheapestWallEth, listedSeat, mixUsd, revenueRows, snipeSeatUsd } from '../src/lib/seats';
import { isProjectLive } from '../src/lib/routes';
import { typicalNightshadesSeat } from '../src/lib/nightshades';
import { parseYieldSample } from '../src/lib/yieldSample';
import { paybackMonths, portfolioCashMarkSeries } from '../src/lib/portfolioHistory';
import { seatCsvRows } from '../src/lib/csv';
import { sumVersusHold } from '../src/lib/lpHold';
import { agoLabel, buildTape, eventAgeSeconds, tapeBooks, tokenAmount } from '../src/lib/eventTape';
import { EventTape } from '../src/components/EventTape';
import { heaviestWeekday, monthCells, payoutDays, weekdayRollup } from '../src/lib/payoutCalendar';
import { PayoutCalendar } from '../src/components/PayoutCalendar';

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
  '/broker',
  '/broker?id=1',
  '/floor',
  '/floor?n=5',
  '/anvil',
  '/anvil?project=cardwall',
  '/tokens',
  '/stocks',
  '/stonkbrokers/roi',
  '/stonkbrokers/yield',
  '/stonkbrokers/revenue',
  '/stonkbrokers/liquidity',
  '/stonkbrokers/burn',
  '/stonkbrokers/activation',
  '/stonkbrokers/ownership',
  '/interns/roi',
  '/interns/yield',
  '/interns/revenue',
  '/interns/activation',
  '/interns/ownership',
  '/interns/liquidity',
  '/interns/burn',
  '/mancer/roi',
  '/mancer/yield',
  '/tickeryard/revenue',
  '/tickeryard/roi',
  '/tickeryard/yield',
  '/tickeryard/liquidity',
  '/tickeryard/burn',
  '/tickeryard/activation',
  '/tickeryard/ownership',
  '/cardwall/burn',
  '/mutualfun/roi',
  '/mutualfun/activation',
  '/index/roi',
  '/rhmachines/revenue',
  '/oakmont/roi',
  '/coattail/roi',
  '/nightshades/roi',
  '/nightshades/yield',
  '/nightshades/night',
  '/nightshades/revenue',
  '/nightshades/roi?faction=ghosts',
  '/nightshades/night?faction=ghosts',
  '/nightshades/liquidity',
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
  ['BrokerScanView', BrokerScanView, { data: snapshot }],
  ['FloorCheckView', FloorCheckView, { data: snapshot }],
  ['AnvilScanView', AnvilScanView, { data: snapshot }],
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
  ['Interns', InternDetailView],
  ['Mancer', MancerDetailView],
  ['Yard', YardDetailView],
  ['CardWall', CardWallDetailView],
  ['MutualFun', MutualFunDetailView],
]) {
  for (const tab of TABS) {
    VIEWS.push([`${label}·${tab}`, View, { data: snapshot, activeTab: tab }]);
  }
}
VIEWS.push(['Nightshades·all', NightshadesDetailView, { data: snapshot, activeTab: 'roi' }]);

{
  const html = renderToString(
    <StaticRouter location="/mutualfun/roi">
      <MutualFunDetailView data={snapshot} />
    </StaticRouter>
  );
  const funds = snapshot.projects?.mutualfun?.funds || [];
  if (
    !html.includes('The Mutual Fun')
    || !html.includes('Argon')
    || !html.includes('Retail')
    || !html.includes('Open Market')
    || funds.length !== 5
    || !html.includes('401,000')
    || !html.includes('beta')
  ) {
    failed++;
    console.error('FAIL  mutual fun project page', funds.map((f) => f.name).join(','));
  } else {
    console.log('ok    mutual fun shows five funds and the share classes');
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
        config: { ticker: 'NIGHT', kind: 'factions', factions: ['ghosts', 'zombies', 'knights', 'watchers'], unitValue: 1_000_000, logo: 'Knight.png', maxSupply: 12000 },
        ownership: { ...emptyFaction.ownership, currentMaxSupply: 12000 },
        factions: {
          ghosts: emptyFaction,
          zombies: { ...emptyFaction, config: { ...emptyFaction.config, ticker: 'ZOMBIES' }, activation: { ...emptyFaction.activation, activeCount: 61, percentActivated: 2.03 } },
          knights: { ...emptyFaction, config: { ...emptyFaction.config, ticker: 'KNIGHTS' }, activation: { ...emptyFaction.activation, activeCount: 120, percentActivated: 4.0 } },
          watchers: { ...emptyFaction, config: { ...emptyFaction.config, ticker: 'WATCHERS' }, activation: { ...emptyFaction.activation, activeCount: 44, percentActivated: 1.47 } },
        },
        night: {
          nightId: 1,
          phase: 'awaiting',
          startedAt: 1789480810,
          endsAt: 1789484410,
          nextStartsAt: 1789567210,
          favored: ['watchers', 'ghosts'],
          struck: ['knights', 'zombies'],
          magnitudeBps: 6285,
          sunriseBps: 2500,
          moveBps: 2000,
          vaultWeth: 49.35,
          vaultWethUsd: 119000,
          sunriseWeth: 18.12,
          sunriseWethUsd: 43600,
          poolsWeth: 28.0,
          poolsWethUsd: 67300,
          moveWethMin: 1.38,
          moveWethMax: 4.22,
          moveWethMaxUsd: 10100,
          pools: {
            ghosts: { weth: 10.6, usd: 25500 },
            watchers: { weth: 10.48, usd: 25200 },
            knights: { weth: 3.48, usd: 8400 },
            zombies: { weth: 3.43, usd: 8200 },
          },
          vaultTokens: { ghosts: 2.19e8, zombies: 4.58e7, knights: 4.29e7, watchers: 2.32e8 },
          lastStrikeTx: '0x231421da3c994c5ebe841e4164dbea7bcac09dea75461203c5e95432d6e98de4',
          history: [{
            nightId: 1,
            date: '2026-09-15',
            startedAt: 1789480810,
            endsAt: 1789484410,
            favored: ['watchers', 'ghosts'],
            struck: ['knights', 'zombies'],
            magnitudeBps: 6285,
            tx: '0x231421da3c994c5ebe841e4164dbea7bcac09dea75461203c5e95432d6e98de4',
          }],
        },
      },
    },
  };
  for (const tab of TABS.filter((t) => t !== 'liquidity' && t !== 'revenue').concat(['night'])) {
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
  const burnHtml = renderToString(
    <StaticRouter location="/stonkbrokers/burn">
      <StonkDetailView data={snapshot} activeTab="burn" />
    </StaticRouter>
  );
  const banned = ['>Token</button>', '>NFT</button>', '>Both</button>'];
  const leftover = banned.filter((s) => burnHtml.includes(s));
  if (!burnHtml.includes('Price against burn') || leftover.length) {
    failed++;
    console.error(`FAIL  price against burn missing ${leftover.join(', ')}`);
  } else {
    console.log('ok    flywheel is token price only');
  }
}

{
  const html = renderToString(
    <StaticRouter location="/cardwall/revenue">
      <CardWallDetailView data={snapshot} activeTab="revenue" />
    </StaticRouter>
  );
  const want = ['Gacha pull revenue', 'The Alley', 'The Claw', 'Card value out', 'Latest drops', 'All machines', 'cardwall-drop-machine', 'Copy section', 'Click a card for the full pull', 'Paid in vs card value out', 'Legendary Pokemon $250', 'thecardwall.com/crane'];
  const missing = want.filter((s) => !html.includes(s));
  if (missing.length) {
    failed++;
    console.error(`FAIL  cardwall gacha missing ${missing.join(', ')}`);
  } else {
    console.log('ok    cardwall gacha revenue rendered');
  }
  const snapDrops = [{ id: 'alley:1', at: '2026-09-29T16:00:00Z', game: 'alley', machine: 'Elite Pokemon $50', paid: 50, value: 40 }];
  const live = [
    snapDrops[0],
    { id: 'alley:2', at: '2026-09-29T18:31:30Z', game: 'alley', machine: 'Grail Pokemon $1000', paid: 1000, value: 625 },
    { id: 'claw:9', at: '2026-09-29T18:40:00Z', game: 'claw', machine: 'The Claw', paid: 5, value: 1 },
  ];
  const fresh = freshAlleyDrops(snapDrops, live);
  const folded = applyLiveMachines([{ id: '0xabc', label: 'Elite Pokemon $50', pulls: 10, usd: 500, paidIn: 500, valueOut: 400, spread: 100 }], fresh);
  const grail = folded.find((row) => row.label === 'Grail Pokemon $1000');
  const elite = folded.find((row) => row.label === 'Elite Pokemon $50');
  if (fresh.length !== 1 || !grail || grail.pulls !== 1 || grail.paidIn !== 1000 || grail.valueOut !== 625 || elite.pulls !== 10) {
    failed++;
    console.error('FAIL  live alley spins did not fold onto the machine table');
  } else {
    console.log('ok    alley machine table folds spins newer than the snapshot');
  }
  const pulls = [
    { id: 'alley:10', at: '2026-09-28T12:00:00Z', game: 'alley', machine: 'Hyper Pokemon $500', paid: 500, value: 200 },
    { id: 'alley:11', at: '2026-09-29T12:00:00Z', game: 'alley', machine: 'Hyper Pokemon $500', paid: 500, value: 300 },
    { id: 'alley:12', at: '2026-09-29T13:00:00Z', game: 'alley', machine: 'Elite Pokemon $50', paid: 50, value: 40 },
  ];
  const filtered = dropsForMachine(snapDrops, live, pulls, 'Hyper Pokemon $500');
  const mixed = dropsForMachine(snapDrops, live, pulls, '');
  const clawOnly = dropsForMachine(snapDrops, live, pulls, 'The Claw');
  if (
    filtered.length !== 2
    || filtered[0].id !== 'alley:11'
    || filtered.some((drop) => drop.machine !== 'Hyper Pokemon $500')
    || mixed.length !== 3
    || clawOnly.length !== 1
    || clawOnly[0].id !== 'claw:9'
  ) {
    failed++;
    console.error('FAIL  latest drops machine filter');
  } else {
    console.log('ok    latest drops filter by machine');
  }
  const stripped = JSON.parse(JSON.stringify(snapshot));
  delete stripped.projects.cardwall.gacha;
  const withGacha = renderToString(
    <StaticRouter location="/ecosystem">
      <OverviewView data={snapshot} />
    </StaticRouter>
  );
  const without = renderToString(
    <StaticRouter location="/ecosystem">
      <OverviewView data={stripped} />
    </StaticRouter>
  );
  if (withGacha !== without) {
    failed++;
    console.error('FAIL  overview protocol revenue still includes gacha');
  } else {
    console.log('ok    overview protocol revenue leaves gacha out');
  }
}

{
  const stonk = snapshot.projects?.stonk;
  const o = stonk?.ownership || {};
  const circ = (o.currentMaxSupply || 0) - (o.ammVaultNfts || 0);
  const ratio = circ > 0 ? +((o.nftHolders / circ) * 100).toFixed(2) : 0;
  if (o.circulatingNftSupply !== circ || o.ownershipRatio !== ratio) {
    failed++;
    console.error(
      `FAIL  stonk circulating ${o.circulatingNftSupply} ratio ${o.ownershipRatio}% (want ${circ} / ${ratio}%)`,
    );
  } else {
    console.log(`ok    stonk circulating ${circ}  concentration ${ratio}%`);
  }
  const row = (stonk?.dailySnapshots || []).find((s) => String(s.date).startsWith('2026-08-23'));
  if (row && Number(row.tokenHolders) < 15000) {
    failed++;
    console.error(`FAIL  8/23 token holders still a dip (${row.tokenHolders})`);
  }
  const cliff = (stonk?.dailySnapshots || []).find((s) => Number(s.ownershipRatio) > 40);
  if (cliff) {
    failed++;
    console.error(`FAIL  concentration cliff still in snapshots ${cliff.date} ${cliff.ownershipRatio}%`);
  }
}

{
  const html = renderToString(
    <StaticRouter location="/interns/roi">
      <InternDetailView data={snapshot} activeTab="roi" />
    </StaticRouter>
  );
  const banned = ['Opening mint', 'Mint price per intern', 'First 24h', '+10%/day', '+999/day', 'Ceiling 9,999', '$20 in ETH', 'Vs intern token supply', 'intern burn velocity'];
  const leftover = banned.filter((s) => html.includes(s));
  const intern = snapshot.projects?.interns;
  const live = Number(intern?.ownership?.liveInterns);
  const liveLabel = Number.isFinite(live) ? live.toLocaleString('en-US') : '';
  if (leftover.length) {
    failed++;
    console.error(`FAIL  intern mint price leftover=${leftover.join('|')}`);
  } else if (html.includes('id="liquidity"') || html.includes('id="burn"')) {
    failed++;
    console.error('FAIL  intern page still has liquidity/burn sections');
  } else if (!html.includes('Parent burn chart') || !html.includes('Interns burnt') || !html.includes('StonkBrokers burnt') || !html.includes('do not share an activation manager')) {
    failed++;
    console.error('FAIL  intern activation burn split missing');
  } else if (intern?.underConstruction || !intern?.config?.nftCa || !(live > 0)) {
    failed++;
    console.error('FAIL  intern snapshot is still the empty stub');
  } else if (!html.includes(liveLabel) && !html.includes(String(live))) {
    failed++;
    console.error(`FAIL  intern live count ${live} not on the page`);
  } else if (html.includes('NFT vs token holders')) {
    failed++;
    console.error('FAIL  intern ownership chart still plots the parent token');
  } else {
    console.log(`ok    intern page has no mint schedule; ${liveLabel} live`);
  }
  const internTabs = tabsForProject(PROJECTS.find((p) => p.key === 'interns')).map((t) => t.slug);
  if (internTabs.includes('liquidity') || internTabs.includes('burn')) {
    failed++;
    console.error(`FAIL  intern tabs still include ${internTabs.join(',')}`);
  } else {
    console.log(`ok    intern tabs ${internTabs.join(',')}`);
  }
}

{
  const html = renderToString(
    <StaticRouter location="/tickeryard/revenue">
      <YardDetailView data={snapshot} activeTab="revenue" />
    </StaticRouter>
  );
  const banned = ['Protocol Vault Inflows', 'Yard AMM Protocol Rev', 'Snipe / Curve Tax', 'Protocol Revenue & Ecosystem Liquidity'];
  const missing = ['Vault distributions', 'Holder payout', 'yBTC wrap fee'];
  const leftover = banned.filter((s) => html.includes(s));
  const absent = missing.filter((s) => !html.includes(s));
  if (leftover.length || absent.length) {
    failed++;
    console.error(`FAIL  yard revenue headings leftover=${leftover.join('|') || 'none'} missing=${absent.join('|') || 'none'}`);
  } else {
    console.log('ok    yard revenue headings are vault distributions / holder payout');
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

{
  const stonk = snapshot.projects?.stonk;
  const interns = snapshot.projects?.interns;
  const snap = [...(stonk?.dailySnapshots || [])].reverse().find((s) => Number(s.tokenPriceUsd) > 0 && Number(s.tokenPriceUsd) !== 0.03);
  const ts = snap ? (Number(snap.timestamp) > 1e12 ? Number(snap.timestamp) / 1000 : Number(snap.timestamp)) : 0;
  const px = tokenPriceAtTs(stonk, ts);
  const t0 = activationTokenCostUsd(stonk, { tierId: 'T0', ts });
  const internAct = activationTokenCostUsd(interns, { tierId: 'T0', ts, data: snapshot });
  const internReq = Number((interns?.tiers || []).find((t) => t.tier === 'T0' || t.id === 'T0')?.reqTokens) || 3333;
  if (!(px > 0)) {
    failed++;
    console.error(`FAIL  tokenPriceAtTs returned ${px}`);
  } else {
    console.log(`ok    tokenPriceAtTs ${px} on ${snap?.date || 'live'}`);
  }
  const req = Number((stonk?.tiers || []).find((t) => t.tier === 'T0')?.reqTokens) || 66666;
  const want = req * px;
  if (!(t0.usd > 0) || Math.abs(t0.usd - want) > 1) {
    failed++;
    console.error(`FAIL  stonk T0 act cost ${t0.usd} want ~${want}`);
  } else {
    console.log(`ok    stonk T0 act ~$${t0.usd.toFixed(0)}`);
  }
  if (internAct.tokens !== internReq || !(internAct.usd > 0)) {
    failed++;
    console.error(`FAIL  intern T0 act ${internAct.tokens} tokens $${internAct.usd} (want ${internReq})`);
  } else {
    console.log(`ok    intern T0 act ${internAct.tokens} STONK ~$${internAct.usd.toFixed(0)}`);
  }
}

{
  const html = renderToString(
    <StaticRouter location="/stonkbrokers/burn">
      <StonkDetailView data={snapshot} activeTab="burn" />
    </StaticRouter>
  );
  const split = attributedStonkBurn(snapshot.projects?.stonk, snapshot.projects?.interns);
  const daily = dailyAttributedBurnSeries(snapshot.projects?.stonk, snapshot.projects?.interns, 'all');
  const firstDay = firstInternActivationDay(snapshot.projects?.interns);
  if (!html.includes('Interns burnt') || !html.includes('StonkBrokers burnt') || !html.includes('Separate manager')) {
    failed++;
    console.error('FAIL  stonk burn split tiles missing');
  } else if (html.includes('Intern activations (amber)')) {
    failed++;
    console.error('FAIL  intern overlay still on the total burn chart');
  } else if (!html.includes('>Daily split<') || !html.includes('Price against burn') || !html.includes('>Cumulative<')) {
    failed++;
    console.error('FAIL  daily intern vs broker burn chart missing under flywheel');
  } else if (!(split.total > 0) || !(split.intern > 0) || split.brokers + split.intern !== split.total && Math.abs(split.brokers + split.intern - split.total) > 1) {
    failed++;
    console.error(`FAIL  burn split total=${split.total} intern=${split.intern} brokers=${split.brokers}`);
  } else if (split.intern >= split.total) {
    failed++;
    console.error(`FAIL  intern burn ${split.intern} is not a subset of token burn ${split.total}`);
  } else if (!firstDay || daily.startDay !== firstDay || daily.rawLabels[0] !== firstDay) {
    failed++;
    console.error(`FAIL  daily split starts ${daily.startDay}/${daily.rawLabels[0]} want ${firstDay}`);
  } else if (!(daily.intern[0] > 0) || daily.brokers.some((n) => n < 0) || daily.intern.some((n) => n < 0)) {
    failed++;
    console.error(`FAIL  daily split intern=${daily.intern.join(',')} brokers=${daily.brokers.join(',')}`);
  } else {
    const byDay = Object.fromEntries(daily.rawLabels.map((d, i) => [d, { intern: daily.intern[i], brokers: daily.brokers[i] }]));
    const d21 = byDay['2026-09-21'];
    const d22 = byDay['2026-09-22'];
    const stampIntern = 9363836 - 8708037;
    if (!d21 || !(d21.brokers >= 2 * 66666 - 1)) {
      failed++;
      console.error(`FAIL  9/21 broker burn ${d21?.brokers} erased two activations`);
    } else if (!d22 || Math.abs(d22.intern - stampIntern) > 1 || !(d22.brokers > 200000)) {
      failed++;
      console.error(`FAIL  9/22 split intern=${d22?.intern} brokers=${d22?.brokers} want intern ${stampIntern}`);
    } else {
      console.log(`ok    burn split intern=${split.intern} brokers=${split.brokers} total=${split.total}`);
      console.log(`ok    daily split from ${daily.startDay} intern=${daily.intern.map((n) => Math.round(n)).join('/')} brokers=${daily.brokers.map((n) => Math.round(n)).join('/')}`);
    }
  }
}

{
  const targets = navNftScanTargets(snapshot);
  const keys = targets.map((t) => t.pKey);
  const factions = ['nightshades:ghosts', 'nightshades:zombies', 'nightshades:knights', 'nightshades:watchers'];
  const missing = factions.filter((k) => !keys.includes(k));
  const hidden = keys.filter((k) => k === 'coattail' || k === 'printer');
  if (missing.length) {
    failed++;
    console.error(`FAIL  portfolio scan missing ${missing.join(',')}`);
  } else if (hidden.length) {
    failed++;
    console.error(`FAIL  portfolio scan still includes hidden ${hidden.join(',')}`);
  } else if (!keys.includes('stonk') || !keys.includes('interns')) {
    failed++;
    console.error(`FAIL  portfolio scan missing core NFT keys ${keys.join(',')}`);
  } else {
    console.log(`ok    portfolio scan ${keys.length} collections incl. 4 Nightshades factions`);
  }
  const tokens = navTokenScanTargets(snapshot);
  const tokenKeys = tokens.map((t) => t.pKey);
  const wantTokens = ['stonk', 'mancer', 'tickeryard', 'cardwall', 'mutualfun', 'oakmont', ...factions];
  const missingTokens = wantTokens.filter((k) => !tokenKeys.includes(k));
  const cas = tokens.map((t) => t.ca.toLowerCase());
  const stonkCa = snapshot.projects.stonk.config.tokenCa.toLowerCase();
  if (missingTokens.length) {
    failed++;
    console.error(`FAIL  portfolio token scan missing ${missingTokens.join(',')}`);
  } else if (tokenKeys.includes('interns') || tokenKeys.includes('index') || tokenKeys.includes('printer') || tokenKeys.includes('coattail')) {
    failed++;
    console.error(`FAIL  portfolio token scan includes a non-dashboard or duplicate book ${tokenKeys.join(',')}`);
  } else if (cas.filter((ca) => ca === stonkCa).length !== 1) {
    failed++;
    console.error('FAIL  STONK token counted more than once');
  } else {
    console.log(`ok    portfolio token scan ${tokenKeys.length} dashboard tokens, STONK once`);
  }
  if (isProjectLive(PROJECTS.find((p) => p.key === 'coattail')) || isProjectLive(PROJECTS.find((p) => p.key === 'printer'))) {
    failed++;
    console.error('FAIL  coattail/printer flipped live');
  }
}

{
  const allHtml = renderToString(
    <StaticRouter location="/nightshades/roi">
      <NightshadesDetailView data={snapshot} activeTab="roi" />
    </StaticRouter>
  );
  const factionHtml = renderToString(
    <StaticRouter location="/nightshades/yield?faction=ghosts">
      <NightshadesDetailView data={snapshot} activeTab="historical" />
    </StaticRouter>
  );
  if (allHtml.includes('Faction protocol revenue') || allHtml.includes('Daily protocol revenue') || factionHtml.includes('Protocol Revenue')) {
    failed++;
    console.error('FAIL  nightshades still shows faction protocol revenue');
  } else {
    console.log('ok    nightshades protocol revenue removed');
  }
}

{
  if (windowLen('90d', 200) !== 90 || !CHART_WINDOWS.some((w) => w.id === '90d') || CHART_INTERVALS.length !== 3) {
    failed++;
    console.error('FAIL  chart range/interval missing 90D or Daily/Weekly/Monthly');
  } else {
    console.log('ok    chart range 7D/30D/90D/All and interval Daily/Weekly/Monthly');
  }
  if (DEFAULT_CHART_WINDOW !== '30d' || DEFAULT_CHART_INTERVAL !== 'daily') {
    failed++;
    console.error(`FAIL  chart defaults ${DEFAULT_CHART_WINDOW}/${DEFAULT_CHART_INTERVAL}`);
  } else {
    console.log('ok    charts default to 30D daily');
  }
  const daily30 = xTicksFor(30, 'daily');
  const daily30Labels = [];
  const tickCtx = { getLabelForValue: (v) => `D${v}` };
  if (typeof daily30.callback === 'function') {
    for (let i = 0; i < 30; i++) daily30Labels.push(daily30.callback.call(tickCtx, i, i));
  }
  const daily30Shown = daily30Labels.filter((label) => label);
  const daily7 = xTicksFor(7, 'daily');
  if (daily30.autoSkip || daily30.maxRotation !== 0 || daily30.minRotation !== 0 || daily30Shown.length < 8 || daily30Shown.length > 12 || daily30Labels[0] !== 'D0' || daily30Labels[1] !== '' || !daily30Labels[29] || daily7.autoSkip || daily7.callback) {
    failed++;
    console.error(`FAIL  30D daily axis should label every 2nd/3rd day, horizontal ${JSON.stringify({ rot: daily30.maxRotation, shown: daily30Shown.length, first: daily30Labels[0], last: daily30Labels[29] })}`);
  } else {
    console.log(`ok    30D daily axis labels every 3rd day (${daily30Shown.length} headings)`);
  }
  const named = walletName('0x799ae26fa515cef145e8bc8636f7fff87b05cf62');
  const lp = walletName('0x8366a39cc670b4001a1121b8f6a443a643e40951');
  if (pointValue({ x: 1461, y: 0 }, 'y') !== 1461 || pointValue({ y: 12 }, 'x') !== 12 || named?.name !== 'TokenEscrowReserve' || lp?.name !== 'PoolManager') {
    failed++;
    console.error('FAIL  horizontal bar value or wallet names');
  } else {
    console.log('ok    horizontal bars read the width; escrow and PoolManager are named');
  }
  const act = activityDatasets({ net: [10], ins: [4], outs: [3] });
  const div = divergingAxis({}, [4, -3]);
  if (act[2].data[0] !== -3 || !(div.min < 0) || !(div.max > 0)) {
    failed++;
    console.error(`FAIL  activity bars should diverge ${act[2].data[0]} ${JSON.stringify(div)}`);
  } else {
    console.log('ok    deactivations draw below zero');
  }
  const roiSets = tierRoiDatasets(
    [{ date: '2026-09-01', tokenPriceUsd: 1, nftFloorUsd: 50, tiers: [{ tier: 'T1', roi: 20, yieldUsd: 100 }] }],
    [{ tier: 'T1', reqTokens: 10, trackedAnnualYieldUsd: 100 }],
    { floorCostUsd: 50, tokenPriceUsd: 1 },
  );
  if (roiSets[0].pointRadius != null || roiSets[0].payback?.[0] !== 0.6) {
    failed++;
    console.error(`FAIL  tier ROI payback tooltip ${roiSets[0].payback?.[0]} radius ${roiSets[0].pointRadius}`);
  } else {
    console.log('ok    tier ROI tooltip carries payback years');
  }
  const netAxis = levelAxis({}, [1800, 1840, 1900]);
  if (netAxis.beginAtZero || !(netAxis.min > 1500) || !(netAxis.max < 2200)) {
    failed++;
    console.error(`FAIL  level axis still pinned at zero ${JSON.stringify(netAxis)}`);
  } else {
    console.log('ok    level series zoom to the move');
  }
  const topic = buildTopicShareCard(snapshot, { projectKey: 'stonk', tab: 'burn', timeframe: 'all' });
  if (!topic?.page || !String(topic.title || '').includes('Burn')) {
    failed++;
    console.error(`FAIL  topic share card ${topic?.title}`);
  } else {
    console.log(`ok    topic share card ${topic.title}`);
  }
  if (typeof copySectionEl !== 'function') {
    failed++;
    console.error('FAIL  heading copy helper missing');
  } else {
    console.log('ok    heading copy snapshots the live section');
  }
  const tabHtml = renderToString(
    <StaticRouter location="/stonkbrokers/revenue">
      <App />
    </StaticRouter>
  );
  if (tabHtml.includes('Copy for X')) {
    failed++;
    console.error('FAIL  Copy for X still on the tab bar');
  } else if (tabHtml.includes('Copy this heading and its charts for X')) {
    failed++;
    console.error('FAIL  tab bar Copy is still present');
  } else {
    console.log('ok    tab bar has no heading Copy');
  }
  const stonkHtml = renderToString(
    <StaticRouter location="/stonkbrokers/revenue">
      <StonkDetailView data={snapshot} activeTab="revenue" />
    </StaticRouter>
  );
  const missing = ['roi', 'yield', 'revenue', 'liquidity', 'burn', 'activation', 'ownership']
    .filter((id) => !stonkHtml.includes(`id="${id}"`));
  if (missing.length) {
    failed++;
    console.error(`FAIL  stonk heading sections missing ${missing.join(',')}`);
  } else {
    console.log('ok    stonk heading sections ready for Copy all');
  }
  if (!stonkHtml.includes('Chain onboard') || !stonkHtml.includes('Who just arrived')) {
    failed++;
    console.error('FAIL  stonk ownership missing chain onboard');
  } else {
    console.log('ok    stonk ownership has chain onboard');
  }
  const sectionCopies = (stonkHtml.match(/Copy section/g) || []).length;
  if (sectionCopies < 7) {
    failed++;
    console.error(`FAIL  Copy section missing on headings (${sectionCopies})`);
  } else {
    console.log('ok    Copy section is on each heading');
  }
  const ammHtml = renderToString(
    <StaticRouter location="/stonkbrokers/ownership">
      <AnalysisProvider slug="stonk" project={snapshot.projects.stonk}>
        <StonkDetailView data={snapshot} activeTab="ownership" />
      </AnalysisProvider>
    </StaticRouter>,
  );
  const flow = snapshot.projects?.stonk?.ammFlow;
  const flowIn = (flow?.entered || []).reduce((s, n) => s + (Number(n) || 0), 0);
  const flowOut = (flow?.left || []).reduce((s, n) => s + (Number(n) || 0), 0);
  const flowEth = (flow?.feeEth || []).reduce((s, n) => s + (Number(n) || 0), 0);
  const flowUsd = flowEth * (Number(snapshot.projects?.stonk?.market?.ethPriceUsd) || 0);
  const ammOk = ammHtml.includes('AMM exchange')
    && ammHtml.includes('Sold into the vault')
    && ammHtml.includes('Bought out of the vault')
    && flowIn > 0
    && ammHtml.includes(compactNum(flowIn))
    && ammHtml.includes(compactNum(flowOut))
    && ammHtml.includes(compactUsd(flowUsd));
  if (!ammOk) {
    failed++;
    console.error('FAIL  stonk ownership missing AMM in/out/fees');
  } else {
    console.log('ok    stonk AMM exchange shows in, out, net, and fees');
  }
  const tierNames = (snapshot.projects?.stonk?.tiers || []).map((t) => `${t.tier}: ${t.name}`);
  const t0At = ammHtml.indexOf('>T0: Floor Trader<');
  const selectedAt = t0At > 0 ? ammHtml.lastIndexOf('aria-selected="true"', t0At) : -1;
  const tierOk = ammHtml.includes('Cash yield vs mark · T0: Floor Trader')
    && ammHtml.includes('aria-label="Seat tier"')
    && tierNames.length === 5
    && tierNames.every((name) => ammHtml.includes(`>${name}<`))
    && selectedAt >= 0
    && t0At - selectedAt < 400;
  if (!tierOk) {
    failed++;
    console.error('FAIL  cash vs mark missing the tier toggle');
  } else {
    console.log('ok    cash vs mark defaults to T0 and lists every tier');
  }
  const seatHtml = renderToString(
    <StaticRouter location="/stonkbrokers/roi">
      <StonkDetailView data={snapshot} activeTab="roi" />
    </StaticRouter>,
  );
  const seatRows = seatCsvRows(snapshot.projects.stonk, { floorUsd: 1000, volume: 1 });
  if (!seatHtml.includes('>CSV<') || seatRows[0][0] !== 'tier' || seatRows.length < 2) {
    failed++;
    console.error('FAIL  seat table missing CSV');
  } else {
    console.log('ok    seat table offers a CSV');
  }
  const opened = Date.parse('2026-09-01T00:00:00Z') / 1000;
  const cashMark = portfolioCashMarkSeries([{
    projectKey: 'stonk',
    nfts: [{
      tierId: 'T0',
      isActive: true,
      lastTransferTs: opened,
      activationTs: opened,
      entryFloorUsd: 1000,
      activationCostUsd: 200,
      basisKnown: false,
      yieldValue: 600,
    }],
  }], snapshot);
  const months = paybackMonths(1200, 600);
  if (months !== 24 || cashMark.labels.length < 2 || !(cashMark.cash.at(-1) > 0) || cashMark.mark.length !== cashMark.cash.length) {
    failed++;
    console.error(`FAIL  portfolio cash vs mark months=${months} days=${cashMark.labels.length} cash=${cashMark.cash.at(-1)}`);
  } else if (parseYieldSample('90') !== '90' || parseYieldSample('nope') !== null) {
    failed++;
    console.error('FAIL  run rate query parser');
  } else {
    console.log(`ok    portfolio cash vs mark ${cashMark.labels.length} days, payback 24 mo, run rate ?r=`);
  }
  const ns = snapshot.projects?.nightshades;
  const factionY = Object.values(ns?.factions || {}).map((f) => Number(f?.tiers?.[0]?.trackedAnnualYieldUsd) || 0);
  const maxFaction = Math.max(0, ...factionY);
  const seat = typicalNightshadesSeat(ns?.factions);
  if (seat.roi > 800 || (maxFaction > 0 && seat.annual > maxFaction * 1.05)) {
    failed++;
    console.error(`FAIL  nightshades All CoC still looks like four seats ${seat.annual} / ${seat.roi.toFixed(1)}%`);
  } else {
    console.log(`ok    nightshades typical Shade CoC ${seat.roi.toFixed(1)}% (not sum of four)`);
  }
  const ecoHtml = renderToString(
    <StaticRouter location="/ecosystem">
      <EcosystemView data={snapshot} />
    </StaticRouter>
  );
  if (ecoHtml.includes('Copy for X')) {
    failed++;
    console.error('FAIL  ecosystem still says Copy for X');
  } else if (!ecoHtml.includes('Copy section')) {
    failed++;
    console.error('FAIL  ecosystem Copy section missing');
  } else if (!ecoHtml.includes('Copy protocol revenue mix for X')) {
    failed++;
    console.error('FAIL  ecosystem protocol revenue cards missing Copy');
  } else {
    console.log('ok    ecosystem heading Copy is Copy section');
  }
  if (ecoHtml.includes('Ecosystem Dominance') || ecoHtml.includes('Daily protocol revenue') || ecoHtml.includes('Ownership Concentration')) {
    failed++;
    console.error('FAIL  ecosystem still overlays incomparable series');
  } else if (!ecoHtml.includes('Own scale') || !ecoHtml.includes('Last sync') || !ecoHtml.includes('Wallets per 100 NFTs')) {
    failed++;
    console.error('FAIL  ecosystem comparison board missing');
  } else if (!ecoHtml.includes('Snipe')) {
    failed++;
    console.error('FAIL  ecosystem seat table missing the snipe cost');
  } else {
    console.log('ok    ecosystem seats, fees, and wallets per 100');
  }
  if (!ecoHtml.includes('Chain onboard') || !/first 10/i.test(ecoHtml)) {
    failed++;
    console.error('FAIL  ecosystem onboard metric missing');
  } else {
    console.log('ok    ecosystem tracks first-10-tx onboard');
  }
  const ecoOwnHtml = renderToString(
    <StaticRouter location="/ecosystem?tab=ownership">
      <EcosystemView data={snapshot} />
    </StaticRouter>
  );
  if (!ecoOwnHtml.includes('Chain onboard over time') || !ecoOwnHtml.includes('Robinhood Chain onboard')) {
    failed++;
    console.error('FAIL  ecosystem onboard chart missing');
  } else if (!ecoOwnHtml.includes('Copy Robinhood Chain onboard for X')) {
    failed++;
    console.error('FAIL  ecosystem onboard card has no copy button');
  } else {
    console.log('ok    ecosystem shows combined onboard chart');
  }
}

{
  const ids = internIdsForBroker(1);
  const parsedIntern = parseBrokerId('4445');
  if (
    parseBrokerId('#12') !== 12 ||
    parseBrokerId('0') != null ||
    parseBrokerId('4445') !== 1 ||
    parsedIntern !== 1 ||
    ids[0]?.id !== 1 ||
    ids[1]?.id !== 4445 ||
    internIdsForBroker(4444)[1]?.id !== 8888
  ) {
    failed++;
    console.error(`FAIL  broker scan ids ${JSON.stringify(ids)} intern ${parsedIntern}`);
  } else {
    console.log('ok    broker scan maps #1 → interns 1 / 4445');
  }
}

{
  const held = priceHoldings([
    { contract: 'native', symbol: 'ETH', amount: 1, nft: false, usdHint: 100 },
    { contract: '0xabc', symbol: 'INTERN', amount: 2, nft: true },
  ], {}, { '0xabc': 5 });
  const net = purchaseCost(20, walletUsd(held));
  const floorBook = {
    projects: {
      stonk: { config: { nftCa: '0xabc', unitValue: 100 }, market: { nftFloorEth: 2, ethPriceUsd: 100, tokenPriceUsd: 1 } },
    },
  };
  const overlaid = liveFloorIndex(floorBook, [{ address: '0xABC', usd: 0.01 }, { address: '0xdef', usd: 7 }]);
  const floor = stonkBrokerFloor(floorBook);
  const states = [
    internAvailability({ minted: true, inWallet: true, dormant: true, parentActive: false }),
    internAvailability({ minted: true, inWallet: true, dormant: true, parentActive: true }),
    internAvailability({ minted: true, inWallet: false, dormant: false, parentActive: true }),
  ];
  if (
    parseFloorCount('4') !== 10 || parseFloorCount('7') !== 7 || net !== -90
    || overlaid['0xabc'] !== 110 || overlaid['0xdef'] !== 7 || floor.usd !== 110
    || states.join() !== 'dormant,available,activated'
  ) {
    failed++;
    console.error(`FAIL  floor check net ${net} floor ${overlaid['0xabc']} states ${states}`);
  } else {
    console.log('ok    floor check nets ask minus wallet');
  }
}

{
  const ranked = rankVaultRows([
    { tokenId: 3, usd: 1, nftCount: 0 },
    { tokenId: 1, usd: 40, nftCount: 0 },
    { tokenId: 2, usd: 40, nftCount: 2 },
  ], 'value');
  const byId = rankVaultRows(ranked, 'id').map((row) => row.tokenId).join(',');
  const vaultIds = ANVIL_VAULTS.map((v) => v.id).join(',');
  if (ranked.map((row) => row.tokenId).join(',') !== '2,1,3' || byId !== '1,2,3' || !vaultIds.includes('cardwall') || !vaultIds.includes('nightshades:watchers')) {
    failed++;
    console.error(`FAIL  anvil scan rank ${ranked.map((r) => r.tokenId)} vaults ${vaultIds}`);
  } else {
    console.log('ok    anvil scan ranks vault NFTs by TBA value');
  }
  const snipe = snipeCostFor(
    { projects: { stonk: { market: { tokenPriceUsd: 0.006, ethPriceUsd: 2000 } } } },
    ANVIL_VAULTS[0],
    { tokens: 666666, eth: 0.2, feeBps: 1500 },
  );
  const net = 1317 - snipe.usd;
  if (!snipe || Math.abs(snipe.usd - 4399.996) > 0.001 || Math.abs(snipe.eth - 2.199998) > 0.000001 || Math.abs(net - (1317 - 4399.996)) > 0.001) {
    failed++;
    console.error(`FAIL  snipe cost ${JSON.stringify(snipe)} net ${net}`);
  } else {
    console.log('ok    snipe cost is 666,666 tokens plus 15% ETH');
  }
  const wallSeat = listedSeat(
    { key: 'cardwall' },
    { market: { starFloorEth: [0.85, 0.2, null, null, null], nftFloorEth: 0.85, ethPriceUsd: 1000, tokenPriceUsd: 0.001 }, tiers: [{ name: 'Foundation', reqTokens: 50000, trackedAnnualYieldUsd: 100 }], config: {} },
  );
  const kept = revenueRows({ gacha: { historyUsd: [50, 50] }, ledger: { historyDelivered: [10] } }, 'all');
  if (cheapestWallEth({ starFloorEth: [0.85, 0.2], nftFloorEth: 0.85 }) !== 0.2 || Math.abs(wallSeat.listed - 250) > 0.001 || snipeSeatUsd(100, 50) !== 150 || mixUsd(kept) !== 0) {
    failed++;
    console.error(`FAIL  seat floor ${wallSeat.listed} mix ${mixUsd(kept)}`);
  } else {
    console.log('ok    wall seat uses the cheapest star and gacha stays out of the mix');
  }
  const anvilHtml = renderToString(
    <StaticRouter location="/anvil">
      <AnvilScanView data={snapshot} />
    </StaticRouter>,
  );
  if (!anvilHtml.includes('vault NFT') || !anvilHtml.includes('scrolls into view')) {
    failed++;
    console.error('FAIL  anvil scan picture note');
  } else {
    console.log('ok    anvil scan offers the vault NFT picture');
  }
  const brokerUri = `data:application/json;base64,${Buffer.from(JSON.stringify({
    name: 'Stonk Broker #34',
    image: 'data:image/svg+xml;base64,PHN2Zw==',
  })).toString('base64')}`;
  const yardUri = `data:application/json;base64,${Buffer.from(JSON.stringify({
    image: 'ipfs://bafyart/34.png',
  })).toString('base64')}`;
  const brokerArt = nftArtFromUri(brokerUri);
  const yardArt = nftArtFromUri(yardUri);
  if (brokerArt !== 'data:image/svg+xml;base64,PHN2Zw==' || yardArt !== 'https://gateway.pinata.cloud/ipfs/bafyart/34.png') {
    failed++;
    console.error(`FAIL  tokenURI art ${brokerArt} ${yardArt}`);
  } else {
    console.log('ok    nft picture comes from tokenURI, not the collection icon');
  }
  const tbaA = predictTbaAddress(ANVIL_VAULTS[0].nftCa, 1);
  const tbaB = predictTbaAddress(ANVIL_VAULTS[0].nftCa, 2);
  if (!/^0x[0-9a-fA-F]{40}$/.test(tbaA) || tbaA.toLowerCase() === tbaB.toLowerCase()) {
    failed++;
    console.error(`FAIL  tba predict ${tbaA} ${tbaB}`);
  } else if (tbaA.toLowerCase() !== '0x062dafba7cd8e475f313376cbd0692c254edd744') {
    failed++;
    console.error(`FAIL  tba fixture ${tbaA}`);
  } else {
    console.log('ok    tba address is deterministic');
  }
  const wallVault = ANVIL_VAULTS.find((v) => v.id === 'cardwall');
  const bookRows = rowsFromVaultBook(ANVIL_VAULTS[0], {
    membership_complete: true,
    count: 1,
    ready_tokens: [ANVIL_VAULTS[0].tokenCa],
    ready_collections: [wallVault.nftCa],
    pieces: [{
      token_id: 1,
      tba: tbaA,
      tokens: [{ address: ANVIL_VAULTS[0].tokenCa, raw: '1000000000000000000' }],
      nfts: [{ collection: wallVault.nftCa, token_ids: [9] }],
    }],
  }, [
    { ca: ANVIL_VAULTS[0].tokenCa, symbol: 'STONK', price: 2, decimals: 18 },
  ], [
    { ca: wallVault.nftCa, symbol: 'Wall', price: 0, nft: true },
  ]);
  const booked = bookRows?.rows?.[0];
  const bookedToken = booked?.holdings?.find((h) => h.symbol === 'STONK');
  const bookedWall = booked?.holdings?.find((h) => h.symbol === 'Wall');
  const rejected = rowsFromVaultBook(ANVIL_VAULTS[0], {
    membership_complete: true,
    count: 1,
    ready_tokens: [ANVIL_VAULTS[0].tokenCa],
    ready_collections: [],
    pieces: [{ token_id: 1, tba: '0x' + '11'.repeat(20), tokens: [], nfts: [] }],
  }, [], []);
  const incomplete = rowsFromVaultBook(ANVIL_VAULTS[0], {
    membership_complete: false,
    count: 0,
    pieces: [],
  }, [], []);
  if (!booked || booked.tba.toLowerCase() !== tbaA.toLowerCase() || bookedToken?.amount !== 1 || bookedToken?.usd !== 2 || bookedWall?.pieces?.[0]?.tokenId !== 9 || bookedWall?.pieces?.[0]?.stars != null || rejected || incomplete) {
    failed++;
    console.error('FAIL  vault book rows', bookedToken, bookedWall, rejected, incomplete);
  } else {
    console.log('ok    vault book keeps ready balances and rejects a bad TBA');
  }
  if (wallStars(0) !== 1 || wallStars(3) !== 4 || wallStars(4) !== 5 || wallStars(6) != null) {
    failed++;
    console.error(`FAIL  wall stars ${wallStars(0)} ${wallStars(3)} ${wallStars(4)}`);
  } else {
    console.log('ok    card wall rarity 0–4 is 1–5 stars');
  }
  const starMarket = { starFloorEth: [0.239, 0.23, 0.239, 0.33, 0.75], nftFloorEth: 0.23 };
  if (wallFloorEth(5, starMarket) !== 0.75 || wallFloorEth(2, starMarket) !== 0.23 || wallFloorEth(3, { nftFloorEth: 0.23 }) !== 0.23) {
    failed++;
    console.error(`FAIL  wall floors ${wallFloorEth(5, starMarket)} ${wallFloorEth(2, starMarket)}`);
  } else if (wallFloorEth(4, { starFloorEth: [null, null, null, null, null], nftFloorEth: 0.2 }) !== 0.2) {
    failed++;
    console.error('FAIL  missing star floors should use the collection floor');
  } else {
    console.log('ok    wall floor follows the star rating');
  }
  const sigma = internRowState({ inWallet: true, dormant: true, parentActive: true });
  const off = internRowState({ inWallet: true, dormant: true, parentActive: false });
  const live = internRowState({ inWallet: true, dormant: false, parentActive: true });
  const gone = internRowState({ inWallet: false, dormant: true, parentActive: true });
  const line = internStatusLine([
    { klass: 'sigma', state: sigma },
    { klass: 'divergent', state: live },
  ]);
  if (sigma !== 'canActivate' || off !== 'dormant' || live !== 'activated' || gone != null || line !== 'Σ can activate · Δ activated') {
    failed++;
    console.error(`FAIL  intern scan state ${sigma} ${off} ${live} ${gone} ${line}`);
  } else {
    console.log('ok    dormant intern under an active broker is priced');
  }
}

{
  const { scoreHolders, scoreTape } = createRequire(process.cwd() + '/package.json')('./lib/underwater.cjs');
  const ts = Date.parse('2026-01-02T00:00:00Z') / 1000;
  const scored = scoreHolders({
    market: { nftFloorEth: 1, ethPriceUsd: 1, tokenPriceUsd: 0.002 },
    dailySnapshots: [{ date: '2026-01-01', nftFloorUsd: 10, tokenPriceUsd: 0.002 }],
    tiers: [],
    activation: { activeTokenTiers: {} },
  }, {
    nft: {
      1: ['0xaaa', ts],
      2: ['0xddd', ts],
      3: ['0xeee', ts],
    },
    tok: {
      '0xbbb': [100, ts],
      '0xccc': [1000, ts],
      '0xddd': [2000, ts],
      '0xeee': [100, ts],
    },
  });
  if (scored.nftOnly !== 2 || scored.tokenOnly !== 1 || scored.both !== 1 || scored.tokenWallets !== 2 || scored.wallets !== 5) {
    failed++;
    console.error(`FAIL  $1 holder mix nft ${scored.nftOnly} token ${scored.tokenOnly} both ${scored.both} tokWallets ${scored.tokenWallets} wallets ${scored.wallets}`);
  } else {
    console.log('ok    holder mix and token line drop bags under $1');
  }

  const tape = scoreTape({
    dailySnapshots: [
      { date: '2026-08-01', nftFloorUsd: 100, tokenPriceUsd: 0.01 },
      { date: '2026-08-02', nftFloorUsd: 40, tokenPriceUsd: 0.002 },
    ],
    tiers: [{ tier: 'T0', dailyDates: ['2026-08-01', '2026-08-02'], dailyYields: [1, 1] }],
  }, {
    token: {
      days: [{
        day: '2026-08-02',
        complete: true,
        cohorts: [{ opened: '2026-08-01', balances: ['100', '1000'] }],
      }],
    },
    nft: {
      days: [{
        day: '2026-08-02',
        complete: true,
        cohorts: [{
          wallets: 1,
          days: ['2026-08-01'],
          acts: [{ day: '2026-08-01', tier: 'T0', tokens: '1000' }],
        }],
      }],
    },
  });
  const point = tape[0] || {};
  // 100 tokens * $0.002 = $0.20, under the $1 line. 1000 * $0.002 = $2, opened at $0.01, so underwater.
  // NFT floor fell 100 -> 40, plus 1000 tokens * $0.01 activation, and $2 of yield does not cover it.
  if (tape.length !== 1 || point.tokenWallets !== 1 || point.tokenUnder !== 1 || point.nftWallets !== 1 || point.nftUnder !== 1) {
    failed++;
    console.error(`FAIL  tape backfill ${JSON.stringify(tape)}`);
  } else {
    console.log('ok    daily holder tape prices each close on its own day');
  }
}

{
  const hidden = renderToString(<UnderwaterCard ownership={{ underwater: { caughtUp: false, wallets: 3 } }} />);
  const shown = renderToString(
    <UnderwaterCard
      ownership={{
        underwater: {
          caughtUp: true,
          wallets: 4,
          underwater: 1,
          pct: 25,
          nftOnly: 2,
          tokenOnly: 1,
          both: 1,
          nftWallets: 3,
          nftUnder: 1,
          nftPct: 33.3,
          tokenWallets: 2,
          tokenUnder: 1,
          tokenPct: 50,
          byWeek: [{ week: '2026-08-17', wallets: 4, underwater: 1, pct: 25 }],
        },
        holderMix: [
          { date: '2026-09-30', nftOnly: 2, tokenOnly: 1, both: 1, wallets: 4 },
          { date: '2026-10-01', nftOnly: 2, tokenOnly: 1, both: 1, wallets: 4, minUsd: 1 },
        ],
        underwaterHistory: [
          { at: '2026-09-30T17:00', pct: 30, nftPct: 40, tokenPct: 20 },
          { at: '2026-09-30T18:00', pct: 25, nftPct: 33.3, tokenPct: 50 },
        ],
      }}
    />
  );
  const nftOnly = renderToString(
    <UnderwaterCard
      tokenLeg={false}
      ownership={{
        underwater: {
          caughtUp: true,
          wallets: 4,
          underwater: 1,
          pct: 25,
          nftOnly: 4,
          tokenOnly: 0,
          both: 0,
          nftWallets: 4,
          nftUnder: 1,
          nftPct: 25,
        },
        holderMix: [{ date: '2026-09-30', nftOnly: 4, tokenOnly: 0, both: 0, wallets: 4 }],
      }}
    />
  );
  if (hidden !== '' || !shown.includes('Holders underwater') || !shown.includes('saved each hour') || !shown.includes('Underwater by the week the position opened') || !shown.includes('Holder mix') || !shown.includes('NFT wallets') || !shown.includes('at least $1') || shown.includes('Payback by tier')) {
    failed++;
    console.error('FAIL  underwater charts');
  } else if (nftOnly.includes('Holder mix') || nftOnly.includes('token only') || nftOnly.includes('token wallets') || !nftOnly.includes('Token bags stay on StonkBrokers')) {
    failed++;
    console.error('FAIL  intern underwater is nft only');
  } else {
    console.log('ok    underwater week, payback, and holder mix');
  }
}

{
  const open = Date.parse('2026-10-11T00:00:00Z') / 1000;
  const project = {
    ownership: { circulatingSupply: 100 },
    cashflow: {
      dailyDates: ['2026-10-05', '2026-10-11', '2026-10-12'],
      dailyRevenue: [50, 10, 20],
    },
    tiers: [{
      tier: 'T0',
      dailyDates: ['2026-10-05', '2026-10-11'],
      dailyYields: [9, 3],
    }],
    dailySnapshots: [],
  };
  const earned = earnedUsdForTokenPosition(project, 10, open);
  const nft = earnedUsdForNft({ ...project, dailySnapshots: [] }, 'T0', open);
  const drops = walletDailyDrops([{
    projectKey: 'index',
    tokenPosition: true,
    balance: 10,
    holdStartTs: open,
  }], { projects: { index: project } });
  if (earned !== 3 || nft !== 3) {
    failed++;
    console.error(`FAIL  open-date filter token ${earned} nft ${nft}`);
  } else if (drops.labels.join(',') !== '2026-10-11,2026-10-12') {
    failed++;
    console.error(`FAIL  token drop dates ${drops.labels.join(',')}`);
  } else {
    console.log('ok    portfolio yield starts on the open day');
  }

  const freeMint = nftAcquireCostUsd({ minted: true, basisKnown: true, basisUsd: 0, entryFloorUsd: 4000 });
  const pricedBuy = nftAcquireCostUsd({ basisKnown: true, basisUsd: 1200, entryFloorUsd: 4000 });
  if (freeMint !== 0 || pricedBuy !== 1200) {
    failed++;
    console.error(`FAIL  nft acquire cost mint=${freeMint} buy=${pricedBuy}`);
  } else {
    console.log('ok    free mint costs nothing against the floor');
  }

  const book = portfolioValueSeries([
    {
      projectKey: 'oak',
      nfts: [{ lastTransferTs: Date.parse('2026-10-11T00:00:00Z') / 1000, floorValue: 10 }],
    },
    {
      projectKey: 'oak:token',
      tokenPosition: true,
      balance: 100,
      holdStartTs: Date.parse('2026-10-12T00:00:00Z') / 1000,
      floorValue: 5,
    },
  ], {
    projects: {
      oak: {
        dailySnapshots: [
          { date: '2026-10-11', nftFloorUsd: 8, tokenPriceUsd: 0.02 },
          { date: '2026-10-12', nftFloorUsd: 10, tokenPriceUsd: 0.05 },
        ],
      },
    },
  });
  const openDay = book.total[0];
  const nextDay = book.labels.indexOf('2026-10-12');
  if (book.labels[0] !== '2026-10-11' || openDay !== 8 || nextDay < 0 || book.total[nextDay] !== 15 || book.total.at(-1) !== 15) {
    failed++;
    console.error(`FAIL  portfolio value line ${book.labels.join(',')} ${book.total.join(',')}`);
  } else {
    console.log('ok    portfolio value line marks seats and tokens from the open day');
  }

  const base = {
    projects: {
      oakmont: {
        market: { tokenPriceUsd: 0.0004, ethPriceUsd: 2500 },
        config: {},
        tiers: [],
      },
    },
  };
  const usdOnly = { ethPriceUsd: null, tokens: { oakmont: { usd: 0.0005, eth: null, impliedEthUsd: null, trades: 3 } } };
  const patched = applyPrices(base, usdOnly);
  if (!pricesLanded(usdOnly) || patched.projects.oakmont.market.tokenPriceUsd !== 0.0005) {
    failed++;
    console.error('FAIL  USD price dropped without an ETH quote');
  } else if (pricesLanded({ ethPriceUsd: null, tokens: {} })) {
    failed++;
    console.error('FAIL  empty price pull looked ready');
  } else {
    console.log('ok    token USD lands without an ETH quote');
  }

  const weekly = resampleSeries(
    ['2026-10-12', '2026-10-13', '2026-10-14'],
    [40, null, null],
    'weekly',
    'last',
  );
  if (weekly.data[0] !== 40) {
    failed++;
    console.error(`FAIL  weekly blank day became ${weekly.data[0]}`);
  } else {
    console.log('ok    weekly last keeps the previous finite value');
  }

  const emptyRoll = rollupNightshadesOwnership({
    ghosts: { ownership: {} },
    zombies: { ownership: {} },
    knights: { ownership: {} },
    watchers: { ownership: {} },
  });
  const partialRoll = rollupNightshadesOwnership({
    ghosts: { ownership: { currentMaxSupply: 3000, nftHolders: 10, ammVaultNfts: 100 } },
    zombies: { ownership: {} },
    knights: { ownership: {} },
    watchers: { ownership: {} },
  });
  if (emptyRoll !== null || partialRoll?.currentMaxSupply !== 3000 || partialRoll?.circulatingNftSupply !== 2900) {
    failed++;
    console.error(`FAIL  nightshades rollup invented supply ${JSON.stringify(emptyRoll)} ${JSON.stringify(partialRoll)}`);
  } else {
    console.log('ok    nightshades rollup skips factions with no supply');
  }

  const oak = snapshot.projects.oakmont;
  const circ = oak.ownership.circulatingSupply;
  const px = oak.market.tokenPriceUsd;
  const valued = tokenValuation(circ, px, 100_000_000);
  const holdersHtml = renderToString(
    <StaticRouter location="/oakmont/ownership">
      <SpecialDetailView data={snapshot} projectKey="oakmont" activeTab="ownership" />
    </StaticRouter>
  );
  const supplyHtml = renderToString(
    <StaticRouter location="/oakmont/burn">
      <SpecialDetailView data={snapshot} projectKey="oakmont" activeTab="burn" />
    </StaticRouter>
  );
  const mcapLabel = holdersHtml.includes('$STRIKE market cap');
  const fdvLabel = holdersHtml.includes('$STRIKE FDV');
  const mcapValue = holdersHtml.includes(compactUsd(valued.marketCapUsd));
  const fdvValue = holdersHtml.includes(compactUsd(valued.fdvUsd));
  if (valued.fdvUsd <= valued.marketCapUsd) {
    failed++;
    console.error('FAIL  strike FDV did not use the 100M cap');
  } else if (!mcapLabel || !fdvLabel || !mcapValue || !fdvValue) {
    failed++;
    console.error(`FAIL  oakmont holders tile mcap=${mcapLabel}/${mcapValue} fdv=${fdvLabel}/${fdvValue} (${compactUsd(valued.marketCapUsd)} vs ${compactUsd(valued.fdvUsd)})`);
  } else if (supplyHtml.includes('$RESERVE FDV') || holdersHtml.includes('$RESERVE FDV') || !supplyHtml.includes('$RESERVE mcap')) {
    failed++;
    console.error('FAIL  reserve outstanding × price is still labeled FDV');
  } else {
    console.log('ok    strike FDV uses the fixed cap');
  }
}

{
  const vaults = [
    { mode: 0, tvlUsd: 100, fees7dUsd: 20, protocolFees7dUsd: 2, versusHold: { feesKeptUsd: 18, gapUsd: -5, netUsd: 13, windowDays: 7 } },
    { mode: 1, tvlUsd: 50, fees7dUsd: 8, protocolFees7dUsd: 1, versusHold: { feesKeptUsd: 7, gapUsd: -1, netUsd: 6, windowDays: 7 } },
    { mode: 2, tvlUsd: 10, fees7dUsd: 4, protocolFees7dUsd: 0.4 },
  ];
  const all = sumVersusHold(vaults, null);
  const fr = sumVersusHold(vaults, 0);
  const ask = sumVersusHold(vaults, 2);
  if (!all || all.n !== 2 || all.feesKeptUsd !== 25 || all.gapUsd !== -6 || all.netUsd !== 19 || !fr || fr.n !== 1 || fr.gapUsd !== -5 || ask) {
    failed++;
    console.error('FAIL  smart LP versus hold sum', all, fr, ask);
  } else {
    console.log('ok    smart LP versus hold sums by mode');
  }
  const stonk = snapshot.projects.stonk;
  const sample = (stonk.revenue?.smartLp?.vaults || []).slice(0, 1).map((v) => ({
    ...v,
    versusHold: { feesKeptUsd: 18, gapUsd: -12345.67, netUsd: -12327.67, windowDays: 7 },
  }));
  const data = {
    ...snapshot,
    projects: {
      ...snapshot.projects,
      stonk: {
        ...stonk,
        revenue: {
          ...stonk.revenue,
          smartLp: { ...stonk.revenue.smartLp, vaults: sample },
        },
      },
    },
  };
  const html = renderToString(
    <StaticRouter location="/stonkbrokers/liquidity">
      <StonkDetailView data={data} activeTab="liquidity" />
    </StaticRouter>
  );
  if (!sample.length || !html.includes('Versus hold') || !html.includes('Fees kept') || !html.includes('-$12.3k')) {
    failed++;
    console.error('FAIL  smart LP hold panel');
  } else {
    console.log('ok    smart LP hold panel');
  }
}

{
  const amm = '0xe302733accf4800146e55fc45b46b4e4ffc032d2';
  const book = { slug: 'stonk', nftCa: '0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0', ammCa: amm, label: 'StonkBrokers' };
  const tape = buildTape([
    { kind: 'transfer', token_id: '5', from: amm, to: '0xabc0000000000000000000000000000000000001', block_number: 10, log_index: 1, transaction_hash: '0x1', book },
    { kind: 'transfer', token_id: '9', from: '0xdef0000000000000000000000000000000000002', to: amm, block_number: 12, log_index: 0, transaction_hash: '0x2', book },
    { kind: 'activated', token_id: '3', value: '66666000000000000000000', to: '0x1110000000000000000000000000000000000003', block_number: 11, log_index: 2, transaction_hash: '0x3', book },
    { kind: 'cleared', token_id: '8', block_number: 11, log_index: 4, transaction_hash: '0x4', book },
    { kind: 'transfer', token_id: null, from: amm, to: '0xabc0000000000000000000000000000000000001', block_number: 99, log_index: 0, transaction_hash: '0x5', book },
  ]);
  const kinds = tape.map((row) => `${row.kind}#${row.tokenId}`).join(',');
  const want = 'sold-in#9,deactivation#8,activation#3,bought-out#5';
  const stonkBooks = tapeBooks('stonk');
  const ghostBooks = tapeBooks('nightshades', 'ghosts');
  const allNight = tapeBooks('nightshades', 'all');
  if (
    kinds !== want
    || tape[2].amount !== '66,666'
    || tokenAmount('66666000000000000000000') !== '66,666'
    || agoLabel(eventAgeSeconds(100, 100 + 10 * 600)) !== '10m ago'
    || stonkBooks.length !== 1
    || stonkBooks[0].slug !== 'stonk'
    || ghostBooks.length !== 1
    || ghostBooks[0].slug !== 'ghosts'
    || allNight.length !== 4
    || tapeBooks('oakmont').length !== 0
  ) {
    failed++;
    console.error('FAIL  event tape', kinds, stonkBooks, ghostBooks.length, allNight.length);
  } else {
    console.log('ok    event tape orders swaps, activations, and deactivations');
  }
  const html = renderToString(
    <StaticRouter location="/stonkbrokers/roi">
      <EventTape books={stonkBooks} />
    </StaticRouter>
  );
  if (!html.includes('Latest moves') || !html.includes('Loading the latest moves')) {
    failed++;
    console.error('FAIL  event tape shell');
  } else {
    console.log('ok    event tape shell');
  }
}

{
  const project = {
    bookSlug: 'stonk',
    config: { ticker: 'STONK' },
    activation: { breakdown: { T0: 1 } },
    tiers: [{
      tier: 'T0',
      name: 'Floor Trader',
      weight: 100,
      dailyDates: ['2026-10-18', '2026-10-19', '2026-10-20'],
      dailyYields: [10, 0, 5],
    }],
    revenue: {
      historyDates: ['2026-10-18', '2026-10-19', '2026-10-20'],
      historyAmm: [10, 0, 5],
      historyBox: [2, 0, 1],
      historyTax: [0, 0, 3],
      historyBooster: [0, 0, 0],
      historySmartLp: [0, 0, 0],
      historyPaid: [0, 0, 0],
      historyFloat: [0, 0, 0],
      historyDex: [0, 0, 0],
    },
  };
  const days = payoutDays(project, project.tiers[0]);
  const byDate = new Map(days.map((day) => [day.date, day]));
  const cells = monthCells(2026, 10, byDate);
  const heavy = heaviestWeekday(weekdayRollup(days));
  const oct18 = byDate.get('2026-10-18');
  const oct20 = byDate.get('2026-10-20');
  const html = renderToString(
    <StaticRouter location="/stonkbrokers/roi">
      <PayoutCalendar project={project} />
    </StaticRouter>
  );
  if (
    days.length !== 3
    || oct18?.floatShare !== 10
    || oct18?.paidShare !== 0
    || oct18?.sources.map((row) => row.key).join(',') !== 'box'
    || oct20?.sources.map((row) => row.key).join(',') !== 'box,tax'
    || heavy?.long !== 'Sunday'
    || cells[3]?.day !== 1
    || !html.includes('Payout calendar')
    || !html.includes('Still in the pot')
    || !html.includes('Clock-In')
    || !html.includes('Snipe tax')
  ) {
    failed++;
    console.error('FAIL  payout calendar', oct18, oct20, heavy, cells[3]);
  } else {
    console.log('ok    payout calendar splits pot cash from protocol streams');
  }
}

{
  const stonkTabs = tabsForProject(PROJECTS.find((p) => p.key === 'stonk')).map((t) => t.slug);
  const stonk = snapshot.projects.stonk;
  const data = {
    ...snapshot,
    projects: {
      ...snapshot.projects,
      stonk: {
        ...stonk,
        market: { ...stonk.market, ethPriceUsd: 1000 },
        revenue: {
          ...stonk.revenue,
          pairTokenUsd: 40,
          dailyPairTokens: [40],
          historyPairTokens: [40],
          pairTokens: {
            count: 2,
            protocolFeeBps: 1000,
            protocolFees7dUsd: 40,
            fees7dUsd: 400,
            totalTvlUsd: 25000,
            pairs: [
              { ca: '0x873f0000000000000000000000000000000004ab', symbol: 'USONVDA', symbol0: 'USO', symbol1: 'NVDA', tvlUsd: 20000, fees7dUsd: 300, protocolFees7dUsd: 30 },
              { ca: '0x0d1400000000000000000000000000000000dca8', symbol: 'ETHNVDA', symbol0: 'ETH', symbol1: 'NVDA', tvlUsd: 5000, fees7dUsd: 100, protocolFees7dUsd: 10 },
            ],
          },
          clockIn: {
            rounds: 12,
            ethDistributed: 2.5,
            ethPerEngineWeight: 4.321 / 10000,
            ethUsd: 5800,
            ethPot: 0.004,
            minDropEth: 0.01,
            assets: [
              { symbol: 'GLD', address: '0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e', eth: 1.8, usd: 4321, share: 0.72 },
            ],
            history: [
              {
                round: 88,
                date: new Date().toISOString().slice(0, 10),
                potEth: 0.777,
                recipients: 17,
                unit: 4.321 / 10000,
                top: 'GLD',
                assets: [{ symbol: 'GLD', eth: 0.777, share: 1 }],
              },
              {
                round: 3,
                date: '2020-01-01',
                potEth: 9,
                recipients: 4,
                unit: 1,
                top: 'GONE',
                assets: [],
              },
            ],
            recent: [],
          },
        },
      },
    },
  };
  const html = renderToString(
    <StaticRouter location="/stonkbrokers/pairs">
      <StonkDetailView data={data} activeTab="pairs" />
    </StaticRouter>
  );
  const pairAt = stonkTabs.indexOf('pairs');
  const smartAt = stonkTabs.indexOf('liquidity');
  if (
    pairAt < 0
    || smartAt !== pairAt + 1
    || !html.includes('USONVDA')
    || !html.includes('not the Smart LP skim')
    || !html.includes('$40')
    || !html.includes('$25.0k')
    || !html.includes('Clock In distributions')
    || !html.includes('one seat of that tier')
    || !html.includes('$4,321')
    || !html.includes('Round 88')
    || !html.includes('17 brokers')
    || !html.includes('$777')
    || html.includes('Round 3')
    || html.includes('GONE')
    || html.includes('not the token amount that landed')
  ) {
    failed++;
    console.error('FAIL  pair token revenue section', stonkTabs.join(','));
  } else {
    console.log('ok    pair token revenue is its own section');
  }
}

{
  const project = {
    config: { ticker: 'MANCER' },
    revenue: {
      historyDates: ['2026-10-20', '2026-10-21'],
      historyAmm: [100, 40],
      historyDex: [25, 10],
      historyPaid: [0, 0],
      historyFloat: [0, 0],
      historyHolder: [0, 0],
    },
    tiers: [],
    dailySnapshots: [],
  };
  const holder = holderRevenueOnLabels(project, project.revenue.historyDates);
  const html = renderToString(
    <StaticRouter location="/mancer/revenue">
      <ProtocolFeeVolumePanels
        labels={['Oct 20', 'Oct 21']}
        cols={[
          { key: 'amm', role: 'paid', data: [100, 40], label: 'Paid to holders', color: '#00a804' },
          { key: 'dex', role: 'paid', data: [25, 10], label: 'Paid to holders (DEX)', color: '#f97316' },
        ]}
        kind="protocol"
        holder={{ labels: ['Oct 20', 'Oct 21'], data: holder }}
      />
    </StaticRouter>
  );
  if (holder[0] !== 125 || holder[1] !== 50 || html.includes('No revenue days in this window')) {
    failed++;
    console.error('FAIL  mancer holder revenue', holder);
  } else {
    console.log('ok    mancer payout stays on the holder chart');
  }
}

console.log(failed ? `\n${failed} render(s) failed` : `\nall clean`);
process.exit(failed ? 1 : 0);
