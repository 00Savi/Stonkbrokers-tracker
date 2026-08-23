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

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState('stonk');
  const [activeTab, setActiveTab] = useState('roi');

  useEffect(() => {
    fetch('/data.json?v=' + Date.now())
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed loading data:', err);
        setLoading(false);
      });
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