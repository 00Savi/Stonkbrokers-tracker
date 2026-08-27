import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import EcosystemView from './components/views/EcosystemView';
import PortfolioView from './components/views/PortfolioView';
import StonkDetailView from './components/views/StonkDetailView';
import MancerDetailView from './components/views/MancerDetailView';
import YardDetailView from './components/views/YardDetailView';
import CardWallDetailView from './components/views/CardWallDetailView';
import MemesTokensView from './components/views/MemesTokensView';
import { loadProjects, loadOverlay, applyOverlay } from './lib/ggindex';
import { loadPrices, applyPrices } from './lib/prices';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState('stonk');
  const [activeTab, setActiveTab] = useState('roi');

  useEffect(() => {
    const ac = new AbortController();
    let priceTimer = null;
    let painted = false;

    const paint = (payload) => {
      painted = true;
      setData(payload);
      setLoading(false);
    };

    (async () => {
      let json;
      try {
        const res = await fetch('/data.json?v=' + Date.now(), { signal: ac.signal });
        json = await res.json();
      } catch (err) {
        if (!ac.signal.aborted) console.error('Failed loading data:', err);
        setLoading(false);
        return;
      }

      // data.json is deliberately NOT painted yet.
      //
      // It is an hourly snapshot, and the specific figures it gets wrong are the
      // ones corrected below: holder counts Blockscout truncates, activation
      // counts a log-only walk overstates, and prices that are an hour stale.
      // Painting first and correcting a second later showed numbers already
      // known to be wrong, and showed them as though they were right. A wrong
      // number that settles is worse than a slow one, because nothing on screen
      // says which of the two you are looking at.
      //
      // The load screen stands until the live figures arrive.
      const deadline = setTimeout(() => {
        // Unless they do not. A dashboard that never renders is worse than one
        // rendering an hour-old snapshot, so the snapshot is the floor rather
        // than the default.
        if (!painted) {
          console.warn('live sources timed out; falling back to the data.json snapshot');
          paint(json);
        }
      }, 6000);

      let enriched = json;
      try {
        const projects = await loadProjects(ac.signal);

        // Independent of each other, so they run together rather than in
        // sequence — this whole block is what the user is waiting on.
        const [overlay, prices] = await Promise.all([
          loadOverlay(ac.signal, projects).catch((err) => {
            if (!ac.signal.aborted) console.warn('gg-index overlay failed', err);
            return null;
          }),
          loadPrices(projects, ac.signal).catch((err) => {
            if (!ac.signal.aborted) console.warn('price load failed', err);
            return null;
          }),
        ]);

        if (overlay) enriched = applyOverlay(enriched, overlay);
        if (prices) enriched = applyPrices(enriched, prices);

        if (!ac.signal.aborted) {
          const refreshPrices = async () => {
            try {
              const next = await loadPrices(projects, ac.signal);
              setData((current) => applyPrices(current, next));
            } catch (err) {
              if (!ac.signal.aborted) console.warn('price refresh failed', err);
            }
          };
          priceTimer = setInterval(refreshPrices, 60_000);
        }
      } catch (err) {
        if (!ac.signal.aborted) console.warn('gg-index unavailable; using snapshot', err);
      }

      clearTimeout(deadline);
      if (!ac.signal.aborted) paint(enriched);
    })();

    return () => {
      ac.abort();
      if (priceTimer) clearInterval(priceTimer);
    };
  }, []);

  if (loading) return <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center">Syncing Protocol Ledger...</div>;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 pb-16 font-sans antialiased">
      <Header data={data} activeProject={activeProject} onSelectProject={setActiveProject} />
      
      <main className="max-w-6xl mx-auto px-4 md:px-6">
        {/* View 1: Full Ecosystem Overview (Unified God-View) */}
        {activeProject === 'ecosystem' && (
          <EcosystemView data={data} />
        )}

        {/* View 2: Portfolio Wallet Scanner */}
        {activeProject === 'portfolio' && (
          <PortfolioView data={data} />
        )}

        {/* View 3: Robinhood Tokens & Robinhood Stocks */}
        {(activeProject === 'memes' || activeProject === 'stocks') && (
          <MemesTokensView data={data} type={activeProject} />
        )}

        {/* View 4: Isolated Project Detail Views */}
        {['stonk', 'mancer', 'tickeryard', 'cardwall'].includes(activeProject) && (
          <>
            <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
            
            {activeProject === 'stonk' && <StonkDetailView data={data} activeTab={activeTab} />}
            {activeProject === 'mancer' && <MancerDetailView data={data} activeTab={activeTab} />}
            {activeProject === 'tickeryard' && <YardDetailView data={data} activeTab={activeTab} />}
            {activeProject === 'cardwall' && <CardWallDetailView data={data} activeTab={activeTab} />}
          </>
        )}
      </main>
    </div>
  );
}