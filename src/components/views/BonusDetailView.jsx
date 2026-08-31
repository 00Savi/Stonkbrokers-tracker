import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Card, Figure, Stat, SplitBar, Tag, num } from '../kit';
import { AIRDROP_COMMUNITIES, communityNftCount } from '../../lib/airdropCommunities';
import {
  AIRDROP_PHASE,
  BONUS_AIRDROP_SUPPLY,
  BONUS_GENESIS_BROKERS,
  BONUS_LP_SEED,
  BONUS_MAX_SUPPLY,
  BONUS_PER_TBA,
  TBA_BATCH_SIZE,
  bonusBurnForCollections,
  ethFeeForCollections,
  tbaBatchCount,
} from '../../lib/bonusTokenomics';
import { bonusTokenAddress, fetchBonusBurned } from '../../lib/bonusBurn';
import {
  handleApproveBonus,
  handleApproveDropToken,
  handleCreateCampaign,
  handleExecuteBatch,
  loadTbaTargets,
  readStoredCampaign,
  writeStoredCampaign,
  clearStoredCampaign,
  sliceTbaBatches,
} from '../../lib/bonusEngine';

const LAUNCHER_REF = 'https://stonkbrokers.wtf/?ref=savi';

const ROADMAP = [
  {
    id: 'launch',
    title: 'Token Launch',
    status: 'progress',
    body: `Launched on Stonklauncher with antisnipe protection. Max supply is ${num(BONUS_MAX_SUPPLY)} $BONUS paired with $STONK and locked.`,
  },
  {
    id: 'airdrop',
    title: 'Airdrop',
    status: 'progress',
    body: `${num(BONUS_AIRDROP_SUPPLY)} $BONUS (50%) to ${num(BONUS_GENESIS_BROKERS)} StonkBrokers tokenbound accounts. Divided equally amongst all brokers both in the AMM and outside it.`,
  },
  {
    id: 'tool',
    title: 'Airdrop Tool',
    status: 'progress',
    body: 'Pay 0.01 ETH per project and burn 10,000 $BONUS per project to airdrop your own token to supported tokenbound accounts. Launching with support for $STONK, $MANCER, $YARD, and $WALL.',
  },
  {
    id: 'lp-fees',
    title: 'LP · Fees',
    status: 'planned',
    body: 'Will utilize for treasury, LP thickening, burn, and possibly airdrops to new communities.',
  },
  {
    id: 'brokerbox',
    title: 'Brokerbox',
    status: 'planned',
    body: 'TBD. Once launch is live, investigate utilizing a custom broker box to drive the $BONUS token further.',
  },
];

function StatusTag({ status }) {
  if (status === 'done') return <Tag tone="good">Done</Tag>;
  if (status === 'progress') return <Tag tone="warn">In progress</Tag>;
  return <Tag tone="plain">Planned</Tag>;
}

function PhaseTag({ phase }) {
  if (phase === AIRDROP_PHASE.COMPLETE) return <Tag tone="good">Complete</Tag>;
  if (phase === AIRDROP_PHASE.IDLE) return <Tag tone="plain">Ready</Tag>;
  return <Tag tone="warn">{phase.replaceAll('_', ' ')}</Tag>;
}

function actionLabel(phase, selectedCount, resumable, tbaKnown) {
  if (selectedCount === 0 && !resumable) return 'Select at least one community';
  if (selectedCount > 0 && !tbaKnown && !resumable) return 'TBA count pending';
  switch (phase) {
    case AIRDROP_PHASE.APPROVING_BONUS:
      return 'Approving $BONUS…';
    case AIRDROP_PHASE.CREATING_CAMPAIGN:
      return 'Creating campaign…';
    case AIRDROP_PHASE.APPROVING_TOKEN:
      return 'Approving drop token…';
    case AIRDROP_PHASE.EXECUTING_BATCHES:
      return 'Executing batches…';
    case AIRDROP_PHASE.COMPLETE:
      return 'Airdrop complete — run another';
    default:
      return resumable
        ? 'Resume campaign batches'
        : 'Approve $BONUS and create campaign';
  }
}

export default function BonusDetailView({ data }) {
  const [selected, setSelected] = useState(() => new Set(['stonkbrokers']));
  const [burned, setBurned] = useState(null);
  const [burnPending, setBurnPending] = useState(true);
  const [tokenAddress, setTokenAddress] = useState('');
  const [amountPerNft, setAmountPerNft] = useState('');
  const [phase, setPhase] = useState(AIRDROP_PHASE.IDLE);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [error, setError] = useState(null);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [nextBatchIndex, setNextBatchIndex] = useState(0);

  const bonus = data?.projects?.bonus;
  const priceUsd = bonus?.market?.tokenPriceUsd;
  const bonusCa = bonusTokenAddress(data);
  const locked = phase !== AIRDROP_PHASE.IDLE && phase !== AIRDROP_PHASE.COMPLETE;

  useEffect(() => {
    if (!bonusCa) {
      setBurned(null);
      setBurnPending(false);
      return;
    }
    const ac = new AbortController();
    setBurnPending(true);
    fetchBonusBurned(bonusCa, ac.signal)
      .then((value) => {
        if (ac.signal.aborted) return;
        setBurned(value);
        setBurnPending(false);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setBurned(null);
        setBurnPending(false);
      });
    return () => ac.abort();
  }, [bonusCa]);

  useEffect(() => {
    const stored = readStoredCampaign();
    if (!stored) return;
    setActiveCampaignId(stored.campaignId);
    if (stored.tokenAddress) setTokenAddress(stored.tokenAddress);
    if (stored.amountPerNft != null && stored.amountPerNft !== '') {
      setAmountPerNft(String(stored.amountPerNft));
    }
    if (Array.isArray(stored.selected) && stored.selected.length) {
      setSelected(new Set(stored.selected));
    }
    const resumeAt = Number(stored.nextBatchIndex) || 0;
    setNextBatchIndex(resumeAt);
    setCurrentBatch(resumeAt);
  }, []);

  const communities = useMemo(
    () =>
      AIRDROP_COMMUNITIES.map((c) => ({
        ...c,
        nfts: communityNftCount(data, c.key),
        logo: data?.projects?.[c.key]?.config?.logo,
      })),
    [data]
  );

  const selectedRows = communities.filter((c) => selected.has(c.id));
  const collectionCount = selected.size;
  const tbaTotal = selectedRows.reduce((s, c) => s + (c.nfts || 0), 0);
  const tbaKnown = selectedRows.length > 0 && selectedRows.every((c) => c.nfts != null);
  const ethFee = ethFeeForCollections(collectionCount);
  const bonusBurn = bonusBurnForCollections(collectionCount);
  const plannedBatches = tbaBatchCount(tbaKnown ? tbaTotal : 0);

  const amountNum = Number(amountPerNft);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;
  const totalTokensNeeded = tbaKnown && amountOk ? tbaTotal * amountNum : null;
  const tokenOk = ethers.isAddress(tokenAddress.trim());
  const resumable = activeCampaignId != null && phase === AIRDROP_PHASE.IDLE;
  const formLocked = locked || resumable;
  const canStart =
    collectionCount > 0 &&
    tbaKnown &&
    tokenOk &&
    amountOk &&
    phase === AIRDROP_PHASE.IDLE &&
    !resumable;
  const canClick =
    phase === AIRDROP_PHASE.COMPLETE || resumable || canStart;

  function persistCampaign(partial) {
    const payload = {
      campaignId: partial.campaignId ?? activeCampaignId,
      tokenAddress: tokenAddress.trim(),
      amountPerNft: amountPerNft,
      selected: [...selected],
      nextBatchIndex: partial.nextBatchIndex ?? nextBatchIndex,
    };
    writeStoredCampaign(payload);
  }

  function toggle(id) {
    if (formLocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(on) {
    if (formLocked) return;
    setSelected(on ? new Set(AIRDROP_COMMUNITIES.map((c) => c.id)) : new Set());
  }

  async function runAirdrop() {
    if (phase === AIRDROP_PHASE.COMPLETE) {
      clearStoredCampaign();
      setActiveCampaignId(null);
      setPhase(AIRDROP_PHASE.IDLE);
      setCurrentBatch(0);
      setTotalBatches(0);
      setNextBatchIndex(0);
      setError(null);
      return;
    }
    if (!canStart && !resumable) return;

    setError(null);
    const projectCount = collectionCount;
    const dropToken = tokenAddress.trim();
    const resume = resumable;

    try {
      const tbas = await loadTbaTargets([...selected], data);
      const batches = sliceTbaBatches(tbas);
      if (batches.length === 0) {
        throw new Error(
          'No ERC-6551 TBAs resolved. Check nftCa for each selected collection and the 6551 registry config.'
        );
      }
      setTotalBatches(batches.length);

      let campaignId = activeCampaignId;
      let startAt = resume ? nextBatchIndex : 0;

      if (!resume) {
        setPhase(AIRDROP_PHASE.APPROVING_BONUS);
        await handleApproveBonus(bonusBurn, data);

        setPhase(AIRDROP_PHASE.CREATING_CAMPAIGN);
        campaignId = await handleCreateCampaign(
          dropToken,
          tbas.length,
          amountNum,
          projectCount
        );
        setActiveCampaignId(campaignId);
        setNextBatchIndex(0);
        persistCampaign({ campaignId, nextBatchIndex: 0 });

        setPhase(AIRDROP_PHASE.APPROVING_TOKEN);
        const needed = tbas.length * amountNum;
        await handleApproveDropToken(dropToken, needed);
      } else {
        setPhase(AIRDROP_PHASE.APPROVING_TOKEN);
        const remaining = batches.slice(startAt).reduce((n, b) => n + b.length, 0);
        await handleApproveDropToken(dropToken, remaining * amountNum);
      }

      setPhase(AIRDROP_PHASE.EXECUTING_BATCHES);
      for (let i = startAt; i < batches.length; i += 1) {
        setCurrentBatch(i + 1);
        persistCampaign({ campaignId, nextBatchIndex: i });
        await handleExecuteBatch(campaignId, batches[i]);
        persistCampaign({ campaignId, nextBatchIndex: i + 1 });
        setNextBatchIndex(i + 1);
      }

      clearStoredCampaign();
      setActiveCampaignId(null);
      setNextBatchIndex(0);
      setPhase(AIRDROP_PHASE.COMPLETE);
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Transaction failed');
      setPhase(AIRDROP_PHASE.IDLE);
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-line bg-panel-2 px-3 py-2 font-mono text-[12px] text-ink outline-none placeholder:text-faint focus:border-accent/40';

  return (
    <div className="space-y-4 pb-16">
      <Card
        eyebrow="$Bonus"
        sub="Token information and airdrop tracking"
        corner={
          <a
            href={LAUNCHER_REF}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap rounded-full bg-brand px-3 py-1.5 text-[12px] font-medium text-black hover:opacity-90"
          >
            Trade on Stonklauncher ↗
          </a>
        }
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <img
            src="/Bonus.png"
            alt="$BONUS"
            className="h-28 w-28 shrink-0 rounded-2xl border border-line object-cover sm:h-32 sm:w-32"
          />
          <div className="min-w-0 flex-1">
            <Figure value="$BONUS" size="text-[36px]" after="Robinhood Chain" />
            <p className="mt-4 max-w-2xl font-mono text-[12px] leading-relaxed text-muted">
              $BONUS is dropping via Stonklauncher. Half of supply is airdropped to StonkBrokers
              tokenbound wallets — whether the NFT is in the AMM or sitting in a wallet — and the
              other half goes to the LP. After that drop, this page becomes a tool anyone can use
              to airdrop into NFT tokenbound accounts across the board, starting with the four
              collections below and adding more over time.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Stat
                label="Price"
                value={priceUsd ? `$${Number(priceUsd).toFixed(6)}` : '—'}
                ch={8}
              />
              <Stat label="Max supply" value={num(BONUS_MAX_SUPPLY)} ch={10} />
              <Stat
                label="Total burned"
                value={burned == null ? '—' : num(Math.floor(burned))}
                pending={burnPending}
                ch={8}
                note="dead address"
              />
              <Stat label="Broker drop" value="50%" tone="accent" />
              <Stat label="LP" value="50%" />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card eyebrow="Supply split" sub={`${num(BONUS_MAX_SUPPLY)} $BONUS · 50 / 50`}>
          <SplitBar
            a={BONUS_AIRDROP_SUPPLY}
            b={BONUS_LP_SEED}
            labelA="TBA airdrop"
            labelB="LP seed"
            valueA={num(BONUS_AIRDROP_SUPPLY)}
            valueB={num(BONUS_LP_SEED)}
          />
          <ul className="mt-5 space-y-3 font-mono text-[12px] leading-relaxed text-muted">
            <li>
              <span className="text-ink">Max supply {num(BONUS_MAX_SUPPLY)}.</span> Fixed at
              launch. Nothing above this mints.
            </li>
            <li>
              <span className="text-ink">
                LP seed {num(BONUS_LP_SEED)} (50%).
              </span>{' '}
              Seeds the $BONUS liquidity pool.
            </li>
            <li>
              <span className="text-ink">
                StonkBrokers airdrop {num(BONUS_AIRDROP_SUPPLY)} (50%).
              </span>{' '}
              Exactly {num(BONUS_PER_TBA)} $BONUS per TBA across {num(BONUS_GENESIS_BROKERS)}{' '}
              brokers — in the AMM and held outside it. One TBA per NFT.
            </li>
          </ul>
        </Card>

        <Card eyebrow="Airdrop tracker" sub="Genesis drop to StonkBrokers TBAs">
          <div className="space-y-3">
            {[
              { label: 'Token launch', note: 'Stonklauncher · antisnipe · $STONK LP locked', status: 'progress' },
              {
                label: 'TBA drop · in AMM',
                note: `${num(BONUS_PER_TBA)} $BONUS · ${num(BONUS_GENESIS_BROKERS)} brokers`,
                status: 'progress',
              },
              {
                label: 'TBA drop · outside AMM',
                note: `${num(BONUS_PER_TBA)} $BONUS · same per-TBA amount`,
                status: 'progress',
              },
              {
                label: 'LP seed',
                note: `${num(BONUS_LP_SEED)} $BONUS`,
                status: 'progress',
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3"
              >
                <div>
                  <div className="text-[13px] text-ink">{row.label}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-faint">{row.note}</div>
                </div>
                <StatusTag status={row.status} />
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
            Recipient counts land here once the drop txs are in the snapshot. Nothing on this
            card is estimated.
          </p>
        </Card>
      </div>

      <Card eyebrow="Roadmap" sub="Launch, airdrop, public TBA tool, then LP fees and Brokerbox">
        <ol className="space-y-0">
          {ROADMAP.map((step, i) => (
            <li
              key={step.id}
              className={`flex gap-4 py-4 ${i < ROADMAP.length - 1 ? 'border-b border-line' : ''}`}
            >
              <div className="flex w-8 shrink-0 flex-col items-center">
                <span className="num text-[13px] text-muted">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-medium text-ink">{step.title}</h3>
                  <StatusTag status={step.status} />
                </div>
                <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card
        eyebrow="Airdrop tool"
        sub={`0.01 ETH + 10,000 $BONUS burned per selected community · ERC-6551 TBAs in batches of ${TBA_BATCH_SIZE}`}
        corner={<PhaseTag phase={phase} />}
      >
        <p className="mb-5 font-mono text-[12px] leading-relaxed text-muted">
          Pick any number of communities. Fees scale with that count. The engine airdrops
          directly into each NFT’s tokenbound account — not the owner wallet — and chunks the
          list at {TBA_BATCH_SIZE} TBAs per transaction for L2 gas limits.
        </p>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            disabled={formLocked}
            className="rounded-lg border border-line px-2.5 py-1 font-mono text-[11px] text-muted hover:text-ink disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            disabled={formLocked}
            className="rounded-lg border border-line px-2.5 py-1 font-mono text-[11px] text-muted hover:text-ink disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {communities.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                disabled={formLocked}
                aria-pressed={on}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                  on ? 'border-accent/50 bg-panel-2' : 'border-line bg-panel hover:border-line'
                }`}
              >
                {c.logo ? (
                  <img
                    src={`/${c.logo}`}
                    alt=""
                    className="h-9 w-9 rounded-lg border border-line object-cover"
                  />
                ) : (
                  <span className="h-9 w-9 rounded-lg border border-line bg-panel-2" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{c.name}</span>
                  <span className="num mt-0.5 block text-[11px] text-faint">
                    {c.nfts != null ? `${num(c.nfts)} TBAs · full mint` : 'TBA count pending'}
                  </span>
                </span>
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${
                    on ? 'border-accent bg-accent' : 'border-line'
                  }`}
                  aria-hidden
                >
                  {on && (
                    <svg className="h-3 w-3 text-black" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 6.2l2.3 2.3 4.7-5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow text-faint">Token address</span>
            <input
              className={inputClass}
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              disabled={formLocked}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="eyebrow text-faint">Amount per NFT</span>
            <input
              className={inputClass}
              value={amountPerNft}
              onChange={(e) => setAmountPerNft(e.target.value)}
              placeholder="5000"
              inputMode="decimal"
              disabled={formLocked}
            />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Collections" value={String(collectionCount)} ch={2} />
          <Stat
            label="Tokenbound accounts"
            value={collectionCount === 0 ? '0' : tbaKnown ? num(tbaTotal) : '—'}
            ch={6}
            note={collectionCount > 0 && !tbaKnown ? 'awaiting snapshot' : undefined}
          />
          <Stat
            label="ETH fee"
            value={`${ethFee.toFixed(2)} ETH`}
            ch={8}
          />
          <Stat
            label="$BONUS burn"
            value={`${num(bonusBurn)} Burned`}
            ch={10}
          />
          <Stat
            label="Total tokens needed"
            value={totalTokensNeeded == null ? '—' : num(totalTokensNeeded)}
            ch={10}
          />
          <Stat
            label="Batches"
            value={plannedBatches ? String(plannedBatches) : '—'}
            note={`~${TBA_BATCH_SIZE} TBAs/tx`}
            ch={3}
          />
        </div>

        {(phase === AIRDROP_PHASE.EXECUTING_BATCHES ||
          phase === AIRDROP_PHASE.COMPLETE ||
          resumable) &&
          (totalBatches > 0 || plannedBatches > 0) && (
          <p className="mt-4 font-mono text-[12px] text-ink">
            Batch {phase === AIRDROP_PHASE.EXECUTING_BATCHES ? currentBatch : Math.min(nextBatchIndex + 1, totalBatches || plannedBatches || 1)} of{' '}
            {totalBatches || plannedBatches} (~{TBA_BATCH_SIZE} TBAs/tx)
          </p>
        )}

        {activeCampaignId != null && (
          <p className="mt-2 font-mono text-[11px] text-faint">
            Campaign {String(activeCampaignId)}
            {resumable ? ' · resume from the next unpaid batch' : ''}
          </p>
        )}

        {error && (
          <p className="mt-3 font-mono text-[12px] text-danger">{error}</p>
        )}

        <button
          type="button"
          onClick={runAirdrop}
          disabled={locked || !canClick}
          className="mt-5 w-full rounded-xl border border-line bg-panel-2 py-3 text-[13px] text-ink transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:text-faint"
        >
          {actionLabel(phase, collectionCount, resumable, tbaKnown)}
        </button>
      </Card>
    </div>
  );
}