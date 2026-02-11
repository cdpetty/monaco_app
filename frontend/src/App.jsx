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
  stage_allocations: [
    { stage: 'Pre-seed', pct: 25, check_size: 1.5 },
    { stage: 'Seed',     pct: 25, check_size: 2.0 },
    { stage: 'Series A', pct: 50, check_size: 5.0 },
  ],
};
const MAX_STRATEGIES = 6;

function migrateConfig(config) {
  // Already in new array format
  if (Array.isArray(config.stage_allocations)) return config;
  // Old object format — convert to array (keep only active rows)
  if (config.stage_allocations && typeof config.stage_allocations === 'object') {
    const rows = [];
    for (const [stage, alloc] of Object.entries(config.stage_allocations)) {
      if (alloc.pct > 0) rows.push({ stage, pct: alloc.pct, check_size: alloc.check_size });
    }
    return { ...config, stage_allocations: rows.length > 0 ? rows : [{ stage: 'Pre-seed', pct: 100, check_size: 1.5 }] };
  }
  // Legacy preseed_pct format
  const { preseed_pct, preseed_check_size, seed_check_size, ...rest } = config;
  const pp = preseed_pct ?? 100;
  const rows = [];
  if (pp > 0) rows.push({ stage: 'Pre-seed', pct: pp, check_size: preseed_check_size ?? 1.5 });
  if (100 - pp > 0) rows.push({ stage: 'Seed', pct: 100 - pp, check_size: seed_check_size ?? 2.0 });
  return { ...rest, stage_allocations: rows.length > 0 ? rows : [{ stage: 'Pre-seed', pct: 100, check_size: 1.5 }] };
}

const STRATEGY_COLORS = [
  { main: '#2563eb', dim: 'rgba(37,99,235,0.4)', bg: 'rgba(37,99,235,0.08)' },
  { main: '#dc2626', dim: 'rgba(220,38,38,0.4)', bg: 'rgba(220,38,38,0.08)' },
  { main: '#16a34a', dim: 'rgba(22,163,74,0.4)', bg: 'rgba(22,163,74,0.08)' },
  { main: '#ca8a04', dim: 'rgba(202,138,4,0.4)', bg: 'rgba(202,138,4,0.08)' },
  { main: '#9333ea', dim: 'rgba(147,51,234,0.4)', bg: 'rgba(147,51,234,0.08)' },
  { main: '#0891b2', dim: 'rgba(8,145,178,0.4)', bg: 'rgba(8,145,178,0.08)' },
];

// ─── Share URL Helpers ────────────────────────────────────────────
function encodeShareData(data) {
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

function decodeShareData(encoded) {
  return JSON.parse(decodeURIComponent(atob(encoded)));
}

function getShareParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('s');
    if (s) return decodeShareData(s);
  } catch (e) {}
  return null;
}

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
  if (!allocs) return [];
  return allocs.map((row) => ({ ...row }));
}

function deepCloneConfig(cfg) {
  return { ...cfg, stage_allocations: deepCloneAllocations(cfg.stage_allocations) };
}

// ─── Saved strategies helpers ─────────────────────────────────────
let nextStrategyId = 1;

const DEFAULT_STRATEGIES = [
  {
    id: 1,
    name: 'LARGE FOLLOW-ON FUND',
    code: 'A',
    config: {
      fund_size_m: 250,
      management_fee_pct: 2,
      fee_duration_years: 10,
      recycled_capital_pct: 20,
      dry_powder_reserve_for_pro_rata: 50,
      reinvest_unused_reserve: true,
      pro_rata_max_valuation: 500,
      stage_allocations: [
        { stage: 'Pre-seed', pct: 50, check_size: 0.75 },
        { stage: 'Seed',     pct: 50, check_size: 0.75 },
      ],
    },
    results: null,
    stale: false,
  },
  {
    id: 2,
    name: 'STANDARD SEED LEAD FUND',
    code: 'B',
    config: {
      fund_size_m: 150,
      management_fee_pct: 2,
      fee_duration_years: 10,
      recycled_capital_pct: 20,
      dry_powder_reserve_for_pro_rata: 30,
      reinvest_unused_reserve: true,
      pro_rata_max_valuation: 500,
      stage_allocations: [
        { stage: 'Pre-seed', pct: 50, check_size: 1.75 },
        { stage: 'Seed',     pct: 50, check_size: 3.5 },
      ],
    },
    results: null,
    stale: false,
  },
  {
    id: 3,
    name: 'SEED & SERIES A LEAD FUND',
    code: 'C',
    config: {
      fund_size_m: 400,
      management_fee_pct: 2,
      fee_duration_years: 10,
      recycled_capital_pct: 20,
      dry_powder_reserve_for_pro_rata: 40,
      reinvest_unused_reserve: true,
      pro_rata_max_valuation: 500,
      stage_allocations: [
        { stage: 'Seed',     pct: 50, check_size: 4.5 },
        { stage: 'Series A', pct: 50, check_size: 10.5 },
      ],
    },
    results: null,
    stale: false,
  },
];

function loadSavedStrategies() {
  // Check for shared URL first
  const shared = getShareParam();
  if (shared && Array.isArray(shared.strategies) && shared.strategies.length > 0) {
    const strategies = shared.strategies.map((s, i) => ({
      id: i + 1,
      name: s.name || `STRATEGY ${strategyCode(i)}`,
      code: strategyCode(i),
      config: migrateConfig(s.config),
      results: null,
      stale: false,
    }));
    nextStrategyId = strategies.length + 1;
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    return strategies;
  }
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
  nextStrategyId = 4;
  return DEFAULT_STRATEGIES.map((s) => ({ ...s }));
}

function persistStrategies(strategies) {
  localStorage.setItem('monaco_saved_strategies', JSON.stringify(strategies));
}

function strategyCode(index) {
  return String.fromCharCode(65 + (index % 26));
}

function summarizeConfig(config) {
  const rows = config.stage_allocations || [];
  const stageAbbrevs = { 'Pre-seed': 'PS', 'Seed': 'S', 'Series A': 'A', 'Series B': 'B' };
  const checks = rows.map((r) => `$${r.check_size}M`);
  const uniqueStages = [...new Set(rows.map((r) => r.stage))];
  const stages = uniqueStages.map((s) => stageAbbrevs[s] || s).join(', ');
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
  // Merge rows with the same stage: sum pct, weighted-average check_size
  const merged = {};
  for (const row of (stage_allocations || [])) {
    if (!merged[row.stage]) merged[row.stage] = { pct: 0, weightedCheck: 0 };
    merged[row.stage].pct += row.pct;
    merged[row.stage].weightedCheck += row.pct * row.check_size;
  }
  for (const [stage, m] of Object.entries(merged)) {
    if (m.pct > 0) {
      const avgCheck = m.weightedCheck / m.pct;
      checkSizes[stage] = avgCheck;
      ownershipPcts[stage] = avgCheck / (valuations[stage] || 1);
      allocationPcts[stage] = m.pct;
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

// ─── Mobile Detection Hook ───────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

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

const ComparisonCard = ({ name, fundSize, stages, color, isSelected, hasResults, onClick, draggable, onDragStart, onDragOver, onDrop, onDragEnd }) => (
  <div onClick={onClick} draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} style={{
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '8px 12px', border: '1px solid var(--ink)', cursor: draggable ? 'grab' : 'pointer',
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
const MAX_ALLOC_ROWS = 8;

const StageAllocationTable = ({ stageAllocations, onStageAllocationsChange }) => {
  const rows = stageAllocations || [];
  const valuations = getStageValuations();
  const totalPct = rows.reduce((sum, r) => sum + (r.pct || 0), 0);

  const updateRow = (index, field, value) => {
    const updated = rows.map((r, i) => (i === index ? { ...r, [field]: value } : { ...r }));
    onStageAllocationsChange(updated);
  };

  const addRow = () => {
    if (rows.length >= MAX_ALLOC_ROWS) return;
    onStageAllocationsChange([...rows.map((r) => ({ ...r })), { stage: ENTRY_STAGES[0], pct: 0, check_size: 1.0 }]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) return;
    onStageAllocationsChange(rows.filter((_, i) => i !== index).map((r) => ({ ...r })));
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
            <th style={{ ...thStyle, width: '20px' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const val = valuations[row.stage] || 1;
            const ownership = ((row.check_size / val) * 100).toFixed(1);
            return (
              <tr key={idx} style={{ borderBottom: '1px solid var(--trace)' }}>
                <td style={{ padding: '3px 0', fontSize: '10px' }}>
                  <select value={row.stage}
                    onChange={(e) => updateRow(idx, 'stage', e.target.value)}
                    className="input-field compact"
                    style={{ width: '100%', padding: '3px 2px', fontSize: '10px', background: 'var(--paper)', cursor: 'pointer' }}>
                    {ENTRY_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={tdStyle}>
                  <input type="number" value={row.pct} min={0} max={100} step={5}
                    onChange={(e) => updateRow(idx, 'pct', Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                    className="input-field compact" style={{ width: '40px', textAlign: 'right', padding: '3px 4px', fontSize: '11px' }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" value={row.check_size} min={0.1} max={50} step={0.25}
                    onChange={(e) => updateRow(idx, 'check_size', parseFloat(e.target.value) || 0.1)}
                    className="input-field compact" style={{ width: '48px', textAlign: 'right', padding: '3px 4px', fontSize: '11px' }} />
                </td>
                <td style={readonlyTd}>{`${ownership}%`}</td>
                <td style={readonlyTd}>{`$${val}`}</td>
                <td style={{ padding: '3px 2px', textAlign: 'center' }}>
                  {rows.length > 1 && (
                    <span onClick={() => removeRow(idx)}
                      style={{ cursor: 'pointer', opacity: 0.4, fontSize: '14px', lineHeight: 1 }}
                      onMouseEnter={(e) => e.target.style.opacity = 1}
                      onMouseLeave={(e) => e.target.style.opacity = 0.4}>
                      &times;
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length < MAX_ALLOC_ROWS && (
        <button onClick={addRow}
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px dashed rgba(34,197,94,0.5)', padding: '6px 8px', cursor: 'pointer',
            fontFamily: MONO, fontSize: '11px', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
          + Add Row
        </button>
      )}
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

// ─── Hero Interactive Portfolios ──────────────────────────────────
const HERO_PORTFOLIOS = [
  { id: 3172, investments: 42, failRate: 64, tvpi: 1.8, failed: 64, acquired: 20 },
  { id: 3173, investments: 38, failRate: 71, tvpi: 3.2, failed: 71, acquired: 16 },
  { id: 3174, investments: 51, failRate: 58, tvpi: 0.9, failed: 58, acquired: 24 },
  { id: 3175, investments: 35, failRate: 60, tvpi: 2.4, failed: 60, acquired: 22 },
  { id: 3176, investments: 44, failRate: 68, tvpi: 1.1, failed: 68, acquired: 18 },
  { id: 3177, investments: 47, failRate: 55, tvpi: 4.7, failed: 55, acquired: 28 },
  { id: 3178, investments: 40, failRate: 72, tvpi: 0.6, failed: 72, acquired: 14 },
];

const HeroPortfolios = () => {
  const [active, setActive] = useState(0);
  const mobile = useIsMobile();
  const labelStyle = { fontFamily: MONO, fontSize: '8px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' };
  const visiblePortfolios = mobile ? HERO_PORTFOLIOS.slice(0, 4) : HERO_PORTFOLIOS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
      {visiblePortfolios.map((p, i) => {
        const isActive = active === i;
        const alive = 100 - p.failed - p.acquired;
        return (
          <div
            key={p.id}
            onMouseEnter={() => setActive(i)}
            style={{
              border: '1px solid var(--ink)', borderBottom: i < HERO_PORTFOLIOS.length - 1 ? 'none' : '1px solid var(--ink)',
              padding: isActive ? '14px 16px' : '8px 16px',
              cursor: 'pointer', transition: 'all 0.2s ease',
              background: isActive ? 'var(--paper)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: isActive ? '10px' : '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: isActive ? 'var(--ink)' : '#999', fontWeight: 600, transition: 'all 0.2s' }}>
                Portfolio #{p.id}
              </span>
              {!isActive && (
                <span style={{ fontFamily: MONO, fontSize: '10px', color: '#ccc' }}>{p.tvpi}x</span>
              )}
            </div>
            {isActive && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                  <div>
                    <div style={labelStyle}>Investments</div>
                    <span style={{ fontFamily: MONO, fontSize: '18px' }}>{p.investments}</span>
                  </div>
                  <div>
                    <div style={labelStyle}>Failure Rate</div>
                    <span style={{ fontFamily: MONO, fontSize: '18px' }}>{p.failRate}%</span>
                  </div>
                  <div>
                    <div style={labelStyle}>TVPI</div>
                    <span style={{ fontFamily: MONO, fontSize: '18px' }}>{p.tvpi}x</span>
                  </div>
                </div>
                <div style={{ width: '100%', height: '3px', background: 'var(--trace)', marginTop: '10px', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, width: `${p.failed}%`, height: '100%', background: '#ccc' }} />
                  <div style={{ position: 'absolute', left: `${p.failed}%`, width: `${p.acquired}%`, height: '100%', background: '#999' }} />
                  <div style={{ position: 'absolute', left: `${p.failed + p.acquired}%`, width: `${alive}%`, height: '100%', background: 'var(--ink)' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '8px', color: '#ccc' }}>FAILED {p.failed}%</span>
                  <span style={{ fontFamily: MONO, fontSize: '8px', color: '#999' }}>ACQUIRED {p.acquired}%</span>
                  <span style={{ fontFamily: MONO, fontSize: '8px', color: 'var(--ink)' }}>ALIVE {alive}%</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── About Page Portfolio Grid ────────────────────────────────────
const ABOUT_PORTFOLIOS = [
  // Column 1
  [
    { id: 4001, tvpi: 2.1 },
    { id: 4002, tvpi: 0.7 },
    { id: 4003, tvpi: 3.8 },
    { id: 4004, tvpi: 1.4 },
  ],
  // Column 2
  [
    { id: 4008, tvpi: 5.2 },
    { id: 4009, tvpi: 1.6 },
    { id: 4010, tvpi: 0.8 },
    { id: 4011, tvpi: 3.4 },
  ],
  // Column 3
  [
    { id: 4015, tvpi: 1.9 },
    { id: 4016, tvpi: 6.1 },
    { id: 4017, tvpi: 0.6 },
    { id: 4018, tvpi: 2.7 },
  ],
];

const AboutPortfolioGrid = () => {
  const [hovered, setHovered] = useState(null); // "col-row"
  const mobile = useIsMobile();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr', gap: '12px' }}>
      {ABOUT_PORTFOLIOS.map((col, ci) => (
        <div key={ci} style={{ display: 'flex', flexDirection: 'column' }}>
          {col.map((p, ri) => {
            const key = `${ci}-${ri}`;
            const isHovered = hovered === key;
            return (
              <div
                key={p.id}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  border: '1px solid var(--ink)',
                  borderBottom: ri < col.length - 1 ? 'none' : '1px solid var(--ink)',
                  padding: '10px 18px',
                  cursor: 'default', transition: 'background 0.15s ease',
                  background: isHovered ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: isHovered ? 'var(--ink)' : '#999', fontWeight: 600, transition: 'color 0.15s' }}>
                    Portfolio #{p.id}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: '11px', color: isHovered ? 'var(--ink)' : '#ccc', transition: 'color 0.15s' }}>{p.tvpi}x</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
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
      const activeStages = [...new Set((s.config.stage_allocations || []).map((r) => r.stage))];
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
                  {/* Section label — left side, vertically centered */}
                  <text x={14} y={(chartTop + chartBottom) / 2} fill="#999" fontFamily={MONO} fontSize="9" textAnchor="middle" transform={`rotate(-90, 14, ${(chartTop + chartBottom) / 2})`}>MOIC PERCENTILES</text>
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
  const mobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'entry' | 'comparison'
  const [entryPanel, setEntryPanel] = useState('strategy'); // 'strategy' | 'variables' | 'results'

  // ── Working config (the one being edited) ──
  const [config, setConfig] = useState(() => deepCloneConfig(DEFAULT_CONFIG));
  const [strategyName, setStrategyName] = useState('NEW STRATEGY');

  // ── Global State ──
  const [marketScenario, setMarketScenario] = useState(() => {
    const shared = getShareParam();
    if (shared?.marketScenario) return shared.marketScenario;
    try { const g = JSON.parse(localStorage.getItem('monaco_globals')); return g?.marketScenario || 'MARKET'; } catch (e) { return 'MARKET'; }
  });
  const [numIterations, setNumIterations] = useState(() => {
    const shared = getShareParam();
    if (shared?.numIterations) return shared.numIterations;
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
  const dragItem = React.useRef(null);
  const dragOverItem = React.useRef(null);
  const didDrag = React.useRef(false);

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

      @media (max-width: 767px) {
        .top-tabs { flex-wrap: wrap; }
        .top-tab { padding: 10px 14px; font-size: 13px; }
        .panel-content { padding: 16px; gap: 16px; }
        .panel-header { padding: 10px 16px; }
        .stats-overlay { grid-template-columns: repeat(3, 1fr) !important; }
        .btn { padding: 10px 16px; font-size: 13px; }
        .entry-sub-tabs { display: flex; border-bottom: 2px solid var(--ink); flex-shrink: 0; }
        .entry-sub-tab { flex: 1; padding: 10px 12px; font-family: 'Barlow Condensed', sans-serif; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; border: none; background: transparent; color: #999; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.15s; text-align: center; }
        .entry-sub-tab.active { color: var(--ink); border-bottom-color: var(--ink); }
      }
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
    const total = (config.stage_allocations || []).reduce((sum, r) => sum + (r.pct || 0), 0);
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
  const comparisonInitialized = React.useRef(false);

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

  // ── Auto-run simulations on first comparison tab visit ──
  React.useEffect(() => {
    if (activeTab === 'comparison' && !comparisonInitialized.current && savedStrategies.length > 0) {
      comparisonInitialized.current = true;
      runAllSimulations();
    }
  }, [activeTab, savedStrategies, runAllSimulations]);

  // ── Share ──
  const [shareCopied, setShareCopied] = useState(false);

  const shareStrategies = useCallback((strategiesToShare) => {
    const data = {
      strategies: strategiesToShare.map((s) => ({ name: s.name, config: s.config })),
      marketScenario,
      numIterations,
    };
    const encoded = encodeShareData(data);
    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}${window.location.hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }, [marketScenario, numIterations]);

  // ── Deployed capital calc ──
  const fs = config.fund_size_m || 0;
  const fees = fs * ((config.management_fee_pct ?? 2) / 100) * 10;
  const recycled = fs * ((config.recycled_capital_pct ?? 20) / 100);
  const deployed = fs - fees + recycled;
  const allocationTotal = (config.stage_allocations || []).reduce((sum, r) => sum + (r.pct || 0), 0);
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
        <div style={{ display: 'flex', alignItems: 'center', padding: mobile ? '0 10px 0 10px' : '0 20px 0 16px', marginRight: '4px', whiteSpace: 'nowrap', userSelect: 'none' }}>
          <span style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700, letterSpacing: '0.02em' }}>
            {mobile ? (
              <><span style={{ color: '#dc2626' }}>[</span>M<span style={{ color: '#dc2626' }}>]</span></>
            ) : (
              <><span style={{ color: '#dc2626' }}>[</span>Monaco — VC Fund Simulator<span style={{ color: '#dc2626' }}>]</span></>
            )}
          </span>
        </div>
        <button className={`top-tab ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          Home
        </button>
        <button className={`top-tab ${activeTab === 'entry' ? 'active' : ''}`} onClick={() => {
          setActiveTab('entry');
          if (activeStrategyId == null && savedStrategies.length > 0) loadStrategy(savedStrategies[0]);
        }}>
          {mobile ? 'Individual' : 'Individual Strategies'}
        </button>
        <button className={`top-tab ${activeTab === 'comparison' ? 'active' : ''}`} onClick={() => setActiveTab('comparison')}>
          {mobile ? 'Compare' : 'Strategy Comparison'}
        </button>
        <button className={`top-tab ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')}>
          About
        </button>
        {!mobile && <div style={{ flex: 1 }} />}
        {!mobile && (
          <a href="#/markets" style={{
            fontFamily: MONO, fontSize: '11px', color: '#999', textDecoration: 'none',
            padding: '8px 20px', letterSpacing: '0.03em', alignSelf: 'center',
            transition: 'color 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#999'; }}
          >View / Edit Market Data</a>
        )}
      </div>

      {error && (
        <div className="error-bar">
          <span style={{ color: '#dc2626', fontWeight: 600 }}>ERROR</span>
          <span style={{ flex: 1, color: '#666' }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#999' }}>×</button>
        </div>
      )}

      {/* ═══════════ HOME TAB ═══════════ */}
      {activeTab === 'home' && (
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--paper)' }}>
          {/* Hero */}
          <section style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '48px 16px 32px' : '100px 40px 60px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.4fr 1fr', gap: mobile ? '32px' : '64px', alignItems: 'center' }}>
              <div>
                <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}><span style={{ color: '#dc2626' }}>[</span><span style={{ color: '#999' }}>Monaco — VC Fund Simulator</span><span style={{ color: '#dc2626' }}>]</span></span>
                <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: mobile ? '32px' : '48px', fontWeight: 600, lineHeight: 1.1, margin: '16px 0 24px', letterSpacing: '-0.01em', textTransform: 'uppercase' }}>
                  Visualize Fund Returns.<br />
                  <span style={{ color: '#999' }}>Understand the Power Law.</span>
                </h1>
                <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.6, maxWidth: '50ch' }}>
                  VC firms have a lot to consider when they invest their funds. Portfolio size, entry ownership, follow-on reserves, and other strategic decisions have huge impacts on expected returns.
                </p>
                <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
                  <button className="btn" onClick={() => setActiveTab('entry')} style={{ width: 'auto', padding: '12px 28px' }}>
                    Start Simulating
                  </button>
                </div>
              </div>

              {/* Interactive portfolio cards */}
              <HeroPortfolios />
            </div>
          </section>

          {/* Divider */}
          <div style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '0 16px' : '0 40px' }}>
            <div style={{ height: '1px', background: 'var(--ink)' }} />
          </div>

          {/* Why Simulation Matters */}
          <section style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '32px 16px' : '60px 40px' }}>
            <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>Why Simulation Matters</span>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '28px', fontWeight: 600, textTransform: 'uppercase', marginTop: '8px', marginBottom: '40px' }}>
              The Mathematics of Outliers
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr', gap: '32px' }}>
              {/* Power Law */}
              <div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '17px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '10px' }}>Power Law Dynamics</h3>
                <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>
                  In venture, returns are not normally distributed. A single outlier can return the entire fund. We model the posibility of this across thousands of portfolios simultaneously.
                </p>
                <div style={{ border: '1px solid var(--ink)', padding: '14px', marginTop: '20px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>Return Distribution Shape</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px', marginTop: '10px' }}>
                    {[5, 12, 45, 90, 35, 15, 8, 5, 3, 2, 2, 1].map((h, i) => (
                      <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 3 ? 'var(--ink)' : 'rgba(0,0,0,0.15)' }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Portfolio Construction */}
              <div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '17px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '10px' }}>Portfolio Construction</h3>
                <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>
                  How many checks should you write? How much follow-on reserve? See how portfolio construction decisions impact your probability of capturing a fund-returner.
                </p>
                <div style={{ border: '1px solid var(--ink)', padding: '14px', marginTop: '20px' }}>
                  {[{ label: 'Check Size', value: '$1.5M' }, { label: 'Follow-On Reserve', value: '40%' }, { label: 'Portfolio Size', value: '~45 cos' }].map((row, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--trace)' : 'none' }}>
                      <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600 }}>{row.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: '13px' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scenario Planning */}
              <div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '17px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '10px' }}>Changing fund strategy</h3>
                <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>
					Funds are moving earlier or later in the investment cycles. Series A funds are investing at seed. New seed funds are investing at Series A and B. These decisions have profound impacts on fund returns.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '20px' }}>
                  {[{ label: 'Pre-Seed', value: '20%' }, { label: 'Seed', value: '50%' }, { label: 'Series A', value: '30%' }].map((item, i) => (
                    <div key={i} style={{ border: '1px solid var(--ink)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600 }}>{item.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: '18px' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '0 16px' : '0 40px' }}>
            <div style={{ height: '1px', background: 'var(--ink)' }} />
          </div>

          {/* Distribution Preview */}
          {(() => {
            // Realistic MOIC distribution: right-skewed, peaks around 0.8-1.2x, long right tail
            // 40 bins covering 0x to 10x (each bin = 0.25x)
            const bins = [
              2, 5, 10, 18, 35, 55, 78, 95, 100, 92,
              80, 65, 50, 38, 28, 22, 17, 13, 10, 8,
              7, 5, 4, 4, 3, 3, 2, 2, 2, 1,
              1, 1, 1, 1, 1, 0, 0, 0, 0, 1,
            ];
            const maxBin = Math.max(...bins);
            // Percentile bars: P25=bin 5 (~1.25x), P50=bin 8 (~2.0x), P75=bin 13 (~3.25x), P90=bin 19 (~4.75x)
            const percentiles = [
              { bin: 5, label: 'P25', value: '1.3x', color: '#999' },
              { bin: 8, label: 'P50', value: '2.0x', color: '#000' },
              { bin: 13, label: 'P75', value: '3.3x', color: '#16a34a' },
              { bin: 19, label: 'P90', value: '4.8x', color: '#2563eb' },
            ];
            const pBins = new Set(percentiles.map((p) => p.bin));
            const pMap = {};
            percentiles.forEach((p) => { pMap[p.bin] = p; });
            return (
            <section style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '32px 16px 60px' : '60px 40px 100px' }}>
              <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>Simulate a fund strategy thousands of times</span>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '28px', fontWeight: 600, textTransform: 'uppercase', marginTop: '8px' }}>
                Fund Return Distribution (N=5,000)
              </h2>
              <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.6, maxWidth: '60ch', marginTop: '8px', marginBottom: '20px' }}>
                Simulate a fund strategy thousands of times to see the likelihood of different outcomes. Understand what it takes to generate a 4x+ MOIC outcome.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {[{ label: 'Fund Size', value: '$100M' }, { label: 'Follow-On', value: '40%' }, { label: 'Stage', value: 'Seed' }, { label: 'Entry Ownership', value: '10%' }].map((item) => (
                  <div key={item.label} style={{ border: '1px solid var(--ink)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600 }}>{item.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 500 }}>{item.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ border: '1px solid var(--ink)', padding: mobile ? '16px 12px 12px' : '24px 24px 12px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '14px', fontFamily: MONO, fontSize: '9px', color: '#ccc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fake Data</span>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '180px', position: 'relative' }}>
                  {bins.map((h, i) => {
                    const isP = pBins.has(i);
                    const pInfo = pMap[i];
                    return (
                      <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                        <div style={{
                          width: '100%', height: `${maxBin > 0 ? (h / maxBin) * 100 : 0}%`,
                          background: isP ? pInfo.color : 'rgba(0,0,0,0.12)',
                          minHeight: h > 0 ? '1px' : 0,
                        }} />
                        {isP && (
                          <div style={{
                            position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)',
                            fontFamily: MONO, fontSize: '8px', fontWeight: 600, color: pInfo.color,
                            whiteSpace: 'nowrap', textAlign: 'center',
                          }}>
                            {pInfo.label} {pInfo.value}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontFamily: MONO, fontSize: '10px', color: '#999' }}>
                  <span>0x</span><span>2.5x</span><span>5.0x</span><span>7.5x</span><span>10x+</span>
                </div>
                {/* Percentile legend */}
                <div style={{ display: 'flex', gap: '16px', marginTop: '10px', borderTop: '1px solid var(--trace)', paddingTop: '10px' }}>
                  {percentiles.map((p) => (
                    <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '8px', height: '8px', background: p.color }} />
                      <span style={{ fontFamily: MONO, fontSize: '9px', color: p.color, fontWeight: 600 }}>{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            );
          })()}

          {/* Divider */}
          <div style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '0 16px' : '0 40px' }}>
            <div style={{ height: '1px', background: 'var(--ink)' }} />
          </div>

          {/* Strategy Comparison Preview */}
          {(() => {
            const strats = [
              { name: 'SEED FOCUS', color: STRATEGY_COLORS[0], p25: 1.1, p50: 1.8, p75: 3.0, p90: 4.5, p95: 6.2, fundSize: '$200M', stages: 'PS, S', portcos: '52' },
              { name: 'SERIES A HEAVY', color: STRATEGY_COLORS[1], p25: 0.9, p50: 1.5, p75: 2.6, p90: 4.0, p95: 5.5, fundSize: '$200M', stages: 'S, A', portcos: '28' },
              { name: 'DIVERSIFIED', color: STRATEGY_COLORS[2], p25: 1.0, p50: 1.6, p75: 2.8, p90: 3.8, p95: 4.8, fundSize: '$200M', stages: 'PS, S, A', portcos: '40' },
            ];
            const axisMax = 8;
            const VW = 700, VH = 380;
            const LP = 100, RP = 30, TP = 50, BL = 80;
            const chartTop = TP, chartBottom = VH - BL;
            const chartH = chartBottom - chartTop;
            const colW = (VW - LP - RP) / strats.length;
            const toY = (v) => chartBottom - (chartH * v) / axisMax;
            const ticks = [0, 2, 4, 6, 8];
            const pKeys = [
              { key: 'p25', label: 'P25', color: '#999', filled: false },
              { key: 'p50', label: 'P50', color: '#999', filled: true },
              { key: 'p75', label: 'P75', color: '#16a34a', filled: true },
              { key: 'p90', label: 'P90', color: '#2563eb', filled: true },
              { key: 'p95', label: 'P95', color: '#000', filled: false },
            ];
            const detailRows = [
              { label: 'Fund Size', get: (s) => s.fundSize },
              { label: 'Stages', get: (s) => s.stages },
              { label: '# of Portcos', get: (s) => s.portcos },
            ];
            return (
            <section style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '32px 16px 60px' : '60px 40px 100px' }}>
              <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>Side-by-Side Analysis</span>
              <div style={{ marginBottom: '20px', marginTop: '8px' }}>
                <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '28px', fontWeight: 600, textTransform: 'uppercase' }}>
                  Compare Fund Strategies
                </h2>
                <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '15px', color: '#666', marginTop: '8px', lineHeight: '1.5', maxWidth: '700px' }}>
                  Assess the impact of investing with different strategies. Flex variables like entry ownership, investment stage (e.g., pre-seed vs. seed vs. Series A), portfolio size, follow-on reserves and follow-on strategy.
                </p>
              </div>
              <div style={{ border: '1px solid var(--ink)', padding: '16px 0 0', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '14px', fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bbb', zIndex: 1 }}>Fake Data</span>
                <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%' }}>
                  {/* Y-axis grid */}
                  {ticks.map((tick) => (
                    <g key={tick}>
                      <line x1={LP} y1={toY(tick)} x2={VW - RP} y2={toY(tick)} stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                      <text x={LP - 8} y={toY(tick) + 3} fill="#999" fontFamily={MONO} fontSize="9" textAnchor="end">{tick}x</text>
                    </g>
                  ))}

                  {/* Percentile legend */}
                  {pKeys.map((p, i) => {
                    const lx = LP + i * 60;
                    return (
                      <g key={p.key}>
                        <circle cx={lx} cy={20} r={3.5} fill={p.filled ? p.color : 'none'} stroke={p.color} strokeWidth={p.filled ? 0 : 1.5} />
                        <text x={lx + 10} y={24} fill={p.color} fontFamily={MONO} fontSize="9">{p.label}</text>
                      </g>
                    );
                  })}

                  {/* Strategy columns */}
                  {strats.map((s, si) => {
                    const cx = LP + si * colW + colW / 2;
                    const c = s.color;
                    return (
                      <g key={s.name}>
                        {si > 0 && <line x1={LP + si * colW} y1={chartTop} x2={LP + si * colW} y2={chartBottom} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />}
                        {/* Name */}
                        <text x={cx} y={chartBottom + 18} fill={c.main} fontFamily={MONO} fontSize="11" fontWeight="700" textAnchor="middle">{s.name}</text>
                        {/* Whisker */}
                        <line x1={cx} y1={toY(s.p95)} x2={cx} y2={toY(s.p25)} stroke={c.dim} strokeWidth="1.5" />
                        {/* Box */}
                        <rect x={cx - 14} y={toY(s.p90)} width={28} height={Math.max(toY(s.p75) - toY(s.p90), 1)} fill={c.bg} stroke={c.dim} strokeWidth="1" rx="2" />
                        {/* Dots */}
                        {pKeys.map((p) => {
                          const val = s[p.key];
                          const y = toY(val);
                          const dotColor = p.color === '#999' || p.color === '#000' ? (p.filled ? p.color : c.dim) : p.color;
                          return (
                            <g key={p.key}>
                              <circle cx={cx} cy={y} r={4} fill={p.filled ? dotColor : 'var(--paper)'} stroke={dotColor} strokeWidth={p.filled ? 0 : 1.5} />
                              <text x={cx + 10} y={y + 3} fill={dotColor} fontFamily={MONO} fontSize="8" fontWeight={p.filled ? '700' : '400'}>{val.toFixed(1)}x</text>
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Section label — left side, vertically centered */}
                  <text x={14} y={(chartTop + chartBottom) / 2} fill="#999" fontFamily={MONO} fontSize="9" textAnchor="middle" transform={`rotate(-90, 14, ${(chartTop + chartBottom) / 2})`}>MOIC PERCENTILES</text>
                  {/* Detail rows */}
                  {detailRows.map((row, ri) => (
                    <g key={row.label}>
                      <text x={LP - 6} y={chartBottom + 32 + ri * 13} fill="#999" fontFamily={MONO} fontSize="8" textAnchor="end">{row.label}</text>
                      {strats.map((s, si) => (
                        <text key={si} x={LP + si * colW + colW / 2} y={chartBottom + 32 + ri * 13} fill="#000" fontFamily={MONO} fontSize="8.5" fontWeight="400" textAnchor="middle">{row.get(s)}</text>
                      ))}
                    </g>
                  ))}
                </svg>
              </div>
            </section>
            );
          })()}
        </div>
      )}

      {/* ═══════════ STRATEGY ENTRY TAB ═══════════ */}
      {activeTab === 'entry' && (() => {
        const strategyPanel = (
          <>
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
          </>
        );

        const variablesPanel = (
          <div className="panel-content" style={activeStrategyId == null ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
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

            <StageAllocationTable stageAllocations={config.stage_allocations} onStageAllocationsChange={(v) => setField('stage_allocations', v)} />

            <SliderInput label="FOLLOW-ON RESERVE" value={config.dry_powder_reserve_for_pro_rata} onChange={(v) => setField('dry_powder_reserve_for_pro_rata', v)} min={0} max={70} step={5} unit="%" />

            <div className="checkbox-row">
              <input type="checkbox" id="reinvest" checked={config.reinvest_unused_reserve !== false} onChange={(e) => setField('reinvest_unused_reserve', e.target.checked)} />
              <label htmlFor="reinvest" style={{ cursor: 'pointer' }}>Re-invest unused reserve</label>
            </div>

            <NumberInput label="PRO-RATA MAX VALUATION ($M)" value={config.pro_rata_max_valuation} onChange={(v) => setField('pro_rata_max_valuation', v)} min={0} max={10000} step={10} />
          </div>
        );

        const resultsPanel = (
          <>
            <div className="panel-header" style={{ background: 'var(--paper)', color: 'var(--ink)', borderBottom: '1px solid var(--ink)', gap: '10px', flexWrap: mobile ? 'wrap' : 'nowrap' }}>
              {!mobile && <h2 style={{ flex: 1 }}>Simulated Performance Distribution</h2>}
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
              {savedStrategies.length > 0 && (
                <button
                  className="btn"
                  onClick={() => shareStrategies(savedStrategies)}
                  style={{ width: 'auto', padding: '6px 16px', fontSize: '12px', background: 'none', color: 'var(--ink)', border: '1px solid var(--ink)' }}
                >
                  {shareCopied ? 'COPIED!' : 'SHARE'}
                </button>
              )}
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
          </>
        );

        return mobile ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="entry-sub-tabs">
              <button className={`entry-sub-tab ${entryPanel === 'strategy' ? 'active' : ''}`} onClick={() => setEntryPanel('strategy')}>Strategy</button>
              <button className={`entry-sub-tab ${entryPanel === 'variables' ? 'active' : ''}`} onClick={() => setEntryPanel('variables')}>Variables</button>
              <button className={`entry-sub-tab ${entryPanel === 'results' ? 'active' : ''}`} onClick={() => setEntryPanel('results')}>Results</button>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {entryPanel === 'strategy' && <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>{strategyPanel}</div>}
              {entryPanel === 'variables' && <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>{variablesPanel}</div>}
              {entryPanel === 'results' && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{resultsPanel}</div>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 320px 1fr', flex: 1, overflow: 'hidden' }}>
            {/* Panel 1: Strategy List */}
            <aside className="panel">
              <div className="panel-header">
                <h2>1. Strategy</h2>
                <span className="mono">SELECT</span>
              </div>
              {strategyPanel}
            </aside>

            {/* Panel 2: Variables */}
            <aside className="panel" style={activeStrategyId == null ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
              <div className="panel-header">
                <h2>2. Variables</h2>
                <span className="mono">{activeStrategyId == null ? 'SELECT A STRATEGY' : 'INPUT'}</span>
              </div>
              {variablesPanel}
            </aside>

            {/* Panel 3: Single Strategy Results */}
            <main className="panel" style={{ overflow: 'hidden' }}>
              {resultsPanel}
            </main>
          </div>
        );
      })()}

      {/* ═══════════ STRATEGY COMPARISON TAB ═══════════ */}
      {activeTab === 'comparison' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {savedStrategies.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontFamily: MONO, fontSize: '14px', color: '#999' }}>NO STRATEGIES CREATED</span>
              <span style={{ fontFamily: MONO, fontSize: '11px', color: '#ccc' }}>Create strategies in the Strategy Entry tab first</span>
            </div>
          ) : comparisonLoading && !savedStrategies.some((s) => s.results) ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontFamily: MONO, fontSize: '14px', color: '#999', animation: 'pulse 1.5s infinite' }}>RUNNING SIMULATIONS...</span>
              <span style={{ fontFamily: MONO, fontSize: '11px', color: '#ccc' }}>Computing {savedStrategies.length} {savedStrategies.length === 1 ? 'strategy' : 'strategies'} with {COMPARISON_ITERATIONS.toLocaleString()} iterations each</span>
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
              <div style={{ display: 'flex', alignItems: 'center', padding: mobile ? '8px 12px' : '8px 20px', gap: '8px', borderBottom: '1px solid var(--ink)', flexShrink: 0, overflowX: 'auto', flexWrap: mobile ? 'wrap' : 'nowrap' }}>
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
                      onClick={() => { if (!didDrag.current) toggleStrategy(strat.id); didDrag.current = false; }}
                      draggable
                      onDragStart={(e) => { didDrag.current = true; dragItem.current = i; e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => { e.preventDefault(); dragOverItem.current = i; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
                          const from = dragItem.current;
                          const to = dragOverItem.current;
                          setSavedStrategies((prev) => {
                            const reordered = [...prev];
                            const [moved] = reordered.splice(from, 1);
                            reordered.splice(to, 0, moved);
                            return reordered;
                          });
                        }
                        dragItem.current = null;
                        dragOverItem.current = null;
                      }}
                      onDragEnd={() => { dragItem.current = null; dragOverItem.current = null; }}
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
                {savedStrategies.length > 0 && (
                  <button
                    className="btn"
                    onClick={() => shareStrategies(savedStrategies)}
                    style={{ width: 'auto', padding: '6px 16px', fontSize: '12px', background: 'none', color: 'var(--ink)', border: '1px solid var(--ink)', whiteSpace: 'nowrap' }}
                  >
                    {shareCopied ? 'COPIED!' : 'SHARE ALL'}
                  </button>
                )}
              </div>

              {comparisonLoading && (
                <div style={{ padding: '6px 20px', fontFamily: MONO, fontSize: '11px', color: '#999', animation: 'pulse 1.5s infinite', borderBottom: '1px solid var(--trace)' }}>
                  COMPUTING {savedStrategies.length} STRATEGIES...
                </div>
              )}

              <div style={{ flex: 1, display: mobile ? 'flex' : 'grid', flexDirection: mobile ? 'column' : undefined, gridTemplateColumns: mobile ? undefined : '2fr 1fr', overflow: mobile ? 'auto' : 'hidden' }}>
                {/* Dot Plot */}
                <div style={{ borderRight: mobile ? 'none' : '1px solid var(--ink)', borderBottom: mobile ? '1px solid var(--ink)' : 'none', display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: mobile ? '400px' : undefined }}>
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

      {/* ═══════════ ABOUT & CONTACT TAB ═══════════ */}
      {activeTab === 'about' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <section style={{ maxWidth: '960px', margin: '0 auto', padding: mobile ? '32px 16px' : '60px 40px' }}>
            <div style={{ marginBottom: '40px' }}>
              <AboutPortfolioGrid />
            </div>

            <span style={{ fontFamily: MONO, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>About</span>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: mobile ? '26px' : '35px', fontWeight: 600, textTransform: 'uppercase', marginTop: '8px', marginBottom: '20px' }}>
              Monaco Fund Simulator
            </h2>
            <p style={{ fontSize: mobile ? '15px' : '17.5px', color: '#666', lineHeight: 1.7 }}>
              Venture fund economics are fascinating, especially in this rapidly evolving early stage software market. We built this simulator as part of the research for our own early stage AI/ML fund, <a href="https://gradient.com" target="_blank" rel="noopener noreferrer" style={{ color: '#dc2626', fontWeight: 600 }}>Gradient</a>. <br/> <br/>If you want to chat about venture fund economics, feel free to reach out to me at clayton [at] gradient.com. You can find more details about me <a href="https://claytonpetty.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>here</a> and <a href="https://www.linkedin.com/in/cdpetty/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>here</a>. <br/> <br/> A special thanks to my colleague Zach Bratun-Glennon at Gradient for problem solving this and <a href="https://www.linkedin.com/in/peterjameswalker/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>Peter Walker</a> at <a href="https://carta.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>Carta</a> for collaborating with us on the data that drives the underlying graduation rate and valuation assumptions.<br/> <br/> Happy investing!
            </p>

            <div style={{ height: '1px', background: 'var(--ink)', margin: '40px 0' }} />

            <span style={{ fontFamily: MONO, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>Getting Started</span>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: mobile ? '26px' : '35px', fontWeight: 600, textTransform: 'uppercase', marginTop: '8px', marginBottom: '20px' }}>
              How to Use
            </h2>
            <ol style={{ fontSize: mobile ? '15px' : '17.5px', color: '#666', lineHeight: 1.7, paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <li>The simulator is best used by pre-seed, seed, and some select Series A funds (particularly those that do seed and A).</li>
              <li>The base market case is built on market data from <a href="https://carta.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>Carta</a> (<a href="https://www.linkedin.com/posts/peterjameswalker_seed-to-series-a-graduation-rate-activity-7292256120423755777-bu8o?utm_source=share&utm_medium=member_desktop&rcm=ACoAABafbR8BDcy1wnDzXevSXgZAK-jqfPLKZVM" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>this post</a>) and other sources that document historical graduation rates of companies from stage to stage.</li>
              <li>You can tweak market assumptions if you are interested.</li>
            </ol>

            <div style={{ height: '1px', background: 'var(--ink)', margin: '40px 0' }} />

            <span style={{ fontFamily: MONO, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>Source Code</span>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: mobile ? '26px' : '35px', fontWeight: 600, textTransform: 'uppercase', marginTop: '8px', marginBottom: '12px' }}>
              GitHub
            </h2>
            <p style={{ fontSize: mobile ? '15px' : '17.5px', color: '#666', lineHeight: 1.7, marginBottom: '16px' }}>
              Monaco Fund Simulator is open source. However, please be kind as much of the actual data science work was done in Hex and then Claude did the hard (and at times, sloppy) work of building the app.
            </p>
            <a href="https://github.com/monaco-app" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '10px 20px', border: '1px solid var(--ink)', fontFamily: MONO, fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink)', textDecoration: 'none', fontWeight: 600 }}>
              View on GitHub
            </a>

            <div style={{ height: '1px', background: 'var(--ink)', margin: '40px 0' }} />

            <span style={{ fontFamily: MONO, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#999', fontWeight: 600 }}>Further Reading</span>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: mobile ? '26px' : '35px', fontWeight: 600, textTransform: 'uppercase', marginTop: '8px', marginBottom: '20px' }}>
              Other Great Writing About Fund Economics
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { title: 'Placeholder Article Title', source: 'Source Name', url: '#' },
                { title: 'Placeholder Article Title', source: 'Source Name', url: '#' },
                { title: 'Placeholder Article Title', source: 'Source Name', url: '#' },
                { title: 'Placeholder Article Title', source: 'Source Name', url: '#' },
              ].map((article, i) => (
                <a key={i} href={article.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: mobile ? 'flex-start' : 'center', padding: '14px', border: '1px solid var(--ink)', textDecoration: 'none', color: 'var(--ink)', transition: 'background 0.15s', gap: mobile ? '4px' : undefined }}>
                  <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: '19px', fontWeight: 600 }}>{article.title}</span>
                  <span style={{ fontFamily: MONO, fontSize: '12.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999' }}>{article.source}</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default App;
