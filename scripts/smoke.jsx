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
  '/portfolio',
  '/tokens',
  '/stocks',
  '/stonkbrokers/roi',
  '/stonkbrokers/yield',
  '/stonkbrokers/revenue',
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
  ['OverviewView', OverviewView, { data: snapshot, pending: false }],
  ['EcosystemView', EcosystemView, { data: snapshot }],
  ['PortfolioView', PortfolioView, { data: snapshot }],
  ['MemesTokensView·memes', MemesTokensView, { data: snapshot, type: 'memes' }],
  ['MemesTokensView·stocks', MemesTokensView, { data: snapshot, type: 'stocks' }],
  ['BonusDetailView', BonusDetailView, { data: snapshot }],
  ['Index·roi', SpecialDetailView, { data: snapshot, projectKey: 'index', activeTab: 'roi' }],
  ['Printer·revenue', SpecialDetailView, { data: snapshot, projectKey: 'printer', activeTab: 'revenue' }],
  ['Oakmont·roi', SpecialDetailView, { data: snapshot, projectKey: 'oakmont', activeTab: 'roi' }],
];

const TABS = ['roi', 'historical', 'revenue', 'burn', 'activation', 'ownership'];
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

console.log(failed ? `\n${failed} render(s) failed` : `\nall clean`);
process.exit(failed ? 1 : 0);
