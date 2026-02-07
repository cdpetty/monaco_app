import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Data Constants ───────────────────────────────────────────────
const ENTRY_STAGES = ['Pre-seed', 'Seed', 'Series A', 'Series B'];

const DEFAULT_STAGE_VALUATIONS = {
  'Pre-seed': 15, 'Seed': 30, 'Series A': 70, 'Series B': 200,
  'Series C': 500, 'Series D': 750, 'Series E': 1500,
  'Series F': 5000, 'Series G': 10000,
};

function getStageValuations() {
  try {
    const stored = localStorage.getItem('monaco_custom_stage_valuations');
    if (stored) return { ...DEFAULT_STAGE_VALUATIONS, ...JSON.parse(stored) };
  } catch (e) {}
  return DEFAULT_STAGE_VALUATIONS;
}

const DEFAULT_CONFIG = {
  fund_size_m: 200,
  management_fee_pct: 2,
  fee_duration_years: 10,
  recycled_capital_pct: 20,
  dry_powder_reserve_for_pro_rata: 40,
  reinvest_unused_reserve: true,
  pro_rata_max_valuation: 500,
  stage_allocations: {
    'Pre-seed': { pct: 25, check_size: 1.5 },
    'Seed':     { pct: 25, check_size: 2.0 },
    'Series A': { pct: 50, check_size: 5.0 },
    'Series B': { pct: 0,  check_size: 10.0 },
  },
};
const MAX_STRATEGIES = 6;

function migrateConfig(config) {
  if (config.stage_allocations) return config;
  const { preseed_pct, preseed_check_size, seed_check_size, ...rest } = config;
  const pp = preseed_pct ?? 100;
  return {
    ...rest,
    stage_allocations: {
      'Pre-seed': { pct: pp, check_size: preseed_check_size ?? 1.5 },
      'Seed':     { pct: 100 - pp, check_size: seed_check_size ?? 2.0 },
      'Series A': { pct: 0, check_size: 5.0 },
      'Series B': { pct: 0, check_size: 10.0 },
    },
  };
}

const STRATEGY_COLORS = [
  { main: '#2563eb', dim: 'rgba(37,99,235,0.4)', bg: 'rgba(37,99,235,0.08)' },
  { main: '#dc2626', dim: 'rgba(220,38,38,0.4)', bg: 'rgba(220,38,38,0.08)' },
  { main: '#16a34a', dim: 'rgba(22,163,74,0.4)', bg: 'rgba(22,163,74,0.08)' },
  { main: '#ca8a04', dim: 'rgba(202,138,4,0.4)', bg: 'rgba(202,138,4,0.08)' },
  { main: '#9333ea', dim: 'rgba(147,51,234,0.4)', bg: 'rgba(147,51,234,0.08)' },
  { main: '#0891b2', dim: 'rgba(8,145,178,0.4)', bg: 'rgba(8,145,178,0.08)' },
];

// ─── Utilities ────────────────────────────────────────────────────
function computeP95(distribution) {
  if (!distribution || distribution.length === 0) return null;
  const sorted = [...distribution].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function buildHistogram(distribution, numBins = 24) {
  if (!distribution || distribution.length === 0) return { bins: [], labels: [] };
  const CAP = 10;
  const binWidth = CAP / numBins;
  const counts = new Array(numBins).fill(0);
  for (const val of distribution) {
    let idx = Math.floor(val / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const maxCount = Math.max(...counts, 1);
  const bins = counts.map((c) => (c / maxCount) * 100);
  const labels = [];
  for (let i = 0; i < numBins; i++) {
    const lo = i * binWidth;
    if (i === 0 || i === Math.floor(numBins / 4) || i === Math.floor(numBins / 2) || i === Math.floor(3 * numBins / 4)) {
      labels.push(lo.toFixed(1) + 'x');
    } else if (i === numBins - 1) {
      labels.push(CAP + '+');
    } else {
      labels.push('');
    }
  }
  return { bins, labels };
}

function deepCloneAllocations(allocs) {
  const out = {};
  for (const [k, v] of Object.entries(allocs || {})) out[k] = { ...v };
  return out;
}

function deepCloneConfig(cfg) {
  return { ...cfg, stage_allocations: deepCloneAllocations(cfg.stage_allocations) };
}

// ─── Saved strategies helpers ─────────────────────────────────────
let nextStrategyId = 1;

function loadSavedStrategies() {
  try {
    const raw = localStorage.getItem('monaco_saved_strategies');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        nextStrategyId = Math.max(...parsed.map((s) => s.id)) + 1;
        return parsed.map((s) => ({ ...s, config: migrateConfig(s.config) }));
      }
    }
  } catch (e) {}
  return [];
}

function persistStrategies(strategies) {
  localStorage.setItem('monaco_saved_strategies', JSON.stringify(strategies));
}

function strategyCode(index) {
  return String.fromCharCode(65 + (index % 26));
}

function summarizeConfig(config) {
  const activeStages = ENTRY_STAGES.filter((s) => (config.stage_allocations?.[s]?.pct || 0) > 0);
  const checks = activeStages.map((s) => `$${config.stage_allocations[s].check_size}M`);
  const stageAbbrevs = { 'Pre-seed': 'PS', 'Seed': 'S', 'Series A': 'A', 'Series B': 'B' };
  const stages = activeStages.map((s) => stageAbbrevs[s] || s).join(', ');
  return {
    checkSize: checks.length > 0 ? checks.join(' – ') : '—',
    reserves: `${config.dry_powder_reserve_for_pro_rata || 0}%`,
    fundSize: `$${config.fund_size_m || 0}M`,
    stages: stages || '—',
  };
}

function buildSimPayload(config, marketScenario, numIterations) {
  const { stage_allocations, ...rest } = config;
  const valuations = getStageValuations();
  const checkSizes = {};
  const ownershipPcts = {};
  const allocationPcts = {};
  for (const [stage, alloc] of Object.entries(stage_allocations || {})) {
    if (alloc.pct > 0) {
      checkSizes[stage] = alloc.check_size;
      ownershipPcts[stage] = alloc.check_size / (valuations[stage] || 1);
      allocationPcts[stage] = alloc.pct;
    }
  }
  const cfg = {
    ...rest,
    market_scenario: marketScenario,
    num_periods: 8,
    num_iterations: numIterations,
    check_sizes_at_entry: checkSizes,
    ownership_percentages_at_entry: ownershipPcts,
    stage_allocation_pcts: allocationPcts,
  };
  const storedRates = localStorage.getItem('monaco_custom_graduation_rates');
  if (storedRates) {
    const customRates = JSON.parse(storedRates);
    if (customRates[marketScenario]) cfg.graduation_rates = customRates[marketScenario];
  }
  const storedVals = localStorage.getItem('monaco_custom_stage_valuations');
  if (storedVals) cfg.stage_valuations = JSON.parse(storedVals);
  const storedMna = localStorage.getItem('monaco_custom_mna_outcomes');
  if (storedMna) cfg.m_and_a_outcomes = JSON.parse(storedMna);
  return cfg;
}

// ─── Style Constants ──────────────────────────────────────────────
const MONO = "'JetBrains Mono', monospace";

// ─── Reusable Components ──────────────────────────────────────────
const InputGroup = ({ label, value, onChange, type = 'text', rightLabel }) => (
  <div className="input-group">
    <label className="input-label">
      <span>{label}</span>
      {rightLabel && <span className="mono">{rightLabel}</span>}
    </label>
    <input type={type} className="input-field" value={value} onChange={onChange} />
  </div>
);

const SliderInput = ({ label, value, onChange, min, max, step = 1, unit = '' }) => (
  <div className="slider-container">
    <div className="slider-header">
      <span>{label}</span>
      <span className="mono">{value}{unit}</span>
    </div>
    <div className="range-wrapper">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  </div>
);

const NumberInput = ({ label, value, onChange, min, max, step = 1, unit = '', disabled = false }) => (
  <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
    <label className="input-label">
      <span>{label}</span>
      {unit && <span className="mono">{unit}</span>}
    </label>
    <input type="number" className="input-field" value={value} min={min} max={max} step={step}
      disabled={disabled} style={{ width: '100%', boxSizing: 'border-box', ...(disabled ? { opacity: 0.45, cursor: 'not-allowed', background: '#f5f5f5' } : {}) }}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
  </div>
);

const IterationsInput = ({ value, onChange }) => {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(local, 10);
    if (!isNaN(n) && n >= 100) onChange(n);
    else { onChange(value); setLocal(String(value)); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#999' }}>N=</span>
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.target.blur(); } }}
        style={{ width: '68px', padding: '4px 6px', fontFamily: MONO, fontSize: '11px', border: '1px solid var(--ink)', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', textAlign: 'right' }}
      />
    </div>
  );
};

const StrategyCard = ({ name, code, checkSize, reserves, fundSize, stages, isActive, hasResults, isStale, onClick, onDelete, onNameChange }) => (
  <div className={`strategy-card ${isActive ? 'active' : ''}`} onClick={onClick}>
    <div className="strategy-card-header">
      {isActive && onNameChange ? (
        <input
          type="text" value={name}
          onChange={(e) => onNameChange(e.target.value.toUpperCase())}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          style={{ font: 'inherit', fontWeight: 700, border: 'none', borderBottom: '1px dashed var(--ink)', outline: 'none', background: 'transparent', padding: '0 0 2px', width: '100%', marginRight: '8px' }}
          autoFocus
        />
      ) : (
        <strong>{name}</strong>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {hasResults && !isStale && <span style={{ fontSize: '9px', color: '#16a34a', fontWeight: 600, letterSpacing: '0.05em' }}>RAN</span>}
        {isStale && <span style={{ fontSize: '9px', color: '#ca8a04', fontWeight: 600, letterSpacing: '0.05em' }}>STALE</span>}
        {onDelete && (
          <span className="card-delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</span>
        )}
      </div>
    </div>
    <div className="metric-row"><span>Fund Size</span><span className="mono">{fundSize}</span></div>
    <div className="metric-row"><span>Check Size</span><span className="mono">{checkSize}</span></div>
    <div className="metric-row"><span>Reserves</span><span className="mono">{reserves}</span></div>
    <div className="metric-row"><span>Stages</span><span className="mono">{stages}</span></div>
  </div>
);

const ComparisonCard = ({ name, fundSize, stages, color, isSelected, hasResults, onClick }) => (
  <div onClick={onClick} style={{
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '8px 12px', border: '1px solid var(--ink)', cursor: 'pointer',
    borderLeft: isSelected ? `3px solid ${color.main}` : '1px solid var(--ink)',
    opacity: isSelected ? 1 : 0.35, transition: 'opacity 0.15s, border 0.15s',
    minWidth: '120px', background: isSelected ? color.bg : 'transparent',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontWeight: 700, fontSize: '12px', color: color.main, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{name}</span>
      {hasResults && <span style={{ fontSize: '8px', color: '#16a34a', fontWeight: 600 }}>RAN</span>}
    </div>
    <div style={{ fontFamily: MONO, fontSize: '10px', color: '#666' }}>
      {fundSize} &middot; {stages}
    </div>
  </div>
);

const StatBox = ({ value, label }) => (
  <div className="stat-box">
    <span className="stat-value">{value}</span>
    <span className="stat-label">{label}</span>
  </div>
);

// ─── Stage Allocation Table ───────────────────────────────────────
const StageAllocationTable = ({ stageAllocations, onStageAllocationsChange }) => {
  const valuations = getStageValuations();
  const totalPct = ENTRY_STAGES.reduce((sum, s) => sum + (stageAllocations[s]?.pct || 0), 0);

  const updateStage = (stage, field, value) => {
    const updated = {};
    for (const s of ENTRY_STAGES) updated[s] = { ...(stageAllocations[s] || { pct: 0, check_size: 1 }) };
    updated[stage] = { ...updated[stage], [field]: value };
    onStageAllocationsChange(updated);
  };

  const thStyle = { textAlign: 'right', padding: '3px 2px', fontSize: '9px', fontWeight: 600, color: '#666', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '3px 2px', textAlign: 'right' };
  const readonlyTd = { padding: '3px 2px', textAlign: 'right', fontSize: '10px', color: '#666' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="input-label" style={{ marginBottom: 0, fontSize: '11px' }}>STAGE ALLOCATION</span>
        <span className="mono" style={{ fontSize: '10px', color: totalPct === 100 ? '#999' : '#dc2626' }}>
          {totalPct}%{totalPct !== 100 ? ' (≠100%)' : ''}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: '11px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ink)' }}>
            <th style={{ ...thStyle, textAlign: 'left' }}>STAGE</th>
            <th style={thStyle}>%</th>
            <th style={thStyle}>CHECK</th>
            <th style={thStyle}>OWN</th>
            <th style={thStyle}>VAL</th>
          </tr>
        </thead>
        <tbody>
          {ENTRY_STAGES.map((stage) => {
            const alloc = stageAllocations[stage] || { pct: 0, check_size: 1 };
            const val = valuations[stage] || 1;
            const ownership = ((alloc.check_size / val) * 100).toFixed(1);
            const isActive = alloc.pct > 0;
            return (
              <tr key={stage} style={{ opacity: isActive ? 1 : 0.35, borderBottom: '1px solid var(--trace)' }}>
                <td style={{ padding: '3px 0', fontSize: '10px' }}>{stage}</td>
                <td style={tdStyle}>
                  <input type="number" value={alloc.pct} min={0} max={100} step={5}
                    onChange={(e) => updateStage(stage, 'pct', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    className="input-field compact" style={{ width: '40px', textAlign: 'right', padding: '3px 4px', fontSize: '11px' }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" value={alloc.check_size} min={0.1} max={50} step={0.25}
                    disabled={!isActive}
                    onChange={(e) => updateStage(stage, 'check_size', parseFloat(e.target.value) || 0.1)}
                    className="input-field compact" style={{ width: '48px', textAlign: 'right', padding: '3px 4px', fontSize: '11px' }} />
                </td>
                <td style={readonlyTd}>{isActive ? `${ownership}%` : '—'}</td>
                <td style={readonlyTd}>{isActive ? `$${val}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Portfolio Breakdown Tooltip ──────────────────────────────────
const BreakdownTooltip = ({ breakdown, label, x, y }) => {
  if (!breakdown || !breakdown.segments) return null;
  const positiveSegs = breakdown.segments.filter((s) => s.type !== 'failed' && s.value > 0);
  const failedSeg = breakdown.segments.find((s) => s.type === 'failed');
  const allSegs = [...positiveSegs, ...(failedSeg ? [failedSeg] : [])];
  if (allSegs.length === 0) return null;

  const totalValue = positiveSegs.reduce((sum, s) => sum + s.value, 0);
  const maxPosVal = Math.max(...positiveSegs.map((s) => s.value), 1);
  const maxNegVal = failedSeg ? failedSeg.value : 0;
  const barW = 28;
  const barGap = 6;
  const chartW = allSegs.length * (barW + barGap) - barGap;
  const posH = 100;
  const negH = maxNegVal > 0 ? Math.min((maxNegVal / maxPosVal) * posH, 50) : 0;
  const headerH = 32;
  const labelH = 48;
  const svgW = chartW + 20;
  const svgH = headerH + posH + negH + labelH;
  const baseline = headerH + posH;

  const segColor = (s) => s.type === 'acquired' ? '#16a34a' : s.type === 'failed' ? '#dc2626' : '#000000';

  return (
    <div style={{
      position: 'fixed', right: `calc(100vw - ${x - 20}px)`, top: y - svgH / 2, zIndex: 1000,
      background: 'var(--paper)', border: '1px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)',
      padding: '10px 12px', fontFamily: MONO, fontSize: '9px', pointerEvents: 'none',
    }}>
      <div style={{ color: 'var(--ink)', fontSize: '9px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {label} PORTFOLIO BREAKDOWN
      </div>
      <div style={{ color: '#666', fontSize: '10px', marginBottom: '6px', fontWeight: 500 }}>
        Avg Portfolio Value: <span style={{ color: 'var(--ink)', fontWeight: 700 }}>${totalValue.toFixed(1)}M</span>
      </div>
      <svg width={svgW} height={svgH}>
        {/* Baseline */}
        <line x1={6} y1={baseline} x2={svgW - 6} y2={baseline} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />

        {allSegs.map((seg, i) => {
          const bx = 10 + i * (barW + barGap);
          const col = segColor(seg);
          const isFailed = seg.type === 'failed';

          if (isFailed) {
            const barH = negH > 0 && maxNegVal > 0 ? (seg.value / maxNegVal) * negH : 0;
            return (
              <g key={i}>
                <rect x={bx} y={baseline} width={barW} height={Math.max(barH, 1)}
                  fill="none" stroke={col} strokeWidth="1" rx="1" strokeDasharray="3,2" />
                <text x={bx + barW / 2} y={baseline + barH + 12} fill={col} fontSize="7" fontFamily={MONO} textAnchor="middle" fontWeight="700">
                  -${seg.value.toFixed(0)}M
                </text>
                <text x={bx + barW / 2} y={baseline + barH + 24} fill="#999" fontSize="7" fontFamily={MONO} textAnchor="middle">
                  {seg.label}
                </text>
                <text x={bx + barW / 2} y={baseline + barH + 36} fill="#999" fontSize="6" fontFamily={MONO} textAnchor="middle">
                  {seg.count.toFixed(1)} cos
                </text>
              </g>
            );
          }

          const barH = maxPosVal > 0 ? (seg.value / maxPosVal) * posH : 0;
          const barY = baseline - barH;
          return (
            <g key={i}>
              <rect x={bx} y={barY} width={barW} height={Math.max(barH, 1)}
                fill={col} stroke={col} strokeWidth="1" rx="1"
                opacity={seg.type === 'alive' ? 0.7 : 1} />
              <text x={bx + barW / 2} y={barY - 3} fill={col} fontSize="7" fontFamily={MONO} textAnchor="middle" fontWeight="700">
                ${seg.value.toFixed(0)}M
              </text>
              <text x={bx + barW / 2} y={baseline + 12} fill="#999" fontSize="7" fontFamily={MONO} textAnchor="middle">
                {seg.label.replace('Series ', 'S')}
              </text>
              <text x={bx + barW / 2} y={baseline + 24} fill="#999" fontSize="6" fontFamily={MONO} textAnchor="middle">
                {seg.count.toFixed(1)} cos
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ─── Histogram (single strategy with percentile lines) ───────────
function computePercentile(distribution, p) {
  if (!distribution || distribution.length === 0) return null;
  const sorted = [...distribution].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

const HIST_PERCENTILES = [
  { p: 0.25, label: 'P25', color: '#999', dash: '4,3' },
  { p: 0.50, label: 'MEDIAN', color: '#000000', dash: '' },
  { p: 0.75, label: 'P75', color: '#16a34a', dash: '4,3' },
  { p: 0.90, label: 'P90', color: '#2563eb', dash: '4,3' },
];

const Histogram = ({ result, color }) => {
  const distribution = result?.moic_distribution;
  const binBreakdowns = result?.results?.bin_breakdowns;
  const { bins, labels } = buildHistogram(distribution, 24);
  const hasData = bins.length > 0;
  const barColor = color?.main || '#2563eb';
  const [tooltip, setTooltip] = useState(null);
  const [hoveredBin, setHoveredBin] = useState(null);

  const CAP = 10;
  const NUM_BINS = 24;
  const binWidth = CAP / NUM_BINS;

  // Compute percentile positions as fraction across the histogram (0..1)
  const percentileLines = hasData ? HIST_PERCENTILES.map((hp) => {
    const val = computePercentile(distribution, hp.p);
    if (val == null) return null;
    const frac = Math.min(val / CAP, 1);
    return { ...hp, val, frac };
  }).filter(Boolean) : [];

  const handleBarEnter = (e, binIndex) => {
    setHoveredBin(binIndex);
    const bd = binBreakdowns?.[binIndex];
    if (!bd) return;
    const lo = (binIndex * binWidth).toFixed(1);
    const hi = ((binIndex + 1) * binWidth).toFixed(1);
    setTooltip({ breakdown: bd, label: `${lo}x – ${hi}x`, x: e.clientX, y: e.clientY });
  };

  const handleBarLeave = () => {
    setHoveredBin(null);
    setTooltip(null);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {!hasData ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '13px', color: '#999' }}>
          RUN SIMULATION TO VIEW DISTRIBUTION
        </div>
      ) : (
        <>
          {/* Y-axis labels */}
          <div style={{ position: 'absolute', top: '28px', left: '0', bottom: '24px', width: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', padding: '4px 2px', pointerEvents: 'none', zIndex: 3 }}>
            <span style={{ fontFamily: MONO, fontSize: '8px', color: '#bbb' }}>MAX</span>
            <span style={{ fontFamily: MONO, fontSize: '8px', color: '#bbb' }}>0</span>
          </div>

          {/* Chart area */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', padding: '28px 24px 0 28px', gap: '2px', position: 'relative' }}>
            {bins.map((height, i) => (
              <div key={i} style={{
                flex: 1, height: `${Math.max(height, 1)}%`, background: barColor,
                opacity: hoveredBin === i ? 1 : 0.7,
                borderRadius: '1px 1px 0 0', minHeight: '1px', transition: 'height 0.3s ease, opacity 0.15s ease',
                position: 'relative', zIndex: 1, cursor: binBreakdowns?.[i] ? 'pointer' : 'default',
              }}
                onMouseEnter={(e) => handleBarEnter(e, i)}
                onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={handleBarLeave}
              />
            ))}

            {/* Percentile vertical lines (no hover — just visual markers) */}
            {percentileLines.map((pl) => (
              <div key={pl.label} style={{
                position: 'absolute',
                left: `${pl.frac * 100}%`,
                top: 0, bottom: 0,
                zIndex: 2, pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  borderLeft: `2px ${pl.dash ? 'dashed' : 'solid'} ${pl.color}`,
                }} />
                <div style={{
                  position: 'absolute', top: '-2px', left: '4px',
                  fontFamily: MONO, fontSize: '9px', fontWeight: 600,
                  color: pl.color, whiteSpace: 'nowrap',
                  background: 'rgba(255,255,255,0.85)', padding: '1px 4px',
                }}>
                  {pl.label} {pl.val.toFixed(2)}x
                </div>
              </div>
            ))}
          </div>

          {/* X-axis labels */}
          <div style={{ fontFamily: MONO, fontSize: '10px', display: 'flex', justifyContent: 'space-between', padding: '6px 24px 4px 28px', borderTop: '1px solid var(--trace)', color: '#999' }}>
            {labels.map((l, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{l}</span>)}
          </div>

          {/* Percentile legend */}
          <div style={{ display: 'flex', gap: '16px', padding: '2px 28px 8px', flexWrap: 'wrap' }}>
            {HIST_PERCENTILES.map((hp) => (
              <div key={hp.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '16px', height: '0', borderTop: `2px ${hp.dash ? 'dashed' : 'solid'} ${hp.color}` }} />
                <span style={{ fontFamily: MONO, fontSize: '9px', color: hp.color, fontWeight: 600 }}>{hp.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tooltip */}
      {tooltip && <BreakdownTooltip breakdown={tooltip.breakdown} label={tooltip.label} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
};

// ─── Comparison Dot Plot ──────────────────────────────────────────
const PERCENTILE_KEYS = [
  { key: 'p25_moic', label: 'P25', color: null, filled: false },
  { key: 'median_moic', label: 'P50', color: '#999', filled: true },
  { key: 'p75_moic', label: 'P75', color: '#16a34a', filled: true },
  { key: 'p90_moic', label: 'P90', color: '#2563eb', filled: true },
  { key: 'p95_moic', label: 'P95', color: '#000000', filled: false },
];

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function generateTicks(maxVal) {
  const nice = niceMax(maxVal);
  const step = nice / 5;
  const ticks = [];
  for (let v = 0; v <= nice; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, axisMax: nice };
}

const PERCENTILE_TO_BREAKDOWN = {
  p25_moic: 'p25', median_moic: 'p50', p75_moic: 'p75', p90_moic: 'p90', p95_moic: 'p95',
};

const ComparisonDotPlot = ({ strategies }) => {
  const [tooltip, setTooltip] = useState(null);

  const stageAbbrevs = { 'Pre-seed': 'PS', 'Seed': 'S', 'Series A': 'A', 'Series B': 'B' };

  const withResults = strategies
    .map((s, i) => {
      if (!s.results) return null;
      const r = s.results;
      const p95 = computeP95(r.moic_distribution);
      const activeStages = ENTRY_STAGES.filter((st) => (s.config.stage_allocations?.[st]?.pct || 0) > 0);
      const ci = s._colorIndex != null ? s._colorIndex : i;
      return {
        id: s.id, name: s.name, code: s.code,
        color: STRATEGY_COLORS[ci % STRATEGY_COLORS.length],
        p25: r.results.p25_moic, p50: r.results.median_moic,
        p75: r.results.p75_moic, p90: r.results.p90_moic,
        p95: p95 != null ? p95 : r.results.p90_moic,
        breakdown: r.results.portfolio_breakdown,
        fundSize: `$${s.config.fund_size_m || 0}M`,
        stages: activeStages.map((st) => stageAbbrevs[st] || st).join(', ') || '—',
        entryOwn: r.results.avg_entry_ownership != null ? `${r.results.avg_entry_ownership.toFixed(1)}%` : '—',
        portfolioSize: r.results.avg_total_companies != null ? `${r.results.avg_total_companies.toFixed(0)}` : '—',
      };
    })
    .filter(Boolean);

  const hasData = withResults.length > 0;
  const allMax = hasData ? Math.max(...withResults.map((d) => d.p95)) : 10;
  const { ticks, axisMax } = generateTicks(allMax * 1.1);

  const VW = 700;
  const VH = 500;
  const LEFT_PAD = 100;
  const RIGHT_PAD = 30;
  const TOP_PAD = 40;
  const BOTTOM_LABEL = 100;
  const LEGEND_H = 24;
  const chartTop = TOP_PAD + LEGEND_H;
  const chartBottom = VH - BOTTOM_LABEL;
  const chartH = chartBottom - chartTop;
  const colWidth = withResults.length > 0 ? (VW - LEFT_PAD - RIGHT_PAD) / withResults.length : VW;
  const toY = (val) => chartBottom - (chartH * val) / axisMax;

  const handleDotEnter = (e, strat, pKey) => {
    const bKey = PERCENTILE_TO_BREAKDOWN[pKey];
    const bd = strat.breakdown?.[bKey];
    if (!bd) return;
    const pLabel = PERCENTILE_KEYS.find((pk) => pk.key === pKey)?.label || pKey;
    setTooltip({ breakdown: bd, label: `${strat.name} ${pLabel}`, x: e.clientX, y: e.clientY });
  };

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {!hasData ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '13px', color: '#999' }}>
          RUN SIMULATIONS IN STRATEGY ENTRY TO COMPARE
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', flex: 1, minHeight: 0 }}>
            {/* Y-axis grid */}
            {ticks.map((tick) => {
              const y = toY(tick);
              return (
                <g key={tick}>
                  <line x1={LEFT_PAD} y1={y} x2={VW - RIGHT_PAD} y2={y} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                  <text x={LEFT_PAD - 8} y={y + 3} fill="#999" fontFamily={MONO} fontSize="9" textAnchor="end">{tick}x</text>
                </g>
              );
            })}

            {/* Percentile legend */}
            <g>
              {PERCENTILE_KEYS.map((p, i) => {
                const lx = LEFT_PAD + i * 60;
                const isMedian = p.key === 'median_moic';
                const dotColor = p.color || '#999';
                return (
                  <g key={p.key}>
                    <circle cx={lx} cy={TOP_PAD + 6} r={3.5}
                      fill={p.filled ? dotColor : 'none'} stroke={dotColor} strokeWidth={p.filled ? 0 : 1.5} />
                    <text x={lx + 10} y={TOP_PAD + 10} fill={p.color || '#999'} fontFamily={MONO} fontSize="9">{p.label}</text>
                  </g>
                );
              })}
            </g>

            {/* Strategy columns */}
            {withResults.map((strat, si) => {
              const cx = LEFT_PAD + si * colWidth + colWidth / 2;
              const c = strat.color;
              const vals = { p25_moic: strat.p25, median_moic: strat.p50, p75_moic: strat.p75, p90_moic: strat.p90, p95_moic: strat.p95 };

              return (
                <g key={strat.id}>
                  {si > 0 && <line x1={LEFT_PAD + si * colWidth} y1={chartTop} x2={LEFT_PAD + si * colWidth} y2={chartBottom} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />}

                  {/* Name label */}
                  <text x={cx} y={chartBottom + 18} fill={c.main} fontFamily={MONO} fontSize="11" fontWeight="700" textAnchor="middle">
                    {strat.name}
                  </text>

                  {/* Whisker P25→P95 */}
                  <line x1={cx} y1={toY(strat.p95)} x2={cx} y2={toY(strat.p25)} stroke={c.dim} strokeWidth="1.5" />

                  {/* Box P75→P90 */}
                  <rect x={cx - 14} y={toY(strat.p90)} width={28}
                    height={Math.max(toY(strat.p75) - toY(strat.p90), 1)}
                    fill={c.bg} stroke={c.dim} strokeWidth="1" rx="2" />

                  {/* Dots with hover zones */}
                  {PERCENTILE_KEYS.map((p) => {
                    const val = vals[p.key];
                    const y = toY(val);
                    const isMedian = p.key === 'median_moic';
                    const dotColor = p.color || c.dim;
                    return (
                      <g key={p.key}>
                        <circle cx={cx} cy={y} r={4}
                          fill={p.filled ? dotColor : 'var(--paper)'} stroke={dotColor} strokeWidth={p.filled ? 0 : 1.5} />
                        <text x={cx + 10} y={y + 3} fill={dotColor} fontFamily={MONO} fontSize="8"
                          fontWeight={p.filled ? '700' : '400'} textAnchor="start">
                          {val.toFixed(2)}x
                        </text>
                        {/* Invisible larger hit area for hover */}
                        <circle cx={cx} cy={y} r={12} fill="transparent" style={{ cursor: 'pointer' }}
                          onMouseEnter={(e) => handleDotEnter(e, strat, p.key)}
                          onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Strategy Details — rendered in SVG for perfect alignment */}
            {(() => {
              const rows = [
                { label: 'Fund Size', get: (s) => s.fundSize },
                { label: 'Stages', get: (s) => s.stages },
                { label: 'Entry Ownership', get: (s) => s.entryOwn },
                { label: '# of Portcos', get: (s) => s.portfolioSize },
              ];
              const baseY = chartBottom + 32;
              const lineH = 13;
              return (
                <g>
                  {/* Section label aligned with strategy names */}
                  <text x={LEFT_PAD - 6} y={chartBottom + 18} fill="#999" fontFamily={MONO} fontSize="8" textAnchor="end">MOIC Percentiles</text>
                  {rows.map((row, ri) => (
                    <g key={row.label}>
                      <text x={LEFT_PAD - 6} y={baseY + ri * lineH} fill="#999" fontFamily={MONO} fontSize="8" textAnchor="end">{row.label}</text>
                      {withResults.map((strat, si) => {
                        const cx = LEFT_PAD + si * colWidth + colWidth / 2;
                        return (
                          <text key={strat.id} x={cx} y={baseY + ri * lineH} fill="#000" fontFamily={MONO} fontSize="8.5" fontWeight="400" textAnchor="middle">
                            {row.get(strat)}
                          </text>
                        );
                      })}
                    </g>
                  ))}
                </g>
              );
            })()}
          </svg>

          {/* Tooltip */}
          {tooltip && <BreakdownTooltip breakdown={tooltip.breakdown} label={tooltip.label} x={tooltip.x} y={tooltip.y} />}
        </>
      )}
    </div>
  );
};

// ─── Key Metrics Comparison Table ─────────────────────────────────
const ComparisonMetrics = ({ strategies }) => {
  const withResults = strategies
    .map((s, i) => {
      if (!s.results) return null;
      const r = s.results;
      const p95 = computeP95(r.moic_distribution);
      const p95_tvpi = computeP95(r.tvpi_distribution);
      const cfg = s.config || {};
      const committed = cfg.fund_size_m || 0;
      const feePct = (cfg.management_fee_pct ?? 2) / 100;
      const fees = committed * feePct * 10;
      const recycled = committed * ((cfg.recycled_capital_pct ?? 20) / 100);
      const ci = s._colorIndex != null ? s._colorIndex : i;
      return {
        name: s.name,
        results: {
          ...r.results,
          p95_moic: p95 != null ? p95 : r.results.p90_moic,
          p95_tvpi: p95_tvpi != null ? p95_tvpi : r.results.p90_tvpi,
          total_fees: fees,
          recycled_capital: recycled,
        },
        color: STRATEGY_COLORS[ci % STRATEGY_COLORS.length],
      };
    })
    .filter(Boolean);

  if (withResults.length === 0) return null;

  const fmt = (v, decimals = 2) => v != null ? v.toFixed(decimals) : '—';

  const rows = [
    { key: '_section_moic', section: 'MOIC' },
    { key: 'p95_moic', label: 'P95', suffix: 'x', decimals: 1 },
    { key: 'p90_moic', label: 'P90', suffix: 'x', decimals: 1 },
    { key: 'p75_moic', label: 'P75', suffix: 'x', decimals: 1 },
    { key: 'median_moic', label: 'P50', suffix: 'x', decimals: 1 },
    { key: 'p25_moic', label: 'P25', suffix: 'x', decimals: 1 },
    { key: '_section_capital', section: 'Capital' },
    { key: 'committed_capital', label: 'Committed Capital', suffix: 'M', prefix: '$', decimals: 0 },
    { key: 'total_fees', label: 'Fees', suffix: 'M', prefix: '$', decimals: 0 },
    { key: 'recycled_capital', label: 'Recycled Capital', suffix: 'M', prefix: '$', decimals: 0 },
    { key: 'avg_primary_invested', label: 'Primary Capital', suffix: 'M', prefix: '$', decimals: 0 },
    { key: 'avg_follow_on_invested', label: 'Follow-On Capital', suffix: 'M', prefix: '$', decimals: 0 },
    { key: '_section_portfolio', section: 'Portfolio' },
    { key: 'avg_total_companies', label: 'Portfolio Size', suffix: '', decimals: 0 },
    { key: 'avg_entry_ownership', label: 'Avg Ownership at Entry', suffix: '%', decimals: 1 },
  ];

  return (
    <div style={{ padding: '0 24px 16px', overflowY: 'auto', flex: 1 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 0', borderBottom: '1px solid var(--ink)', fontSize: '10px', fontWeight: 600, color: '#666' }}>METRIC</th>
            {withResults.map((sim, i) => (
              <th key={i} style={{ textAlign: 'right', padding: '8px 0', borderBottom: `2px solid ${sim.color.main}`, color: sim.color.main, fontWeight: 700, fontSize: '10px' }}>
                {sim.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            row.section ? (
              <tr key={row.key}>
                <td colSpan={1 + withResults.length} style={{ padding: '10px 0 4px', fontSize: '10px', fontWeight: 600, color: '#666', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--ink)' }}>
                  {row.section}
                </td>
              </tr>
            ) : (
              <tr key={row.key}>
                <td style={{ padding: '4px 0', borderBottom: '1px solid var(--trace)', color: 'var(--ink)' }}>{row.label}</td>
                {withResults.map((sim, si) => (
                  <td key={si} style={{ padding: '4px 0', borderBottom: '1px solid var(--trace)', textAlign: 'right', color: sim.color.main }}>
                    {row.prefix || ''}{fmt(sim.results[row.key], row.decimals != null ? row.decimals : 2)}{row.suffix}
                  </td>
                ))}
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────
const App = () => {
  const [activeTab, setActiveTab] = useState('entry'); // 'entry' | 'comparison'

  // ── Working config (the one being edited) ──
  const [config, setConfig] = useState(() => deepCloneConfig(DEFAULT_CONFIG));
  const [strategyName, setStrategyName] = useState('NEW STRATEGY');

  // ── Global State ──
  const [marketScenario, setMarketScenario] = useState(() => {
    try { const g = JSON.parse(localStorage.getItem('monaco_globals')); return g?.marketScenario || 'MARKET'; } catch (e) { return 'MARKET'; }
  });
  const [numIterations, setNumIterations] = useState(() => {
    try { const g = JSON.parse(localStorage.getItem('monaco_globals')); return g?.numIterations || 5000; } catch (e) { return 5000; }
  });

  // ── Simulation state ──
  const [currentResult, setCurrentResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resultsStale, setResultsStale] = useState(false);

  // ── Saved Strategies (with results) ──
  const [savedStrategies, setSavedStrategies] = useState(loadSavedStrategies);
  const [activeStrategyId, setActiveStrategyId] = useState(null);
  const [comparisonSelected, setComparisonSelected] = useState(null); // null = all selected

  // ── Inject Styles ──
  useEffect(() => {
    const linkFont = document.createElement('link');
    linkFont.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    linkFont.rel = 'stylesheet';
    document.head.appendChild(linkFont);

    const style = document.createElement('style');
    style.textContent = `
      :root { --ink: #000000; --paper: #ffffff; --trace: rgba(0,0,0,0.1); --grid: rgba(0,0,0,0.15); --hairline: 1px; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root { height: 100%; overflow: hidden; }
      body { background-color: var(--paper); color: var(--ink); font-family: 'Barlow Condensed', sans-serif; font-size: 14px; letter-spacing: 0.02em; -webkit-font-smoothing: antialiased; }
      #root { display: flex; flex-direction: column; }

      h1, h2, h3, .label, .input-label { text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin: 0; }
      .mono { font-family: 'JetBrains Mono', monospace; font-size: 0.9em; }

      .panel { border-right: var(--hairline) solid var(--ink); display: flex; flex-direction: column; position: relative; overflow: hidden; }
      .panel:last-child { border-right: none; }
      .panel-header { background-color: var(--ink); color: var(--paper); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
      .panel-header h2 { font-size: 15px; margin: 0; }

      .panel-content {
        padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 24px;
        background-image: linear-gradient(var(--trace) 1px, transparent 1px), linear-gradient(90deg, var(--trace) 1px, transparent 1px);
        background-size: 40px 40px; background-position: -1px -1px;
      }

      .input-group { display: flex; flex-direction: column; gap: 8px; }
      .input-label { font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; }
      .input-field { background: var(--paper); border: var(--hairline) solid var(--ink); padding: 10px 12px; font-family: 'JetBrains Mono', monospace; font-size: 14px; color: var(--ink); outline: none; transition: all 0.2s; border-radius: 0; }
      .input-field:focus { box-shadow: 4px 4px 0 var(--ink); transform: translate(-1px, -1px); }
      .input-field.compact { padding: 4px 6px; font-size: 12px; }

      .slider-container { display: flex; flex-direction: column; gap: 10px; }
      .slider-header { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
      .range-wrapper { position: relative; height: 20px; display: flex; align-items: center; }
      input[type=range] { -webkit-appearance: none; width: 100%; background: transparent; }
      input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border: 2px solid var(--ink); background: var(--paper); border-radius: 50%; cursor: pointer; margin-top: -7px; position: relative; z-index: 2; }
      input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 2px; background: transparent; border-bottom: 1px dashed var(--ink); }
      input[type=range]::-moz-range-thumb { height: 16px; width: 16px; border: 2px solid var(--ink); background: var(--paper); border-radius: 50%; cursor: pointer; }

      .strategy-card { border: var(--hairline) solid var(--ink); background: var(--paper); padding: 16px; cursor: pointer; transition: box-shadow 0.15s, border-width 0.15s; }
      .strategy-card:hover { box-shadow: 3px 3px 0 var(--ink); }
      .strategy-card.active { box-shadow: 6px 6px 0 var(--ink); border-width: 2px; }
      .strategy-card-header { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid var(--trace); padding-bottom: 8px; }
      .metric-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
      .card-delete { font-size: 20px; line-height: 1; opacity: 0.4; cursor: pointer; padding: 2px 6px; }
      .card-delete:hover { opacity: 1; }

      .section-divider { height: 1px; background: var(--ink); margin: 4px 0; }

      .btn { background: var(--ink); color: var(--paper); border: none; padding: 12px 24px; font-family: 'Barlow Condensed', sans-serif; text-transform: uppercase; font-weight: 600; letter-spacing: 0.1em; cursor: pointer; width: 100%; display: flex; justify-content: center; align-items: center; gap: 8px; font-size: 14px; transition: opacity 0.15s; }
      .btn:hover { opacity: 0.85; }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn.secondary { background: transparent; color: var(--ink); border: 1px solid var(--ink); }
      .btn.secondary:hover { background: rgba(0,0,0,0.04); }

      .stats-overlay { border-top: 1px solid var(--ink); display: grid; flex-shrink: 0; }
      .stat-box { border-right: 1px solid var(--trace); padding: 10px 12px; display: flex; flex-direction: column; justify-content: center; }
      .stat-box:last-child { border-right: none; }
      .stat-value { font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 500; }
      .stat-label { font-size: 10px; color: #666; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.05em; }

      .scenario-btn-group { display: flex; gap: 0; }
      .scenario-btn { flex: 1; padding: 8px 12px; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; border: 1px solid var(--ink); transition: all 0.15s; background: transparent; color: var(--ink); }
      .scenario-btn:not(:last-child) { border-right: none; }
      .scenario-btn.active { background: var(--ink); color: var(--paper); }

      .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 12px; font-family: 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: 0.03em; color: #666; }
      .checkbox-row input[type=checkbox] { accent-color: var(--ink); width: 14px; height: 14px; cursor: pointer; }

      .deployed-calc { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #666; padding: 8px 0; border-top: 1px dashed var(--trace); }
      .deployed-calc strong { color: var(--ink); }

      .error-bar { padding: 10px 20px; background: #fef2f2; border-bottom: 1px solid #fca5a5; display: flex; align-items: center; gap: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; flex-shrink: 0; }

      .top-tabs { display: flex; border-bottom: 2px solid var(--ink); flex-shrink: 0; }
      .top-tab { padding: 12px 32px; font-family: 'Barlow Condensed', sans-serif; font-size: 15px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; border: none; background: transparent; color: #999; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
      .top-tab.active { color: var(--ink); border-bottom-color: var(--ink); }
      .top-tab:hover { color: var(--ink); }

      .panel-content::-webkit-scrollbar { width: 4px; }
      .panel-content::-webkit-scrollbar-track { background: transparent; }
      .panel-content::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 2px; }

      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(linkFont); document.head.removeChild(style); };
  }, []);

  // ── Persist ──
  useEffect(() => { localStorage.setItem('monaco_globals', JSON.stringify({ marketScenario, numIterations })); }, [marketScenario, numIterations]);
  useEffect(() => { persistStrategies(savedStrategies); }, [savedStrategies]);

  // ── Config helpers ──
  const setField = useCallback((field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    if (currentResult) setResultsStale(true);
  }, [currentResult]);

  // ── Load a saved strategy into the editor ──
  const loadStrategy = useCallback((strategy) => {
    setActiveStrategyId(strategy.id);
    setConfig(deepCloneConfig(strategy.config));
    setStrategyName(strategy.name);
    setCurrentResult(strategy.results || null);
    setResultsStale(strategy.stale || false);
  }, []);

  // ── Auto-save: sync config/name/results/stale to active strategy ──
  useEffect(() => {
    if (activeStrategyId == null) return;
    setSavedStrategies((prev) => prev.map((s) =>
      s.id === activeStrategyId
        ? { ...s, name: strategyName.trim().toUpperCase() || s.name, config: deepCloneConfig(config), results: currentResult, stale: resultsStale }
        : s
    ));
  }, [config, strategyName, currentResult, activeStrategyId, resultsStale]);

  // ── Create new strategy (clones current config) ──
  const createNewStrategy = useCallback(() => {
    if (savedStrategies.length >= MAX_STRATEGIES) return;
    const code = strategyCode(savedStrategies.length);
    const newStrategy = {
      id: nextStrategyId++,
      name: `STRATEGY ${code}`,
      code,
      config: deepCloneConfig(config),
      results: null,
      stale: false,
    };
    setSavedStrategies((prev) => [...prev, newStrategy]);
    setActiveStrategyId(newStrategy.id);
    setStrategyName(newStrategy.name);
    setCurrentResult(null);
    setResultsStale(false);
  }, [config, savedStrategies]);

  const deleteStrategy = useCallback((id) => {
    setSavedStrategies((prev) => prev.filter((s) => s.id !== id));
    if (activeStrategyId === id) {
      setActiveStrategyId(null);
      setCurrentResult(null);
      setResultsStale(false);
    }
  }, [activeStrategyId]);

  // ── Run Simulation (single strategy) ──
  const runSimulation = useCallback(async () => {
    const total = ENTRY_STAGES.reduce((sum, s) => sum + (config.stage_allocations?.[s]?.pct || 0), 0);
    if (total !== 100) return;
    setLoading(true);
    setError(null);
    try {
      const cfg = buildSimPayload(config, marketScenario, numIterations);
      const response = await fetch(`${API_BASE}/api/simulate/multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulations: [{ name: strategyName, config: cfg }] }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Server error ${response.status}`);
      }
      const data = await response.json();
      const result = data.simulations[0];
      setCurrentResult(result);
      setResultsStale(false);
    } catch (err) {
      setError(err.message || 'Failed to run simulation');
    } finally {
      setLoading(false);
    }
  }, [config, marketScenario, numIterations, strategyName]);

  // ── Run All Simulations (comparison page) ──
  const COMPARISON_ITERATIONS = 7000;
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const runAllSimulations = useCallback(async () => {
    const strategiesToRun = savedStrategies.filter((s) => s.config);
    if (strategiesToRun.length === 0) return;
    setComparisonLoading(true);
    setError(null);
    try {
      const sims = strategiesToRun.map((s) => ({
        name: s.name,
        config: buildSimPayload(s.config, marketScenario, COMPARISON_ITERATIONS),
      }));
      const response = await fetch(`${API_BASE}/api/simulate/multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulations: sims }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Server error ${response.status}`);
      }
      const data = await response.json();
      setSavedStrategies((prev) => prev.map((s) => {
        const idx = strategiesToRun.findIndex((st) => st.id === s.id);
        if (idx === -1) return s;
        return { ...s, results: data.simulations[idx], stale: false };
      }));
      // Update current result if active strategy was re-run
      if (activeStrategyId != null) {
        const idx = strategiesToRun.findIndex((st) => st.id === activeStrategyId);
        if (idx !== -1) {
          setCurrentResult(data.simulations[idx]);
          setResultsStale(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to run simulations');
    } finally {
      setComparisonLoading(false);
    }
  }, [savedStrategies, marketScenario, activeStrategyId]);

  // ── Deployed capital calc ──
  const fs = config.fund_size_m || 0;
  const fees = fs * ((config.management_fee_pct ?? 2) / 100) * 10;
  const recycled = fs * ((config.recycled_capital_pct ?? 20) / 100);
  const deployed = fs - fees + recycled;
  const allocationTotal = ENTRY_STAGES.reduce((sum, s) => sum + (config.stage_allocations?.[s]?.pct || 0), 0);
  const allocationValid = allocationTotal === 100;

  // ── Stats for current result ──
  const r = currentResult?.results;
  const statsItems = [
    { value: r ? `${r.median_tvpi?.toFixed(2) || '—'}x` : '—', label: 'TVPI (Median)' },
    { value: r ? `$${r.fund_size?.toFixed(0) || '—'}M` : '—', label: 'Fund Size' },
    { value: r ? `${r.median_moic?.toFixed(2) || '—'}x` : '—', label: 'MOIC (Median)' },
    { value: r ? `$${(r.fund_size - fees)?.toFixed(0) || '—'}M` : '—', label: 'Invested Capital' },
    { value: r ? `${r.avg_total_companies?.toFixed(0) || '—'}` : '—', label: 'Portfolio Size' },
    { value: r ? `${r.avg_entry_ownership?.toFixed(1) || '—'}%` : '—', label: 'Avg Entry Own.' },
  ];

  const activeColor = activeStrategyId != null
    ? STRATEGY_COLORS[savedStrategies.findIndex((s) => s.id === activeStrategyId) % STRATEGY_COLORS.length]
    : STRATEGY_COLORS[0];

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top Tabs */}
      <div className="top-tabs">
        <button className={`top-tab ${activeTab === 'entry' ? 'active' : ''}`} onClick={() => {
          setActiveTab('entry');
          if (activeStrategyId == null && savedStrategies.length > 0) loadStrategy(savedStrategies[0]);
        }}>
          Strategy Entry
        </button>
        <button className={`top-tab ${activeTab === 'comparison' ? 'active' : ''}`} onClick={() => setActiveTab('comparison')}>
          Strategy Comparison
        </button>
        <div style={{ flex: 1 }} />
        <a href="#/markets" style={{
          fontFamily: MONO, fontSize: '11px', color: '#999', textDecoration: 'none',
          padding: '8px 20px', letterSpacing: '0.03em', alignSelf: 'center',
          transition: 'color 0.15s',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
        >View / Edit Market Data</a>
      </div>

      {error && (
        <div className="error-bar">
          <span style={{ color: '#dc2626', fontWeight: 600 }}>ERROR</span>
          <span style={{ flex: 1, color: '#666' }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#999' }}>×</button>
        </div>
      )}

      {/* ═══════════ STRATEGY ENTRY TAB ═══════════ */}
      {activeTab === 'entry' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 320px 1fr', flex: 1, overflow: 'hidden' }}>
          {/* Panel 1: Strategy List */}
          <aside className="panel">
            <div className="panel-header">
              <h2>1. Strategy</h2>
              <span className="mono">SELECT</span>
            </div>
            <div className="panel-content">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="input-label" style={{ fontSize: '12px', color: '#666' }}>SAVED MODELS</div>

                {savedStrategies.length === 0 && (
                  <div style={{ fontFamily: MONO, fontSize: '11px', color: '#999', padding: '8px 0' }}>
                    No strategies yet — click below to create one
                  </div>
                )}

                {savedStrategies.map((strat) => {
                  const summary = summarizeConfig(activeStrategyId === strat.id ? config : strat.config);
                  return (
                    <StrategyCard
                      key={strat.id}
                      name={activeStrategyId === strat.id ? strategyName : strat.name}
                      code={strat.code}
                      fundSize={summary.fundSize}
                      checkSize={summary.checkSize}
                      reserves={summary.reserves}
                      stages={summary.stages}
                      isActive={activeStrategyId === strat.id}
                      hasResults={!!strat.results}
                      isStale={activeStrategyId === strat.id ? resultsStale : (strat.stale || false)}
                      onClick={() => { if (activeStrategyId !== strat.id) loadStrategy(strat); }}
                      onDelete={() => deleteStrategy(strat.id)}
                      onNameChange={activeStrategyId === strat.id ? (v) => setStrategyName(v) : undefined}
                    />
                  );
                })}
              </div>

              <div style={{ marginTop: 'auto' }}>
                <button className="btn" onClick={createNewStrategy}
                  disabled={savedStrategies.length >= MAX_STRATEGIES}
                  style={savedStrategies.length >= MAX_STRATEGIES ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                >
                  {savedStrategies.length >= MAX_STRATEGIES ? `MAX ${MAX_STRATEGIES} STRATEGIES` : '+ New Strategy'}
                </button>
              </div>
            </div>
          </aside>

          {/* Panel 2: Variables */}
          <aside className="panel" style={activeStrategyId == null ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
            <div className="panel-header">
              <h2>2. Variables</h2>
              <span className="mono">{activeStrategyId == null ? 'SELECT A STRATEGY' : 'INPUT'}</span>
            </div>
            <div className="panel-content">
              <SliderInput label="FUND SIZE" value={config.fund_size_m} onChange={(v) => setField('fund_size_m', v)} min={0} max={600} step={5} unit="M" />

              <div style={{ display: 'flex', gap: '12px' }}>
                <NumberInput label="MGMT FEE (% / YR)" value={config.management_fee_pct} onChange={(v) => setField('management_fee_pct', v)} min={0} max={10} step={0.5} />
                <NumberInput label="FEE DURATION (YRS)" value={10} onChange={() => {}} disabled />
              </div>

              <SliderInput label="RECYCLED CAPITAL" value={config.recycled_capital_pct} onChange={(v) => setField('recycled_capital_pct', v)} min={0} max={40} step={5} unit="%" />

              <div className="deployed-calc">
                <span style={{ color: 'var(--ink)' }}>${Math.round(fs)}M</span> − <span style={{ color: '#dc2626' }}>${Math.round(fees)}M fees</span> + <span style={{ color: '#16a34a' }}>${Math.round(recycled)}M recycled</span> = <strong>${Math.round(deployed)}M deployed</strong>
              </div>

              <div className="section-divider" style={{ marginTop: '-12px' }} />
              <div className="input-label" style={{ marginTop: '-12px', marginBottom: '-8px' }}>PORTFOLIO CONSTRUCTION</div>

              <SliderInput label="FOLLOW-ON RESERVE" value={config.dry_powder_reserve_for_pro_rata} onChange={(v) => setField('dry_powder_reserve_for_pro_rata', v)} min={0} max={70} step={5} unit="%" />

              <div className="checkbox-row">
                <input type="checkbox" id="reinvest" checked={config.reinvest_unused_reserve !== false} onChange={(e) => setField('reinvest_unused_reserve', e.target.checked)} />
                <label htmlFor="reinvest" style={{ cursor: 'pointer' }}>Re-invest unused reserve</label>
              </div>

              <NumberInput label="PRO-RATA MAX VALUATION ($M)" value={config.pro_rata_max_valuation} onChange={(v) => setField('pro_rata_max_valuation', v)} min={0} max={10000} step={10} />

              <StageAllocationTable stageAllocations={config.stage_allocations} onStageAllocationsChange={(v) => setField('stage_allocations', v)} />

            </div>
          </aside>

          {/* Panel 3: Single Strategy Results */}
          <main className="panel" style={{ overflow: 'hidden' }}>
            <div className="panel-header" style={{ background: 'var(--paper)', color: 'var(--ink)', borderBottom: '1px solid var(--ink)', gap: '10px' }}>
              <h2 style={{ flex: 1 }}>Simulated Performance Distribution</h2>
              <span style={{ fontFamily: MONO, fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Conditions</span>
              <select
                value={marketScenario}
                onChange={(e) => setMarketScenario(e.target.value)}
                style={{ padding: '4px 8px', fontFamily: MONO, fontSize: '11px', border: '1px solid var(--ink)', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="BELOW_MARKET">Bear</option>
                <option value="MARKET">Average</option>
                <option value="ABOVE_MARKET">Bull</option>
              </select>
              <IterationsInput value={numIterations} onChange={setNumIterations} />
              <button
                className="btn"
                onClick={runSimulation}
                disabled={loading || !allocationValid}
                style={{ width: 'auto', padding: '6px 20px', fontSize: '12px', ...(!allocationValid ? { opacity: 0.35 } : {}) }}
              >
                {loading ? 'RUNNING...' : !allocationValid ? `ALLOCATION ≠ 100% (${allocationTotal}%)` : 'RUN SIMULATION'}
              </button>
            </div>

            {loading && (
              <div style={{ padding: '8px 20px', fontFamily: MONO, fontSize: '11px', color: '#999', animation: 'pulse 1.5s infinite', borderBottom: '1px solid var(--trace)' }}>
                COMPUTING...
              </div>
            )}

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
              <Histogram result={currentResult} color={activeColor} />
              <div className="stats-overlay" style={{ gridTemplateColumns: `repeat(${statsItems.length}, 1fr)`, opacity: resultsStale ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                {statsItems.map((s, i) => <StatBox key={i} value={s.value} label={s.label} />)}
              </div>

              {/* Stale results overlay */}
              {resultsStale && (
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10, pointerEvents: 'none',
                }}>
                  <div style={{
                    fontFamily: MONO, fontSize: '12px', color: '#999',
                    textAlign: 'center', lineHeight: '1.8', textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Out of date<br />
                    <span style={{ fontSize: '10px', color: '#bbb' }}>Re-run simulation for latest performance details</span>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* ═══════════ STRATEGY COMPARISON TAB ═══════════ */}
      {activeTab === 'comparison' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {savedStrategies.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontFamily: MONO, fontSize: '14px', color: '#999' }}>NO STRATEGIES CREATED</span>
              <span style={{ fontFamily: MONO, fontSize: '11px', color: '#ccc' }}>Create strategies in the Strategy Entry tab first</span>
            </div>
          ) : (() => {
            const selectedIds = comparisonSelected || savedStrategies.map((s) => s.id);
            const comparisonStrategies = savedStrategies
              .map((s, i) => ({ ...s, _colorIndex: i }))
              .filter((s) => selectedIds.includes(s.id));
            const allSelected = comparisonSelected === null;
            const toggleStrategy = (id) => {
              if (comparisonSelected === null) {
                // Currently all selected — deselect this one
                setComparisonSelected(savedStrategies.map((s) => s.id).filter((sid) => sid !== id));
              } else {
                const isIn = comparisonSelected.includes(id);
                const next = isIn ? comparisonSelected.filter((sid) => sid !== id) : [...comparisonSelected, id];
                // If all are now selected, reset to null
                if (next.length === savedStrategies.length && savedStrategies.every((s) => next.includes(s.id))) {
                  setComparisonSelected(null);
                } else {
                  setComparisonSelected(next);
                }
              }
            };
            return (
            <>
              {/* Strategy selector + controls — single row */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', gap: '8px', borderBottom: '1px solid var(--ink)', flexShrink: 0, overflowX: 'auto' }}>
                {savedStrategies.map((strat, i) => {
                  const summary = summarizeConfig(strat.config);
                  const color = STRATEGY_COLORS[i % STRATEGY_COLORS.length];
                  const isSelected = selectedIds.includes(strat.id);
                  return (
                    <ComparisonCard
                      key={strat.id}
                      name={strat.name}
                      fundSize={summary.fundSize}
                      stages={summary.stages}
                      color={color}
                      isSelected={isSelected}
                      hasResults={!!strat.results}
                      onClick={() => toggleStrategy(strat.id)}
                    />
                  );
                })}
                <button
                  onClick={() => setComparisonSelected(allSelected ? [] : null)}
                  style={{
                    padding: '8px 14px', border: '1px solid var(--ink)', background: allSelected ? 'var(--ink)' : 'transparent',
                    color: allSelected ? 'var(--paper)' : 'var(--ink)', fontFamily: MONO, fontSize: '10px', fontWeight: 600,
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                  }}
                >
                  {allSelected ? 'CLEAR' : 'ALL'}
                </button>
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: MONO, fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Market</span>
                <select
                  value={marketScenario}
                  onChange={(e) => setMarketScenario(e.target.value)}
                  style={{ padding: '4px 8px', fontFamily: MONO, fontSize: '11px', border: '1px solid var(--ink)', background: 'var(--paper)', color: 'var(--ink)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="BELOW_MARKET">Bear</option>
                  <option value="MARKET">Average</option>
                  <option value="ABOVE_MARKET">Bull</option>
                </select>
                <span style={{ fontFamily: MONO, fontSize: '11px', color: '#999', whiteSpace: 'nowrap' }}>N={COMPARISON_ITERATIONS.toLocaleString()}</span>
                <button
                  className="btn"
                  onClick={runAllSimulations}
                  disabled={comparisonLoading}
                  style={{ width: 'auto', padding: '6px 20px', fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  {comparisonLoading ? 'RUNNING...' : 'RUN ALL SIMULATIONS'}
                </button>
              </div>

              {comparisonLoading && (
                <div style={{ padding: '6px 20px', fontFamily: MONO, fontSize: '11px', color: '#999', animation: 'pulse 1.5s infinite', borderBottom: '1px solid var(--trace)' }}>
                  COMPUTING {savedStrategies.length} STRATEGIES...
                </div>
              )}

              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', overflow: 'hidden' }}>
                {/* Dot Plot */}
                <div style={{ borderRight: '1px solid var(--ink)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                  <ComparisonDotPlot strategies={comparisonStrategies} />
                </div>

                {/* Metrics Table */}
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--trace)', fontFamily: MONO, fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    KEY METRICS
                  </div>
                  <ComparisonMetrics strategies={comparisonStrategies} />
                </div>
              </div>
            </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default App;
