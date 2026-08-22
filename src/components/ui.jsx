import React from 'react';

export function Card({ children, className = '', padding = 'p-6' }) {
  return (
    <div className={`bg-[#1e293b] border border-[#334155] ${padding} rounded-2xl shadow-lg ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ title, value, sub, valueClass = 'text-white', dot, dotColor, accent }) {
  return (
    <div className={`bg-[#1e293b] border border-[#334155] p-5 rounded-2xl shadow-lg ${accent ? 'border-b-4' : ''}`} style={accent ? { borderBottomColor: accent } : undefined}>
      <div className="flex items-center gap-2 mb-1">
        {(dot || dotColor) && (
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot || ''}`} style={dotColor ? { backgroundColor: dotColor } : undefined} />
        )}
        <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      </div>
      <p className={`text-2xl md:text-3xl font-extrabold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

export function SectionHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Switcher({ options, value, onChange }) {
  return (
    <div className="flex bg-[#0f172a] rounded-lg p-1 border border-[#334155]">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`px-3 py-1 text-xs font-bold rounded-md transition ${
            value === opt.id ? 'bg-[#334155] text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function LegendRow({ color, dot, name, value }) {
  return (
    <div className="flex items-center justify-between bg-[#0f172a] border border-[#334155] px-4 py-3 rounded-xl">
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${dot || ''}`} style={color ? { backgroundColor: color } : undefined} />
        <span className="text-sm font-semibold text-white">{name}</span>
      </div>
      <span className="text-sm font-bold text-slate-200">{value}</span>
    </div>
  );
}

// Shown instead of a chart when the payload has nothing to draw yet. The old
// build filled these gaps with invented curves, which is worse than an empty
// state: a made-up line is indistinguishable from a real one.
export function EmptyChart({ message }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-center px-6">
      <p className="text-sm text-slate-500 max-w-md">{message}</p>
    </div>
  );
}

export function UnderConstructionNotice({ name }) {
  return (
    <Card className="text-center" padding="p-10">
      <p className="text-3xl mb-3">🚧</p>
      <h3 className="text-lg font-bold text-white mb-2">{name} is still being wired up</h3>
      <p className="text-sm text-slate-400 max-w-lg mx-auto">
        The tracker is indexing this project, but it has no activation contract yet, so yield
        and activation figures are not meaningful. Supply and burn data below are live.
      </p>
    </Card>
  );
}

// Marks a value the fetcher carried forward from a previous run because the
// metered API key was exhausted. Unknown is not zero, and it should not look
// like a fresh reading.
export function StaleBadge({ fields }) {
  if (!fields || fields.length === 0) return null;
  return (
    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
      <span className="text-amber-400 text-sm leading-none mt-0.5">⚠</span>
      <p className="text-xs text-amber-200/90">
        <span className="font-bold text-amber-300">Carried forward:</span>{' '}
        {fields.join(', ')} could not be refreshed on the last sync and show the previous run's
        value.
      </p>
    </div>
  );
}
