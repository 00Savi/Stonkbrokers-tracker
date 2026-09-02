import React, { useState } from 'react';

import { compactUsd } from '../kit';

export default function MemesTokensView({ data, type = 'memes' }) {
  const isStocks = type === 'stocks';
  const tokensList = isStocks ? (data?.stocks || []) : (data?.memes || []);

  const [expandedIndex, setExpandedIndex] = useState(null);
  const [sortCol, setSortCol] = useState('volume24h');
  const [sortAsc, setSortAsc] = useState(false);

  const formatCurrency = compactUsd;

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const sortedTokens = [...tokensList].sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];
    if (typeof valA === 'string') return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return sortAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
  });

  return (
    <div className="bg-[#0e1013] border border-[#1e2228] rounded-2xl p-4 md:p-6 shadow-xl mt-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
            {isStocks ? 'Robinhood Stock Tokens Tracker' : 'Robinhood Tokens Tracker'}
          </h2>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            {isStocks ? 'Real-time liquidity, volume, and metrics for Robinhood Chain stock tokens' : 'Real-time liquidity, volume, and metrics for Robinhood Chain tokens'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 pb-2">
        <table className="w-full text-left border-collapse min-w-[950px]">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-[#1e2228] cursor-pointer select-none">
              <th className="pb-4 pl-2 font-medium hover:text-blue-400" onClick={() => handleSort('name')}>Token Name ↕</th>
              <th className="pb-4 font-medium hover:text-blue-400" onClick={() => handleSort('volume24h')}>Volume (24h) ↕</th>
              <th className="pb-4 font-medium hover:text-blue-400" onClick={() => handleSort('liquidity')}>Liquidity ↕</th>
              <th className="pb-4 font-medium hover:text-blue-400" onClick={() => handleSort('priceChange24h')}>24h % Change ↕</th>
              <th className="pb-4 font-medium hover:text-blue-400" onClick={() => handleSort('roi')}>ROI ↕</th>
              <th className="pb-4 font-medium hover:text-blue-400" onClick={() => handleSort('fdv')}>FDV ↕</th>
              <th className="pb-4 font-medium hover:text-blue-400" onClick={() => handleSort('marketCap')}>Market Cap ↕</th>
              <th className="pb-4 font-medium text-right pr-4 hover:text-blue-400" onClick={() => handleSort('burnt')}>Burnt ↕</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2228]/50 text-sm">
            {sortedTokens.map((token, index) => {
              const roiColor = (token.priceChange24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
              const roiSign = (token.priceChange24h || 0) >= 0 ? '+' : '';
              const totalSupply = token.totalSupply || 1000000000;
              const burntPct = token.burnt > 0 ? ((token.burnt / totalSupply) * 100).toFixed(2) + '%' : '0.00%';
              const isExpanded = expandedIndex === index;

              return (
                <React.Fragment key={token.ca || index}>
                  <tr 
                    onClick={() => setExpandedIndex(isExpanded ? null : index)} 
                    className="hover:bg-[#1e2228]/20 transition cursor-pointer group"
                  >
                    <td className="py-4 pl-2 font-bold text-white flex items-center justify-between pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                        {token.name}
                      </div>
                      {token.ca ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(token.ca);
                            alert(`Copied CA for ${token.name}:\n${token.ca}`);
                          }}
                          className="text-[10px] bg-[#1e2228] hover:bg-slate-600 text-slate-200 px-2 py-0.5 rounded border border-slate-600 ml-2 transition"
                        >
                          Copy CA
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500 ml-2">No CA</span>
                      )}
                    </td>
                    <td className="py-4 text-slate-200">{formatCurrency(token.volume24h)}</td>
                    <td className="py-4 text-slate-200">{formatCurrency(token.liquidity)}</td>
                    <td className={`py-4 font-bold ${roiColor}`}>{roiSign}{(token.priceChange24h || 0).toFixed(2)}%</td>
                    <td className="py-4 text-emerald-400 font-semibold">{token.roi || '0.00%'}</td>
                    <td className="py-4 text-slate-200">{formatCurrency(token.fdv)}</td>
                    <td className="py-4 text-slate-200">{formatCurrency(token.marketCap)}</td>
                    <td className="py-4 text-right pr-4 text-orange-400 font-semibold">
                      <div className="flex items-center justify-end gap-2">
                        <span>{burntPct}</span>
                        <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 group-hover:text-white ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-[#08090b]/60 border-b border-[#1e2228]/50">
                      <td colSpan="8" className="p-4 md:p-6">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            {token.name} Live Interactive Chart
                          </h4>
                        </div>
                        {token.ca ? (
                          <div className="relative w-full h-[260px] sm:h-[450px] rounded-xl overflow-hidden border border-[#1e2228] shadow-inner">
                            <iframe 
                              src={`https://dexscreener.com/robinhood/${token.ca}?embed=1&theme=dark&trades=0&info=0`} 
                              className="w-full h-full border-0" 
                              title={`${token.name} Chart`}
                            />
                          </div>
                        ) : (
                          <div className="p-8 text-center text-slate-400 italic bg-[#0e1013]/40 rounded-xl border border-[#1e2228]">
                            Interactive chart unavailable (Contract Address pending launch).
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}