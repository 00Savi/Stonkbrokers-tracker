import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { Link } from 'react-router-dom';
import { compactUsd, Card, Stat, KpiStrip } from './kit';
import { ChartPanel } from './HistoryCharts';
import { formatLabels } from '../lib/dates';
import { useChartView } from '../lib/chartWindow';
import {
  anvilAskUsd,
  DEPTH_CLEARS,
  entryHistorySeries,
  listingDepthBook,
  tokenTriggerBook,
} from '../lib/entryArb';
import { loadFloorBook } from '../lib/floorCheck';
import { projectPath, PROJECTS } from '../lib/routes';
import {
  baseChartOptions, compactUsdTick, dualAxisOptions, levelAxis, PROJECT_COLORS,
} from '../lib/charts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

function pct1(n) {
  return Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : '—';
}

function edgeTone(pct) {
  if (pct == null || !Number.isFinite(pct)) return 'text-faint';
  if (pct > 0) return 'text-warn';
  if (pct < 0) return 'text-accent';
  return 'text-muted';
}

/**
 * OpenSea ask book vs Anvil token floor — live ladder, depth gap, buying power,
 * and historical OpenSea vs Anvil. Built for the StonkBrokers project page;
 * Ecosystem keeps a short summary that links here.
 */
export function EntryArbBoard({
  data,
  projectKey = 'stonk',
  showHistory = true,
  compact = false,
}) {
  const project = data?.projects?.[projectKey];
  const { range: timeframe, interval } = useChartView();
  const [listings, setListings] = useState(null);
  const [listingsLive, setListingsLive] = useState(false);

  useEffect(() => {
    if (!project) return undefined;
    let live = true;
    loadFloorBook(data, 25)
      .then((book) => {
        if (!live || !book?.listings?.length) return;
        setListings(book.listings);
        setListingsLive(!!book.live);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [data, project]);

  if (!project) return null;

  const anvil = anvilAskUsd(project, projectKey);
  const book = listingDepthBook(
    listings?.length ? listings : (project.market?.floorListings || []),
    anvil,
    {
      ethUsd: Number(project.market?.ethPriceUsd) || 0,
      clears: DEPTH_CLEARS,
    },
  );
  const power = book.buyPower || { count: 0, capitalUsd: 0, arbUsd: 0 };
  const after10 = book.depth.find((d) => d.cleared === 10);
  const liveListings = listings?.length ? listings : (project.market?.floorListings || []);
  const triggers = tokenTriggerBook(liveListings, project, projectKey, {
    ethUsd: Number(project.market?.ethPriceUsd) || 0,
    clears: DEPTH_CLEARS,
  });
  const floorRise = triggers.floorTrigger;
  const name = PROJECTS.find((p) => p.key === projectKey)?.name || projectKey;
  const color = PROJECT_COLORS[projectKey] || '#00a804';
  const unitNote = triggers.unit > 0
    ? `${Number(triggers.unit).toLocaleString('en-US')} tokens × spot × buy fee`
    : 'unit × token × buy fee';

  return (
    <div className="space-y-4">
      <Card
        eyebrow="OpenSea vs Anvil"
        sub={`Anvil floor is unit × spot × buy fee. OpenSea is the live ask book. Gap is OpenSea − Anvil. ${listingsLive ? 'Asks are live from OpenSea.' : 'Asks are from the last snapshot until a live OpenSea read lands.'}`}
      >
        <KpiStrip>
          <Stat
            label="OpenSea floor"
            value={book.openSeaFloorUsd != null ? compactUsd(book.openSeaFloorUsd) : '—'}
            note={book.ladder[0] ? `#${book.ladder[0].id}` : undefined}
          />
          <Stat
            label="Anvil floor"
            value={book.anvilUsd != null ? compactUsd(book.anvilUsd) : '—'}
            note={unitNote}
          />
          <Stat
            label="Gap now"
            value={book.depth[0]?.gapUsd != null ? compactUsd(book.depth[0].gapUsd) : '—'}
            tone={book.depth[0]?.gapUsd > 0 ? 'danger' : book.depth[0]?.gapUsd < 0 ? 'accent' : 'ink'}
            note={book.depth[0]?.gapPct != null ? pct1(book.depth[0].gapPct) : undefined}
          />
          <Stat
            label="After 10 sell"
            value={after10?.gapUsd != null ? compactUsd(after10.gapUsd) : '—'}
            note={after10?.gapPct != null ? pct1(after10.gapPct) : `${book.count} asks`}
          />
        </KpiStrip>
      </Card>

      {triggers.openSeaFloorUsd != null && triggers.spot != null ? (
        <Card
          eyebrow="Token rise → OpenSea"
          sub="Anvil is convertible at a fixed token count, so a higher spot lifts the vault floor. When Anvil clears an OpenSea ask, that seat becomes cheaper on the marketplace — the move that pulls buying onto OpenSea."
        >
          <KpiStrip>
            <Stat
              label="Token spot"
              value={compactUsd(triggers.spot)}
              note={triggers.unit > 0 ? `${Number(triggers.unit).toLocaleString('en-US')} / NFT` : undefined}
            />
            <Stat
              label="Token to match OS floor"
              value={floorRise?.trigger != null ? compactUsd(floorRise.trigger) : '—'}
              note="Anvil = OpenSea floor"
            />
            <Stat
              label="Rise to trigger OS floor"
              value={floorRise?.risePct != null
                ? (floorRise.risePct <= 0 ? 'Already below' : pct1(floorRise.risePct))
                : '—'}
              tone={floorRise?.risePct != null && floorRise.risePct <= 0 ? 'accent' : floorRise?.risePct > 0 ? 'warn' : 'ink'}
              note={floorRise?.riseUsd != null && floorRise.riseUsd > 0
                ? `+${compactUsd(floorRise.riseUsd)} / token`
                : floorRise?.risePct <= 0
                  ? 'Floor ask already under Anvil'
                  : undefined}
            />
            <Stat
              label="Rise to after-10 floor"
              value={(() => {
                const row = triggers.depth.find((d) => d.cleared === 10);
                if (row?.risePct == null) return '—';
                return row.risePct <= 0 ? 'Already below' : pct1(row.risePct);
              })()}
              note="Token climb for Anvil to meet that ask"
            />
          </KpiStrip>
        </Card>
      ) : null}

      <Card
        eyebrow="Buying power"
        sub="Asks below Anvil are cheaper than minting from the vault. Buying power is the USD to clear that discount book; arb room is Σ(Anvil − ask) saved versus Anvil."
      >
        <KpiStrip>
          <Stat
            label="Seats below Anvil"
            value={power.count > 0 ? String(power.count) : '—'}
            note={book.count ? `of ${book.count} asks` : undefined}
          />
          <Stat
            label="Buying power"
            value={power.capitalUsd > 0 ? compactUsd(power.capitalUsd) : '—'}
            tone={power.capitalUsd > 0 ? 'accent' : 'ink'}
            note="Capital to clear discount"
          />
          <Stat
            label="Arb room"
            value={power.arbUsd > 0 ? compactUsd(power.arbUsd) : '—'}
            tone={power.arbUsd > 0 ? 'accent' : 'ink'}
            note="Σ Anvil − ask"
          />
          <Stat
            label="Clear 10 cost"
            value={after10?.clearCostUsd != null ? compactUsd(after10.clearCostUsd) : '—'}
            note={after10?.capturedArbUsd > 0 ? `${compactUsd(after10.capturedArbUsd)} arb in those 10` : 'Cheapest 10 asks'}
          />
        </KpiStrip>
      </Card>

      {book.ladder.length ? (
        <>
          {!compact ? (
            <ChartPanel
              tall
              title="Ask ladder"
              note="Cheapest OpenSea listings ascending. The amber line is the Anvil token floor — same for every seat. Green bars sit below Anvil."
              footer={(
                <p className="text-[12px] leading-relaxed text-muted">
                  Bars above the line are OpenSea premiums. Bars below are the discount book that pulls buying power onto OpenSea.
                </p>
              )}
            >
              <AskLadderChart book={book} />
            </ChartPanel>
          ) : null}

          <ChartPanel
            title="Gap after the cheapest sell"
            note="If the lowest asks clear, the next listing becomes the OpenSea floor. Gap = that new floor − Anvil token cost."
          >
            <DepthGapChart book={book} />
          </ChartPanel>

          <ChartPanel
            title="Buying power as the discount clears"
            note="At each depth: capital still needed to clear remaining asks below Anvil, and the arb room left on that remainder. Clear cost is what buying the cheapest N spends."
          >
            <BuyPowerChart book={book} />
          </ChartPanel>

          <Card flush eyebrow="Depth book" sub="New OpenSea floor after N cheapest listings sell, versus Anvil — plus buying power left on the discount side.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Clears</th>
                    <th className="px-3 py-3 font-normal">New OS floor</th>
                    <th className="px-3 py-3 font-normal">Gap $</th>
                    <th className="px-3 py-3 font-normal">Clear cost</th>
                    <th className="px-3 py-3 font-normal">Buy power left</th>
                    <th className="px-5 py-3 text-right font-normal">Arb left</th>
                  </tr>
                </thead>
                <tbody>
                  {book.depth.map((row) => (
                    <tr key={row.cleared} className="border-b border-line-soft">
                      <td className="px-5 py-3 text-[13px] text-ink">{row.label}</td>
                      <td className="num px-3 py-3 text-[13px] text-ink">
                        {row.floorUsd != null ? compactUsd(row.floorUsd) : '—'}
                        {row.floor ? <span className="ml-2 font-mono text-[10px] text-faint">#{row.floor.id}</span> : null}
                      </td>
                      <td className={`num px-3 py-3 text-[13px] ${edgeTone(row.gapPct)}`}>
                        {row.gapUsd == null ? '—' : compactUsd(row.gapUsd)}
                      </td>
                      <td className="num px-3 py-3 text-[13px] text-ink">
                        {row.clearCostUsd != null ? compactUsd(row.clearCostUsd) : '—'}
                      </td>
                      <td className="num px-3 py-3 text-[13px] text-ink">
                        {row.buyPowerUsd > 0 ? compactUsd(row.buyPowerUsd) : '—'}
                        {row.discountCount > 0 ? (
                          <span className="ml-2 font-mono text-[10px] text-faint">{row.discountCount}</span>
                        ) : null}
                      </td>
                      <td className={`num px-5 py-3 text-right text-[13px] ${row.arbUsd > 0 ? 'text-accent' : 'text-faint'}`}>
                        {row.arbUsd > 0 ? compactUsd(row.arbUsd) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <ChartPanel
            title="Token climb to meet each OpenSea floor"
            note="Anvil = unit × token × buy fee. For each depth, how much the token must rise so Anvil equals that new OpenSea floor — the level where that ask flips into the discount book."
          >
            <TokenRiseChart triggers={triggers} />
          </ChartPanel>

          <ChartPanel
            title="If the token runs"
            note="Anvil floor and OpenSea buying power as spot climbs. Horizontal guide is today’s OpenSea floor — once Anvil crosses it, the marketplace is the cheaper entry."
          >
            <TokenRunChart triggers={triggers} />
          </ChartPanel>

          <Card
            flush
            eyebrow="Token vs depth"
            sub="Token spot that lifts Anvil to each cleared OpenSea floor. Positive rise = climb still needed; already below means that ask is already cheaper than the vault."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="eyebrow border-b border-line text-faint">
                    <th className="px-5 py-3 font-normal">Clears</th>
                    <th className="px-3 py-3 font-normal">OS floor</th>
                    <th className="px-3 py-3 font-normal">Token to match</th>
                    <th className="px-3 py-3 font-normal">Rise %</th>
                    <th className="px-5 py-3 text-right font-normal">Rise $</th>
                  </tr>
                </thead>
                <tbody>
                  {triggers.depth.filter((row) => row.floorUsd != null).map((row) => (
                    <tr key={`tok-${row.cleared}`} className="border-b border-line-soft">
                      <td className="px-5 py-3 text-[13px] text-ink">{row.label}</td>
                      <td className="num px-3 py-3 text-[13px] text-ink">
                        {compactUsd(row.floorUsd)}
                        {row.floor ? <span className="ml-2 font-mono text-[10px] text-faint">#{row.floor.id}</span> : null}
                      </td>
                      <td className="num px-3 py-3 text-[13px] text-ink">
                        {row.tokenTrigger != null ? compactUsd(row.tokenTrigger) : '—'}
                      </td>
                      <td className={`num px-3 py-3 text-[13px] ${row.risePct != null && row.risePct <= 0 ? 'text-accent' : edgeTone(row.risePct)}`}>
                        {row.risePct == null ? '—' : row.risePct <= 0 ? 'Already below' : pct1(row.risePct)}
                      </td>
                      <td className={`num px-5 py-3 text-right text-[13px] ${row.riseUsd > 0 ? 'text-ink' : 'text-faint'}`}>
                        {row.riseUsd != null && row.riseUsd > 0 ? `+${compactUsd(row.riseUsd)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <Card eyebrow="Ask ladder">
          <p className="text-[13px] text-muted">No OpenSea listings loaded yet for {name}.</p>
        </Card>
      )}

      {showHistory ? (
        <OsVsAnvilHistory
          project={project}
          projectKey={projectKey}
          timeframe={timeframe}
          interval={interval}
          color={color}
        />
      ) : null}
    </div>
  );
}

/** Ecosystem teaser — KPIs + link into the project Entry tab. */
export function EntryArbSummary({ data, projectKey = 'stonk' }) {
  const project = data?.projects?.[projectKey];
  const [listings, setListings] = useState(null);

  useEffect(() => {
    if (!project) return undefined;
    let live = true;
    loadFloorBook(data, 25)
      .then((book) => {
        if (!live || !book?.listings?.length) return;
        setListings(book.listings);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [data, project]);

  if (!project) return null;

  const anvil = anvilAskUsd(project, projectKey);
  const book = listingDepthBook(
    listings?.length ? listings : (project.market?.floorListings || []),
    anvil,
    { ethUsd: Number(project.market?.ethPriceUsd) || 0, clears: DEPTH_CLEARS },
  );
  const power = book.buyPower || { count: 0, capitalUsd: 0, arbUsd: 0 };
  const href = projectPath(projectKey, 'entry');

  return (
    <Card
      eyebrow="OpenSea vs Anvil"
      sub="Live StonkBrokers ask book against the Anvil token floor. Full ladder, depth, and buying power live on the project page."
      corner={(
        <Link to={href} className="font-mono text-[11px] text-accent hover:underline">
          Open Entry →
        </Link>
      )}
    >
      <KpiStrip>
        <Stat
          label="OpenSea floor"
          value={book.openSeaFloorUsd != null ? compactUsd(book.openSeaFloorUsd) : '—'}
        />
        <Stat
          label="Anvil floor"
          value={book.anvilUsd != null ? compactUsd(book.anvilUsd) : '—'}
        />
        <Stat
          label="Buying power"
          value={power.capitalUsd > 0 ? compactUsd(power.capitalUsd) : '—'}
          tone={power.capitalUsd > 0 ? 'accent' : 'ink'}
          note={power.count > 0 ? `${power.count} seats below` : undefined}
        />
        <Stat
          label="Arb room"
          value={power.arbUsd > 0 ? compactUsd(power.arbUsd) : '—'}
          tone={power.arbUsd > 0 ? 'accent' : 'ink'}
        />
      </KpiStrip>
    </Card>
  );
}

function OsVsAnvilHistory({ project, projectKey, timeframe, interval, color }) {
  const hist = entryHistorySeries(project, { key: projectKey, timeframe, interval });
  const labels = formatLabels(hist.dates);
  const hasAnvil = (hist.implied || []).some((v) => v != null);
  const osCount = (hist.floor || []).filter((v) => v != null).length;
  const hasOs = osCount > 0;
  if (!hasAnvil) return null;
  const tokenColor = '#8b929b';
  const osPoint = osCount < 8 ? 3 : 0;
  const name = PROJECTS.find((p) => p.key === projectKey)?.name || projectKey;
  return (
    <ChartPanel
      title={`${name} · OpenSea vs Anvil`}
      note={hasOs
        ? 'OpenSea floor USD against the Anvil token floor (unit × spot × buy fee). Token price on the right axis. Days with only a derived floor omit the OpenSea line.'
        : 'Anvil token floor (unit × spot × buy fee) and token spot. OpenSea history starts once marketplace asks are snapshotted.'}
      footer={(
        <p className="text-[12px] leading-relaxed text-muted">
          {hasOs
            ? 'When OpenSea sits below Anvil, the marketplace is cheaper than buying from the vault.'
            : 'Live OpenSea asks are on the ladder above. This chart fills in OpenSea as daily snaps record real listings.'}
        </p>
      )}
    >
      <Line
        data={{
          labels,
          datasets: [
            {
              label: 'OpenSea floor',
              data: hist.floor,
              borderColor: color || '#00a804',
              backgroundColor: `${color || '#00a804'}18`,
              borderWidth: 2,
              tension: 0.3,
              pointRadius: osPoint,
              spanGaps: true,
              yAxisID: 'y',
            },
            {
              label: 'Anvil floor',
              data: hist.implied,
              borderColor: '#e8eaed',
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderDash: [4, 3],
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
              yAxisID: 'y',
            },
            {
              label: 'Token',
              data: hist.token,
              borderColor: tokenColor,
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0,
              spanGaps: true,
              yAxisID: 'y1',
            },
          ],
        }}
        options={dualAxisOptions({
          labels,
          interval,
          leftTick: compactUsdTick,
          rightTick: compactUsdTick,
          rightColor: tokenColor,
          leftKind: 'level',
          rightKind: 'level',
          leftValues: [...(hist.floor || []), ...(hist.implied || [])],
          rightValues: hist.token,
          leftUnit: 'USD',
          rightUnit: 'token',
        })}
      />
    </ChartPanel>
  );
}

function AskLadderChart({ book }) {
  const ladder = (book?.ladder || []).slice(0, 20);
  if (!ladder.length) return null;
  const anvil = Number(book.anvilUsd) || 0;
  const labels = ladder.map((row) => `#${row.id}`);
  const asks = ladder.map((row) => row.usd);
  const anvilLine = ladder.map(() => anvil);
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Anvil floor',
            data: anvilLine,
            borderColor: '#f5b700',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            order: 0,
          },
          {
            type: 'bar',
            label: 'OpenSea ask',
            data: asks,
            backgroundColor: ladder.map((row) => (
              anvil > 0 && row.usd < anvil ? 'rgba(0,168,4,0.55)' : 'rgba(231,233,236,0.35)'
            )),
            borderRadius: 2,
            maxBarThickness: 28,
            order: 1,
          },
        ],
      }}
      options={{
        ...baseChartOptions(labels, 'daily', { yUnit: 'USD', yTick: compactUsdTick }),
        plugins: {
          ...baseChartOptions(labels, 'daily').plugins,
          legend: { display: true, labels: { color: '#8b929b', boxWidth: 10 } },
        },
        scales: {
          ...baseChartOptions(labels, 'daily', { yUnit: 'USD', yTick: compactUsdTick }).scales,
          x: {
            ...baseChartOptions(labels, 'daily').scales.x,
            ticks: {
              ...baseChartOptions(labels, 'daily').scales.x.ticks,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10,
            },
          },
          y: {
            ...baseChartOptions(labels, 'daily', { yUnit: 'USD', yTick: compactUsdTick }).scales.y,
            ...levelAxis(
              { ...baseChartOptions(labels, 'daily', { yUnit: 'USD', yTick: compactUsdTick }).scales.y.ticks },
              [...asks, anvil],
            ),
          },
        },
      }}
    />
  );
}

function DepthGapChart({ book }) {
  const rows = (book?.depth || []).filter((row) => row.floorUsd != null);
  if (!rows.length) return null;
  const labels = rows.map((row) => row.label);
  const gaps = rows.map((row) => row.gapUsd);
  const floors = rows.map((row) => row.floorUsd);
  const anvil = rows.map((row) => row.anvilUsd);
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: 'OpenSea floor',
            data: floors,
            backgroundColor: 'rgba(231,233,236,0.35)',
            borderRadius: 2,
            maxBarThickness: 36,
          },
          {
            label: 'Anvil floor',
            data: anvil,
            backgroundColor: 'rgba(245,183,0,0.45)',
            borderRadius: 2,
            maxBarThickness: 36,
          },
          {
            type: 'line',
            label: 'Gap $',
            data: gaps,
            borderColor: '#00a804',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            yAxisID: 'y1',
          },
        ],
      }}
      options={dualAxisOptions({
        labels,
        interval: 'daily',
        leftTick: compactUsdTick,
        rightTick: compactUsdTick,
        rightColor: '#00a804',
        leftKind: 'level',
        rightKind: 'level',
        leftValues: [...floors, ...anvil],
        rightValues: gaps,
        leftUnit: 'USD',
        rightUnit: 'gap',
      })}
    />
  );
}

function BuyPowerChart({ book }) {
  const rows = (book?.depth || []).filter((row) => row.floorUsd != null || row.cleared === 0);
  if (!rows.length) return null;
  const labels = rows.map((row) => row.label);
  const buyPower = rows.map((row) => row.buyPowerUsd || 0);
  const arb = rows.map((row) => row.arbUsd || 0);
  const clearCost = rows.map((row) => (row.clearCostUsd != null ? row.clearCostUsd : null));
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: 'Buying power left',
            data: buyPower,
            backgroundColor: 'rgba(0,168,4,0.45)',
            borderRadius: 2,
            maxBarThickness: 36,
          },
          {
            label: 'Arb room left',
            data: arb,
            backgroundColor: 'rgba(245,183,0,0.4)',
            borderRadius: 2,
            maxBarThickness: 36,
          },
          {
            type: 'line',
            label: 'Clear cost',
            data: clearCost,
            borderColor: '#e8eaed',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [4, 3],
            pointRadius: 3,
            spanGaps: true,
            yAxisID: 'y1',
          },
        ],
      }}
      options={dualAxisOptions({
        labels,
        interval: 'daily',
        leftTick: compactUsdTick,
        rightTick: compactUsdTick,
        rightColor: '#e8eaed',
        leftKind: 'level',
        rightKind: 'level',
        leftValues: [...buyPower, ...arb],
        rightValues: clearCost.filter((v) => v != null),
        leftUnit: 'USD',
        rightUnit: 'clear',
      })}
    />
  );
}

function TokenRiseChart({ triggers }) {
  const rows = (triggers?.depth || []).filter((row) => row.floorUsd != null && row.risePct != null);
  if (!rows.length) return null;
  const labels = rows.map((row) => row.label);
  const rise = rows.map((row) => (row.risePct > 0 ? row.risePct : 0));
  const floors = rows.map((row) => row.floorUsd);
  const anvil = rows.map((row) => row.anvilUsd);
  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: 'OpenSea floor',
            data: floors,
            backgroundColor: 'rgba(231,233,236,0.35)',
            borderRadius: 2,
            maxBarThickness: 36,
          },
          {
            label: 'Anvil now',
            data: anvil,
            backgroundColor: 'rgba(245,183,0,0.45)',
            borderRadius: 2,
            maxBarThickness: 36,
          },
          {
            type: 'line',
            label: 'Token rise %',
            data: rise,
            borderColor: '#38bdf8',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            yAxisID: 'y1',
          },
        ],
      }}
      options={dualAxisOptions({
        labels,
        interval: 'daily',
        leftTick: compactUsdTick,
        rightTick: (v) => `${Number(v).toFixed(0)}%`,
        rightColor: '#38bdf8',
        leftKind: 'level',
        rightKind: 'level',
        leftValues: [...floors, ...anvil],
        rightValues: rise,
        leftUnit: 'USD',
        rightUnit: 'rise',
      })}
    />
  );
}

function TokenRunChart({ triggers }) {
  const rows = triggers?.ladder || [];
  if (!rows.length || !(triggers?.spot > 0)) return null;
  const labels = rows.map((row) => (row.risePct === 0 ? 'Now' : `+${row.risePct}%`));
  const anvil = rows.map((row) => row.anvilUsd);
  const buyPower = rows.map((row) => row.buyPowerUsd || 0);
  const osFloor = triggers.openSeaFloorUsd;
  const osLine = osFloor != null ? rows.map(() => osFloor) : null;
  return (
    <Bar
      data={{
        labels,
        datasets: [
          ...(osLine ? [{
            type: 'line',
            label: 'OpenSea floor',
            data: osLine,
            borderColor: '#8b929b',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            order: 0,
          }] : []),
          {
            type: 'line',
            label: 'Anvil floor',
            data: anvil,
            borderColor: '#f5b700',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            order: 1,
          },
          {
            type: 'bar',
            label: 'Buying power',
            data: buyPower,
            backgroundColor: 'rgba(0,168,4,0.4)',
            borderRadius: 2,
            maxBarThickness: 36,
            yAxisID: 'y1',
            order: 2,
          },
        ],
      }}
      options={dualAxisOptions({
        labels,
        interval: 'daily',
        leftTick: compactUsdTick,
        rightTick: compactUsdTick,
        rightColor: '#00a804',
        leftKind: 'level',
        rightKind: 'level',
        leftValues: [...anvil, ...(osLine || [])],
        rightValues: buyPower,
        leftUnit: 'USD',
        rightUnit: 'power',
      })}
    />
  );
}
