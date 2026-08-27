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

      // Paint from data.json first. It is an hourly snapshot, so it is stale by
      // up to an hour but it is complete, and showing it immediately beats
      // holding a blank screen while the index is queried.
      setData(json);
      setLoading(false);

      // The catalog is shared by both layers below, so fetch it once.
      let projects = null;
      try {
        projects = await loadProjects(ac.signal);
      } catch (err) {
        if (!ac.signal.aborted) console.warn('gg-index catalog unavailable', err);
      }

      // Then correct the figures gg-index owns. Holder and activation counts
      // are wrong in the snapshot often enough to matter — see lib/ggindex.js
      // for what each one gets wrong and why.
      if (projects) {
        try {
          const overlay = await loadOverlay(ac.signal, projects);
          setData((current) => applyOverlay(current, overlay));
        } catch (err) {
          if (!ac.signal.aborted) {
            console.warn('gg-index unavailable; showing data.json figures', err);
          }
        }
      }

      // Prices last, and on a timer. data.json is hourly because that is what
      // its slowest source costs; prices move by the minute, and both feeds are
      // free, so there is no reason to show an hour-old quote.
      if (!projects) return;

      const refreshPrices = async () => {
        try {
          const prices = await loadPrices(projects, ac.signal);
          setData((current) => applyPrices(current, prices));
        } catch (err) {
          if (!ac.signal.aborted) console.warn('price refresh failed', err);
        }
      };

      await refreshPrices();
      priceTimer = setInterval(refreshPrices, 60_000);
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