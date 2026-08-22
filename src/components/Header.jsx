import React, { useState } from 'react';

export default function Header({ data, currentProject, onSelectProject }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const projectsMap = {
    ecosystem: { name: 'Full Ecosystem Overview', logo: '/Stonkbroker.png', ticker: 'ECO' },
    stonk: { name: 'StonkBrokers Tracker', logo: '/Stonkbroker.png', ticker: 'STONK' },
    mancer: { name: 'Mancer Tracker', logo: '/logo.png', ticker: 'MANCER' },
    tickeryard: { name: 'TickerYard Tracker', logo: '/Yardkeepers.png', ticker: 'YARD' },
    cardwall: { name: 'The Card Wall Tracker', logo: '/wall.png', ticker: 'WALL' },
    portfolio: { name: 'Portfolio Tracker', logo: '/Stonkbroker.png', ticker: 'PORT' },
    memes: { name: 'Robinhood Tokens Tracker', logo: '/Stonkbroker.png', ticker: 'TOKENS' },
    stocks: { name: 'Robinhood Stock Tokens', logo: '/Stonkbroker.png', ticker: 'STOCKS' }
  };

  const currentMeta = projectsMap[currentProject] || projectsMap.stonk;
  const ethPrice = data?.projects?.stonk?.market?.ethPriceUsd || 0;
  const activeProjData = data?.projects?.[currentProject];
  const market = activeProjData?.market || {};

  return (
    <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4 md:gap-6">
      {/* Left: Logo & Dropdown Title with Built By Attribution */}
      <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto z-50">
        <div className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden flex items-center justify-center shadow-sm">
          <img src={currentMeta.logo} alt="PFP" className="w-full h-full object-cover" />
        </div>
        
        <div className="relative inline-block">
          <div 
            onClick={() => setDropdownOpen(!dropdownOpen)} 
            className="py-2 cursor-pointer flex items-center gap-2 md:gap-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl md:text-2xl font-bold text-white hover:text-blue-400 transition">
                  {currentMeta.name}
                </span>
                <svg className="w-5 h-5 text-slate-400 hover:text-blue-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                Built by 
                <a href="https://x.com/savicrypto" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 hover:underline">
                  @savicrypto
                  <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] px-1.5 py-0.2 rounded-full font-semibold">Follow</span>
                </a>
              </p>
            </div>
          </div>
          
          {dropdownOpen && (
            <div className="absolute left-0 top-[85%] mt-1 w-64 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl py-2 z-50">
              <div onClick={() => { onSelectProject('ecosystem'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-blue-400"></div> Full Ecosystem Overview
              </div>
              <div onClick={() => { onSelectProject('stonk'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> StonkBrokers
              </div>
              <div onClick={() => { onSelectProject('mancer'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div> Mancer
              </div>
              <div onClick={() => { onSelectProject('tickeryard'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-cyan-400"></div> TickerYard <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-semibold ml-auto">Live</span>
              </div>
              <div onClick={() => { onSelectProject('cardwall'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div> The Card Wall <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded font-semibold ml-auto">New</span>
              </div>
              <div className="border-t border-[#334155] my-1"></div>
              <div onClick={() => { onSelectProject('portfolio'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-emerald-300 font-bold transition">
                Portfolio Tracker
              </div>
              <div className="border-t border-[#334155] my-1"></div>
              <div onClick={() => { onSelectProject('memes'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Robinhood Tokens
              </div>
              <div onClick={() => { onSelectProject('stocks'); setDropdownOpen(false); }} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-blue-400"></div> Robinhood Stocks
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle/Right: Referral Badge & Price Tickers */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto justify-between md:justify-end">
        {/* Referral Banner Button */}
        <a 
          href="https://stonkbrokers.io/safe-launch?ref=SAVI" 
          target="_blank" 
          rel="noreferrer"
          className="bg-[#0f172a] hover:bg-emerald-950/40 border border-emerald-500/40 hover:border-emerald-400 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3 transition group"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold">Safe Launchpad Ref</p>
            <p className="text-xs font-mono text-white group-hover:text-emerald-300 transition">?ref=SAVI ↗</p>
          </div>
        </a>

        {/* Tickers */}
        <div className="flex justify-between md:justify-start gap-2 md:gap-6 text-xs md:text-sm bg-[#1e293b] border border-[#334155] px-4 md:px-6 py-3 rounded-xl shadow-sm z-40">
          <div>
            <p className="text-slate-400 mb-0.5">ETH</p>
            <p className="text-white font-bold">{formatCurrency(ethPrice)}</p>
          </div>
          {currentProject !== 'ecosystem' && currentProject !== 'portfolio' && currentProject !== 'memes' && currentProject !== 'stocks' && (
            <>
              <div>
                <p className="text-slate-400 mb-0.5">${currentMeta.ticker}</p>
                <p className="text-white font-bold">${(market.tokenPriceUsd || 0).toFixed(4)}</p>
              </div>
              <div>
                <p className="text-slate-400 mb-0.5">Floor</p>
                <p className="text-white font-bold">{market.nftFloorEth || 0} ETH</p>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}