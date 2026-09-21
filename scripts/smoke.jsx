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
import InternDetailView from '../src/components/views/InternDetailView';
import MancerDetailView from '../src/components/views/MancerDetailView';
import YardDetailView from '../src/components/views/YardDetailView';
import CardWallDetailView from '../src/components/views/CardWallDetailView';
import BonusDetailView from '../src/components/views/BonusDetailView';
import SpecialDetailView from '../src/components/views/SpecialDetailView';
import NightshadesDetailView from '../src/components/views/NightshadesDetailView';
import { protocolRevenueChart } from '../src/lib/yieldHistory';
import { dateKey } from '../src/lib/dates';
import { PROJECTS, tabsForProject } from '../src/lib/routes';
import { activationTokenCostUsd, tokenPriceAtTs } from '../src/lib/portfolioHistory';
import { attributedStonkBurn, dailyAttributedBurnSeries, firstInternActivationDay } from '../src/lib/burn';
import { navNftScanTargets } from '../src/lib/portfolioScan';
import { windowLen } from '../src/lib/yieldHistory';
import { CHART_WINDOWS, CHART_INTERVALS } from '../src/lib/chartWindow';
import { buildTopicShareCard } from '../src/lib/projectShare';
import { copySectionEl } from '../src/components/CopyControl';
import { isProjectLive } from '../src/lib/routes';

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
]) {
  for (const tab of TABS) {
    VIEWS.push([`${label}·${tab}`, View, { data: snapshot, activeTab: tab }]);
  }
}
VIEWS.push(['Nightshades·all', NightshadesDetailView, { data: snapshot, activeTab: 'roi' }]);

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
  } else if (!html.includes('Daily intern vs StonkBrokers burn') || !html.includes('The Deflationary Flywheel')) {
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
    console.log(`ok    burn split intern=${split.intern} brokers=${split.brokers} total=${split.total}`);
    console.log(`ok    daily split from ${daily.startDay} intern=${daily.intern.map((n) => Math.round(n)).join('/')} brokers=${daily.brokers.map((n) => Math.round(n)).join('/')}`);
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
  } else if (!tabHtml.includes('Copy')) {
    failed++;
    console.error('FAIL  tab Copy button missing');
  } else {
    console.log('ok    tab Copy label is Copy, not Copy for X');
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
  const ecoHtml = renderToString(
    <StaticRouter location="/ecosystem">
      <EcosystemView data={snapshot} />
    </StaticRouter>
  );
  if (ecoHtml.includes('Copy for X')) {
    failed++;
    console.error('FAIL  ecosystem still says Copy for X');
  } else if (!ecoHtml.includes('Copy')) {
    failed++;
    console.error('FAIL  ecosystem Copy missing');
  } else {
    console.log('ok    ecosystem heading Copy is Copy');
  }
}

console.log(failed ? `\n${failed} render(s) failed` : `\nall clean`);
process.exit(failed ? 1 : 0);
