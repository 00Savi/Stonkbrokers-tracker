import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import EcosystemView from './components/views/EcosystemView';
import ProjectDetailView from './components/views/ProjectDetailView';
import PortfolioView from './components/views/PortfolioView';

export default function App() {
  const [data, setData] = useState(null);
  const [currentProject, setCurrentProject] = useState('ecosystem');
  const [activeTab, setActiveTab] = useState('roi');
  const [loading, setLoading] = useState(true);
  const [sortDir, setSortDir] = useState({});

  useEffect(() => {
    fetch('/data.json?v=' + Date.now())
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load data.json', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f172a] text-white">
        <p className="animate-pulse font-bold text-xl">Loading Protocol Ecosystem...</p>
      </div>
    );
  }

  const getMethodologyContent = (tab) => {
    switch (tab) {
      case 'historical':
        return {
          title: "Historical Yield & Payback Horizon Methodology",
          text: "Capital recovery timelines are calculated by dividing the total entry cost by annualized trailing yield rates. ROI trajectories map historical performance over rolling epochs."
        };
      case 'revenue':
        return {
          title: "Protocol Revenue & Ecosystem Liquidity Methodology",
          text: "On-chain fee generation aggregates multi-stream smart contract inflows including AMM swap routing fees, clock-in security vault distributions, and safe launchpad deployment revenue."
        };
      case 'burn':
        return {
          title: "Token Burn & Supply Deflation Methodology",
          text: "Deflationary tracking monitors automated fee-on-transfer mechanics, burn flywheels, and equivalent NFT supply reductions."
        };
      case 'activation':
        return {
          title: "Ecosystem Activation Metrics Methodology",
          text: "Activation ratios calculate the proportion of total max supply currently locked and activated across tiers T0 through T4."
        };
      case 'ownership':
        return {
          title: "Protocol Ownership & Distribution Methodology",
          text: "Wallet concentration metrics evaluate unique human holders against true circulating supply, subtracting protocol treasury allocations."
        };
      case 'portfolio':
        return {
          title: "Multi-Wallet Portfolio Tracker Methodology",
          text: "The portfolio scanner queries direct ERC-721 owner indices across EVM contracts to calculate aggregate floor values, active tier cash-flows, and historical lifetime earnings."
        };
      case 'memes':
      case 'stocks':
        return {
          title: "Robinhood Tokens Tracker Methodology",
          text: "Real-time liquidity, 24-hour volume, FDV, market capitalization, and burn ratios scanned directly from Robinhood Chain DEX pairs."
        };
      default:
        return {
          title: "Yield & ROI (Global Network Oracle) Methodology",
          text: "Cash-on-Cash (CoC) returns are calculated dynamically based on the selected project's architecture and active network weight."
        };
    }
  };

  const activeMethodologyKey = ['portfolio', 'memes', 'stocks'].includes(currentProject) ? currentProject : activeTab;
  const currentMethodology = getMethodologyContent(activeMethodologyKey);
  const tokenList = currentProject === 'stocks' ? (data?.stocks || []) : (data?.memes || []);

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans antialiased overflow-x-hidden flex flex-col justify-between">
      <div>
        <Header
          data={data}
          currentProject={currentProject}
          onSelectProject={(proj) => {
            setCurrentProject(proj);
            if (proj === 'portfolio' || proj === 'memes' || proj === 'stocks') {
              setActiveTab(proj);
            } else if (['portfolio', 'memes', 'stocks'].includes(activeTab)) {
              setActiveTab('roi');
            }
          }}
        />

        {!['portfolio', 'memes', 'stocks'].includes(currentProject) && (
          <Navigation 
            activeTab={activeTab} 
            onSelectTab={(tab) => {
              setActiveTab(tab);
              if (['portfolio', 'memes', 'stocks'].includes(currentProject)) {
                setCurrentProject('ecosystem');
              }
            }} 
          />
        )}

        <main className="max-w-6xl mx-auto mt-6">
          {currentProject === 'ecosystem' && (
            <EcosystemView data={data} activeTab={activeTab} />
          )}
          
          {['stonk', 'mancer', 'tickeryard', 'cardwall'].includes(currentProject) && (
            <ProjectDetailView projectKey={currentProject} data={data} activeTab={activeTab} />
          )}

          {currentProject === 'portfolio' && (
            <PortfolioView data={data} />
          )}

          {['memes', 'stocks'].includes(currentProject) && (
            <div className="bg-[#1e293b] border border-[#334155] rounded-2xl p-6 md:p-8 shadow-xl">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🪙</span> {currentProject === 'stocks' ? 'Robinhood Stock Tokens Tracker' : 'Robinhood Tokens Tracker'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">Real-time liquidity, volume, and metrics for Robinhood Chain tokens.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[950px]">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-[#334155]">
                      <th className="pb-4 font-medium pl-2">Token Name</th>
                      <th className="pb-4 font-medium">Volume (24h)</th>
                      <th className="pb-4 font-medium">Liquidity</th>
                      <th className="pb-4 font-medium">24h % Change</th>
                      <th className="pb-4 font-medium">ROI</th>
                      <th className="pb-4 font-medium">FDV</th>
                      <th className="pb-4 font-medium">Market Cap</th>
                      <th className="pb-4 font-medium text-right pr-4">Burnt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#334155]/50 text-sm">
                    {tokenList.map((token, index) => {
                      const isPos = (token.priceChange24h || 0) >= 0;
                      return (
                        <tr key={index} className="hover:bg-[#334155]/20 transition">
                          <td className="py-4 pl-2 font-bold text-white flex items-center justify-between pr-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                              {token.name}
                            </div>
                            {token.ca ? (
                              <button 
                                onClick={() => { navigator.clipboard.writeText(token.ca); alert(`Copied CA for ${token.name}`); }}
                                className="text-[10px] bg-[#334155] hover:bg-slate-600 text-slate-200 px-2 py-0.5 rounded border border-slate-600 ml-2 transition"
                              >
                                Copy CA
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 ml-2">No CA</span>
                            )}
                          </td>
                          <td className="py-4 text-slate-200">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(token.volume24h || 0)}</td>
                          <td className="py-4 text-slate-200">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(token.liquidity || 0)}</td>
                          <td className={`py-4 font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPos ? '+' : ''}{(token.priceChange24h || 0).toFixed(2)}%
                          </td>
                          <td className="py-4 text-emerald-400 font-semibold">{token.roi || '0.00%'}</td>
                          <td className="py-4 text-slate-200">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(token.fdv || 0)}</td>
                          <td className="py-4 text-slate-200">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(token.marketCap || 0)}</td>
                          <td className="py-4 text-right pr-4 text-orange-400 font-semibold">
                            {token.burnt > 0 ? `${((token.burnt / (token.totalSupply || 1000000000)) * 100).toFixed(2)}%` : '0.00%'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Dynamic Methodology & Disclaimer Footer */}
      <footer className="max-w-6xl mx-auto w-full card rounded-xl p-5 md:p-6 border mt-12 shadow-lg bg-[#1e293b] border-[#334155]">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
          </svg>
          <h3 className="text-base md:text-lg font-bold text-white">Methodology & Disclaimer</h3>
        </div>
        
        <div className="text-xs md:text-sm text-slate-300 mb-5 leading-relaxed space-y-4">
          <p>
            <strong className="text-white">{currentMethodology.title}:</strong> {currentMethodology.text}
          </p>
        </div>
        <p className="text-xs md:text-sm text-slate-400 italic leading-relaxed border-t border-[#334155] pt-5">
          <strong className="text-slate-300 not-italic">Disclaimer:</strong> Tracked yield values are calculated using Mark-to-Market spot pricing at the exact time of the dashboard's last automated sync, rather than the historical price at the time of the drop. Yields fluctuate based on network activation weight, market token prices, and community protocol volume. This is a community-built tracking tool and does not guarantee future returns.
        </p>
      </footer>
    </div>
  );
}