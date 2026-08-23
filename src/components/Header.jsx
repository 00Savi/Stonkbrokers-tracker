import React, { useState, useEffect, useRef } from 'react';

export default function Header({ data, activeProject, onSelectProject }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
  const formatPrice = (val) => {
    if (!val) return "$0.00";
    if (val < 1) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(val);
    return formatCurrency(val);
  };

  const normalizedKey = activeProject === 'yard' ? 'tickeryard' : (activeProject === 'card' ? 'cardwall' : activeProject);
  const projectData = data?.projects?.[normalizedKey] || data?.projects?.stonk;
  const market = projectData?.market || {};
  const config = projectData?.config || {};

  // Hardcoded mappings to guarantee perfect titles every time
  const projectTitles = {
    stonk: 'StonkBrokers Tracker',
    mancer: 'Mancer Tracker',
    tickeryard: 'TickerYard Tracker',
    cardwall: 'The Card Wall Tracker',
    ecosystem: 'Full Ecosystem Overview',
    portfolio: 'Portfolio Tracker',
    memes: 'Robinhood Tokens',
    stocks: 'Robinhood Stock Tokens'
  };

  const title = projectTitles[activeProject] || "Protocol Tracker";
  
  let logo = config.logo || "Stonkbroker.png";
  let ticker = config.ticker || "TOKEN";

  // Force Stonkbroker logo for global dashboards
  if (['ecosystem', 'portfolio', 'memes', 'stocks'].includes(activeProject)) { 
    logo = "Stonkbroker.png"; 
  }

  const handleSelect = (key) => {
    onSelectProject(key);
    setDropdownOpen(false);
  };

  return (
    <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center pt-8 pb-6 md:mb-8 gap-4 md:gap-6 relative z-50">
      <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
        <div className="w-10 h-10 md:w-12 md:h-12 flex-shrink-0 bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden flex items-center justify-center shadow-sm">
          <img src={`/${logo}`} alt="Logo" className="w-full h-full object-cover" />
        </div>

        <div className="relative inline-block" ref={dropdownRef}>
          <div onClick={() => setDropdownOpen(!dropdownOpen)} className="py-2 cursor-pointer flex items-center gap-2 md:gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl md:text-2xl font-bold text-white hover:text-blue-400 transition">{title}</span>
                <svg className="w-5 h-5 text-slate-400 hover:text-blue-400 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                Built by <a href="https://x.com/savicrypto" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 hover:underline">@savicrypto</a>
              </p>
            </div>
          </div>

          {dropdownOpen && (
            <div className="absolute left-0 top-[100%] mt-1 w-64 bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl py-2 z-50 transition-all duration-200">
              <div onClick={() => handleSelect('ecosystem')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-slate-400"></div> Ecosystem Overview
              </div>
              <div className="border-t border-[#334155] my-1"></div>
              <div onClick={() => handleSelect('stonk')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div> StonkBrokers
              </div>
              <div onClick={() => handleSelect('mancer')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div> Mancer
              </div>
              <div onClick={() => handleSelect('tickeryard')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-cyan-400"></div> TickerYard
              </div>
              <div onClick={() => handleSelect('cardwall')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div> The Card Wall
              </div>
              <div className="border-t border-[#334155] my-1"></div>
              <div onClick={() => handleSelect('portfolio')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-emerald-300 font-bold transition">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                Portfolio Tracker
              </div>
              <div className="border-t border-[#334155] my-1"></div>
              <div onClick={() => handleSelect('memes')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Robinhood Tokens
              </div>
              <div onClick={() => handleSelect('stocks')} className="px-4 py-2.5 hover:bg-[#334155] cursor-pointer flex items-center gap-3 text-white font-semibold transition">
                <div className="w-2 h-2 rounded-full bg-blue-400"></div> Robinhood Stocks
              </div>
            </div>
          )}
        </div>
      </div>

      {activeProject !== 'ecosystem' && activeProject !== 'portfolio' && activeProject !== 'memes' && activeProject !== 'stocks' && (
        <div className="flex w-full md:w-auto justify-between md:justify-start gap-4 md:gap-6 text-xs md:text-sm bg-[#1e293b] border border-[#334155] px-4 md:px-6 py-3 rounded-xl shadow-sm z-40">
          <div>
            <p className="text-slate-400 mb-0.5">ETH</p>
            <p className="text-white font-bold">{formatCurrency(data?.projects?.stonk?.market?.ethPriceUsd || 0)}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">${ticker}</p>
            <p className="text-white font-bold">{formatPrice(market.tokenPriceUsd || 0)}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">Floor</p>
            <p className="text-white font-bold">{(market.nftFloorEth || 0).toFixed(3)} ETH</p>
          </div>
        </div>
      )}
    </header>
  );
}