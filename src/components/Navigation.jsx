import React from 'react';

export default function Navigation({ activeTab, onSelectTab }) {
  const tabs = [
    { id: 'roi', label: 'ROI Benchmarks' },
    { id: 'historical', label: 'Historical Yield' },
    { id: 'revenue', label: 'Revenue & LPs' },
    { id: 'burn', label: 'Burn Tracker' },
    { id: 'activation', label: 'Activation' },
    { id: 'ownership', label: 'Ownership' },
  ];

  return (
    <div className="max-w-6xl mx-auto flex flex-wrap gap-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          className={`px-4 py-2 rounded-lg font-semibold text-xs md:text-sm transition flex-1 sm:flex-none justify-center ${
            activeTab === tab.id
              ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25'
              : 'bg-transparent border border-[#334155] text-slate-300 hover:bg-[#1e293b]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}