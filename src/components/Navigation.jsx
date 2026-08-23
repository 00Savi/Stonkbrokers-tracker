import React from 'react';

export default function Navigation({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'roi', label: 'ROI Benchmarks' },
    { id: 'historical', label: 'Historical Yield' },
    { id: 'revenue', label: 'Revenue & LPs' },
    { id: 'burn', label: 'Burn Tracker' },
    { id: 'activation', label: 'Activation' },
    { id: 'ownership', label: 'Ownership' }
  ];

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <div className="flex flex-wrap gap-2 md:gap-3 w-full sm:w-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 sm:flex-none justify-center px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition text-xs md:text-sm ${
              activeTab === tab.id
                ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'bg-transparent border border-[#334155] hover:bg-[#1e293b] text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}