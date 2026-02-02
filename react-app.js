import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:8000';

const PRESEED_VALUATION = 15; // $M
const SEED_VALUATION = 30;   // $M

const DEFAULT_CONFIG = {
  fund_size_m: 50,
  dry_powder_reserve_for_pro_rata: 30,
  reinvest_unused_reserve: true,
  pro_rata_max_valuation: 70,
  preseed_pct: 100,
  preseed_check_size: 1.5,
  seed_check_size: 2.0,
};

const FUND_NAMES = ['Fund A', 'Fund B', 'Fund C', 'Fund D'];

const FUND_COLORS = [
  { main: '#6E9EFF', dim: 'rgba(110,158,255,0.5)', bg: 'rgba(110,158,255,0.12)' },
  { main: '#FF6E9E', dim: 'rgba(255,110,158,0.5)', bg: 'rgba(255,110,158,0.12)' },
  { main: '#9EFF6E', dim: 'rgba(158,255,110,0.5)', bg: 'rgba(158,255,110,0.12)' },
  { main: '#FFD26E', dim: 'rgba(255,210,110,0.5)', bg: 'rgba(255,210,110,0.12)' },
];

let nextFundId = 2;

const customStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  patternLines: {
    background: `repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.2),
      rgba(255, 255, 255, 0.2) 1px,
      transparent 1px,
      transparent 4px
    )`
  },
  headerRuler: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '8px',
    background: `
      linear-gradient(90deg, #ffffff 1px, transparent 1px) 0 bottom / 20px 100%,
      linear-gradient(90deg, #ffffff 1px, transparent 1px) 0 bottom / 4px 40%
    `,
    backgroundRepeat: 'repeat-x'
  },
  sectionHeaderBg: {
    background: `repeating-linear-gradient(
      -45deg,
      rgba(255,255,255,0.05),
      rgba(255,255,255,0.05) 1px,
      transparent 1px,
      transparent 4px
    )`
  },
  rangeTrackRuler: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '100%',
    height: '4px',
    marginTop: '-2px',
    background: 'rgba(255, 255, 255, 0.2)',
    backgroundImage: 'linear-gradient(90deg, #ffffff 1px, transparent 1px)',
    backgroundSize: '10% 100%',
    zIndex: 1
  },
  barPattern: {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 3px)',
    opacity: 0.4
  }
};

const MONO = "'Space Mono', 'Courier New', monospace";
const DIM = 'rgba(255, 255, 255, 0.5)';
const BORDER_DIM = '1px solid rgba(255, 255, 255, 0.3)';

function computeP95(distribution) {
  if (!distribution || distribution.length === 0) return null;
  const sorted = [...distribution].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function getFundColor(funds, fundId) {
  const idx = funds.findIndex((f) => f.id === fundId);
  return FUND_COLORS[idx % FUND_COLORS.length];
}

const Header = () => (
  <header style={{ height: '48px', borderBottom: '1px solid #ffffff', display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between', flexShrink: 0, position: 'relative' }}>
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <div style={{ ...customStyles.patternLines, width: '24px', height: '24px', border: '1px solid #ffffff' }}></div>
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: MONO, fontWeight: 700 }}>Monaco Fund Strategy Simulator</span>
    </div>
    <div style={{ fontFamily: MONO, color: DIM, fontSize: '10px' }}>
      FUND SIMULATOR v2.0
    </div>
    <div style={customStyles.headerRuler}></div>
  </header>
);

const SectionHeader = ({ number, label }) => (
  <div style={{ padding: '8px 16px', borderBottom: '1px solid #ffffff', fontFamily: MONO, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, ...customStyles.sectionHeaderBg }}>
    <span style={{ marginRight: '8px' }}>{number}</span> {label}
  </div>
);

const SliderControl = ({ label, value, onChange, min, max, step, suffix, display }) => (
  <div style={{ padding: '12px 16px', borderBottom: BORDER_DIM, display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
    <label style={{ fontSize: '11px', color: DIM, display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ color: '#ffffff', fontFamily: MONO }}>{display || value}{suffix || ''}</span>
    </label>
    <div style={{ position: 'relative', height: '24px', display: 'flex', alignItems: 'center' }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ WebkitAppearance: 'none', width: '100%', background: 'transparent', position: 'relative', zIndex: 2 }}
      />
      <div style={customStyles.rangeTrackRuler}></div>
    </div>
  </div>
);

const NumberControl = ({ label, value, onChange, min, max, step, suffix }) => (
  <div style={{ padding: '12px 16px', borderBottom: BORDER_DIM, display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
    <label style={{ fontSize: '11px', color: DIM }}>{label}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '6px 8px', fontFamily: MONO, fontSize: '12px', width: '100%', outline: 'none' }}
      />
      {suffix && <span style={{ fontFamily: MONO, fontSize: '11px', color: DIM, whiteSpace: 'nowrap' }}>{suffix}</span>}
    </div>
  </div>
);

const ButtonGroupControl = ({ label, value, onChange, options }) => (
  <div style={{ padding: '12px 16px', borderBottom: BORDER_DIM, display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
    <label style={{ fontSize: '11px', color: DIM }}>{label}</label>
    <div style={{ display: 'flex', gap: '4px' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            background: value === opt.value ? '#ffffff' : 'transparent',
            color: value === opt.value ? '#000000' : DIM,
            border: '1px solid rgba(255, 255, 255, 0.3)',
            fontFamily: MONO,
            fontSize: '10px',
            textTransform: 'uppercase',
            padding: '6px 4px',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

const FundTabs = ({ funds, activeFundId, onSelectFund, onAddFund, onRemoveFund }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid #ffffff', background: '#000000', flexShrink: 0 }}>
    {funds.map((fund, fi) => {
      const isActive = fund.id === activeFundId;
      const color = FUND_COLORS[fi % FUND_COLORS.length];
      return (
        <div
          key={fund.id}
          onClick={() => onSelectFund(fund.id)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 8px',
            cursor: 'pointer',
            background: isActive ? color.bg : 'transparent',
            color: isActive ? color.main : DIM,
            fontFamily: MONO,
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderRight: '1px solid rgba(255, 255, 255, 0.3)',
            borderBottom: isActive ? `2px solid ${color.main}` : '2px solid transparent',
            transition: 'all 0.15s',
            position: 'relative',
            userSelect: 'none',
          }}
        >
          <span style={{ fontWeight: isActive ? 700 : 400 }}>{fund.name}</span>
          {funds.length > 1 && (
            <span
              onClick={(e) => { e.stopPropagation(); onRemoveFund(fund.id); }}
              style={{
                fontSize: '13px',
                lineHeight: '1',
                opacity: 0.5,
                cursor: 'pointer',
                padding: '0 2px',
              }}
            >
              ×
            </span>
          )}
        </div>
      );
    })}
    {funds.length < 4 && (
      <button
        onClick={onAddFund}
        style={{
          width: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRight: 'none',
          color: DIM,
          fontFamily: MONO,
          fontSize: '16px',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        +
      </button>
    )}
  </div>
);

const StageAllocationControl = ({ preseedPct, onPreseedPctChange, preseedCheck, onPreseedCheckChange, seedCheck, onSeedCheckChange }) => {
  const seedPct = 100 - preseedPct;
  const preseedOwnership = ((preseedCheck / PRESEED_VALUATION) * 100).toFixed(1);
  const seedOwnership = ((seedCheck / SEED_VALUATION) * 100).toFixed(1);

  return (
    <div style={{ padding: '12px 16px', borderBottom: BORDER_DIM, display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
      {/* Stage split slider */}
      <label style={{ fontSize: '11px', color: DIM }}>STAGE ALLOCATION</label>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: '11px' }}>
        <span>Pre-seed <span style={{ color: '#ffffff' }}>{preseedPct}%</span></span>
        <span>Seed <span style={{ color: '#ffffff' }}>{seedPct}%</span></span>
      </div>
      <div style={{ position: 'relative', height: '24px', display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={preseedPct}
          onChange={(e) => onPreseedPctChange(parseFloat(e.target.value))}
          style={{ WebkitAppearance: 'none', width: '100%', background: 'transparent', position: 'relative', zIndex: 2 }}
        />
        <div style={customStyles.rangeTrackRuler}></div>
      </div>

      {/* Check sizes with implied ownership */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Pre-seed check */}
        <div style={{ flex: 1, opacity: preseedPct === 0 ? 0.3 : 1 }}>
          <label style={{ fontSize: '10px', color: DIM, display: 'block', marginBottom: '4px' }}>PRE-SEED CHECK ($M)</label>
          <input
            type="number"
            value={preseedCheck}
            min={0.1}
            max={10}
            step={0.25}
            disabled={preseedPct === 0}
            onChange={(e) => onPreseedCheckChange(parseFloat(e.target.value) || 0.1)}
            style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '5px 6px', fontFamily: MONO, fontSize: '11px', width: '100%', outline: 'none' }}
          />
          <div style={{ fontFamily: MONO, fontSize: '10px', color: DIM, marginTop: '3px' }}>
            → <span style={{ color: '#ffffff' }}>{preseedOwnership}%</span> own @ ${PRESEED_VALUATION}M val
          </div>
        </div>

        {/* Seed check */}
        <div style={{ flex: 1, opacity: seedPct === 0 ? 0.3 : 1 }}>
          <label style={{ fontSize: '10px', color: DIM, display: 'block', marginBottom: '4px' }}>SEED CHECK ($M)</label>
          <input
            type="number"
            value={seedCheck}
            min={0.1}
            max={20}
            step={0.25}
            disabled={seedPct === 0}
            onChange={(e) => onSeedCheckChange(parseFloat(e.target.value) || 0.1)}
            style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '5px 6px', fontFamily: MONO, fontSize: '11px', width: '100%', outline: 'none' }}
          />
          <div style={{ fontFamily: MONO, fontSize: '10px', color: DIM, marginTop: '3px' }}>
            → <span style={{ color: '#ffffff' }}>{seedOwnership}%</span> own @ ${SEED_VALUATION}M val
          </div>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ funds, activeFundId, onSelectFund, onAddFund, onRemoveFund, onUpdateConfig, marketScenario, onMarketScenarioChange, numPeriods, onNumPeriodsChange, numIterations, onNumIterationsChange }) => {
  const activeFund = funds.find((f) => f.id === activeFundId);
  if (!activeFund) return null;
  const config = activeFund.config;

  const setField = (field, value) => {
    onUpdateConfig(activeFundId, { ...config, [field]: value });
  };

  return (
    <aside style={{ width: '320px', minWidth: '320px', borderRight: '1px solid #ffffff', display: 'flex', flexDirection: 'column', background: '#000000', zIndex: 10, minHeight: 0 }}>
      {/* Global settings */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #ffffff', flexShrink: 0, background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '10px', color: DIM, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: MONO }}>Global Settings</label>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { value: 'BELOW_MARKET', label: 'Bear' },
            { value: 'MARKET', label: 'Market' },
            { value: 'ABOVE_MARKET', label: 'Bull' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => onMarketScenarioChange(opt.value)}
              style={{
                flex: 1,
                background: marketScenario === opt.value ? '#ffffff' : 'transparent',
                color: marketScenario === opt.value ? '#000000' : DIM,
                border: '1px solid rgba(255, 255, 255, 0.3)',
                fontFamily: MONO,
                fontSize: '10px',
                textTransform: 'uppercase',
                padding: '5px 4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <a href="#/markets" style={{ fontFamily: MONO, fontSize: '9px', color: DIM, textDecoration: 'none', letterSpacing: '0.05em', textAlign: 'right' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = DIM; }}
        >EDIT RATES &gt;</a>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: DIM, display: 'block', marginBottom: '3px' }}>PERIODS</label>
            <input
              type="number"
              value={numPeriods}
              min={1}
              max={20}
              step={1}
              onChange={(e) => onNumPeriodsChange(parseInt(e.target.value) || 1)}
              style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '5px 6px', fontFamily: MONO, fontSize: '11px', width: '100%', outline: 'none' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: DIM, display: 'block', marginBottom: '3px' }}>ITERATIONS</label>
            <input
              type="number"
              value={numIterations}
              min={100}
              max={10000}
              step={500}
              onChange={(e) => onNumIterationsChange(parseInt(e.target.value) || 100)}
              style={{ background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', padding: '5px 6px', fontFamily: MONO, fontSize: '11px', width: '100%', outline: 'none' }}
            />
          </div>
        </div>
      </div>

      <FundTabs
        funds={funds}
        activeFundId={activeFundId}
        onSelectFund={onSelectFund}
        onAddFund={onAddFund}
        onRemoveFund={onRemoveFund}
      />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <SectionHeader number="01" label="Fund Topology" />

        <NumberControl
          label="FUND SIZE ($M)"
          value={config.fund_size_m}
          onChange={(v) => setField('fund_size_m', v)}
          min={1}
          max={1000}
          step={10}
        />

        <SliderControl
          label="FOLLOW-ON RESERVE"
          value={config.dry_powder_reserve_for_pro_rata}
          onChange={(v) => setField('dry_powder_reserve_for_pro_rata', v)}
          min={0}
          max={80}
          step={5}
          suffix="% of fund"
        />

        <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id={`reinvest-${activeFundId}`}
            checked={config.reinvest_unused_reserve !== false}
            onChange={(e) => setField('reinvest_unused_reserve', e.target.checked)}
            style={{ accentColor: '#ffffff', width: '12px', height: '12px', cursor: 'pointer' }}
          />
          <label htmlFor={`reinvest-${activeFundId}`} style={{ fontFamily: MONO, fontSize: '9px', color: DIM, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Re-invest unused reserve
          </label>
        </div>

        <SectionHeader number="02" label="Stage & Check Size" />

        <StageAllocationControl
          preseedPct={config.preseed_pct}
          onPreseedPctChange={(v) => setField('preseed_pct', v)}
          preseedCheck={config.preseed_check_size}
          onPreseedCheckChange={(v) => setField('preseed_check_size', v)}
          seedCheck={config.seed_check_size}
          onSeedCheckChange={(v) => setField('seed_check_size', v)}
        />

        <NumberControl
          label="PRO-RATA MAX VALUATION ($M)"
          value={config.pro_rata_max_valuation}
          onChange={(v) => setField('pro_rata_max_valuation', v)}
          min={0}
          max={10000}
          step={10}
        />
      </div>
    </aside>
  );
};

const Toolbar = ({ onRunSimulation, loading, fundCount }) => (
  <div style={{ height: '40px', borderBottom: '1px solid #ffffff', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px', flexShrink: 0 }}>
    <div style={{ flex: 1 }}></div>
    {loading && (
      <div style={{ fontFamily: MONO, color: DIM, fontSize: '10px', animation: 'pulse 1.5s infinite' }}>
        COMPUTING...
      </div>
    )}
    <div style={{ fontFamily: MONO, color: DIM, fontSize: '10px' }}>
      {fundCount} FUND{fundCount > 1 ? 'S' : ''}
    </div>
    <button
      onClick={onRunSimulation}
      disabled={loading}
      style={{
        background: loading ? 'rgba(255,255,255,0.3)' : '#ffffff',
        color: '#000000',
        border: '1px solid #ffffff',
        fontFamily: MONO,
        fontSize: '11px',
        textTransform: 'uppercase',
        padding: '6px 12px',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s'
      }}
    >
      {loading ? 'RUNNING...' : 'RUN SIMULATION'}
    </button>
  </div>
);

function buildHistogram(distribution, numBins = 20) {
  if (!distribution || distribution.length === 0) {
    return { bins: [], labels: [] };
  }
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
  return { bins, labels, counts, binWidth, minVal: 0 };
}

const PERCENTILE_KEYS = [
  { key: 'p25_moic', label: 'P25', color: null, filled: false },
  { key: 'median_moic', label: 'P50', color: '#ffffff', filled: true },
  { key: 'p75_moic', label: 'P75', color: '#4ade80', filled: true },
  { key: 'p90_moic', label: 'P90', color: '#60a5fa', filled: true },
  { key: 'p95_moic', label: 'P95', color: '#ffffff', filled: false },
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
  for (let v = 0; v <= nice; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return { ticks, axisMax: nice };
}

const DotPlot = ({ funds, fundResults, activeFundId, onSelectFund }) => {
  const fundData = funds
    .map((fund, fi) => {
      const res = fundResults[fund.id];
      if (!res) return null;
      const p95 = computeP95(res.moic_distribution);
      return {
        id: fund.id,
        name: fund.name,
        color: FUND_COLORS[fi % FUND_COLORS.length],
        p25: res.results.p25_moic,
        p50: res.results.median_moic,
        p75: res.results.p75_moic,
        p90: res.results.p90_moic,
        p95: p95 != null ? p95 : res.results.p90_moic,
      };
    })
    .filter(Boolean);

  const hasData = fundData.length > 0;
  const allMax = hasData ? Math.max(...fundData.map((d) => d.p95)) : 10;
  const { ticks, axisMax } = generateTicks(allMax * 1.1);
  const ROW_HEIGHT = 56;
  const LEFT_LABEL = 70;
  const RIGHT_PAD = 16;
  const TOP_PAD = 36;
  const BOTTOM_PAD = 28;

  return (
    <div style={{ border: '1px solid #ffffff', position: 'relative', display: 'flex', flexDirection: 'column', gridRow: '1 / -1' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, padding: '4px 8px', background: '#000000', borderBottom: '1px solid #ffffff', borderRight: '1px solid #ffffff', fontFamily: MONO, fontSize: '10px', zIndex: 5 }}>
        MOIC PERCENTILES
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!hasData ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '12px', color: DIM }}>
            RUN SIMULATION TO VIEW DISTRIBUTION
          </div>
        ) : (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 600 ${TOP_PAD + fundData.length * ROW_HEIGHT + BOTTOM_PAD}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            {/* Tick grid lines + labels */}
            {ticks.map((tick) => {
              const x = LEFT_LABEL + ((600 - LEFT_LABEL - RIGHT_PAD) * tick) / axisMax;
              return (
                <g key={tick}>
                  <line
                    x1={x} y1={TOP_PAD - 4}
                    x2={x} y2={TOP_PAD + fundData.length * ROW_HEIGHT}
                    stroke="rgba(255,255,255,0.1)" strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={TOP_PAD + fundData.length * ROW_HEIGHT + 16}
                    fill={DIM}
                    fontFamily={MONO}
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {tick}x
                  </text>
                </g>
              );
            })}

            {/* Percentile legend at top */}
            <g>
              {PERCENTILE_KEYS.map((p, i) => {
                const lx = LEFT_LABEL + i * 55;
                const isMedian = p.key === 'median_moic';
                const dotColor = p.color || '#ffffff';
                return (
                  <g key={p.key}>
                    <circle
                      cx={lx}
                      cy={TOP_PAD - 18}
                      r={isMedian ? 5 : 3.5}
                      fill={p.filled ? dotColor : 'none'}
                      stroke={dotColor}
                      strokeWidth={p.filled ? 0 : 1.5}
                    />
                    <text
                      x={lx + 10}
                      y={TOP_PAD - 14}
                      fill={p.color || DIM}
                      fontFamily={MONO}
                      fontSize="8"
                    >
                      {p.label}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Fund rows */}
            {fundData.map((fund, fi) => {
              const cy = TOP_PAD + fi * ROW_HEIGHT + ROW_HEIGHT / 2;
              const toX = (val) => LEFT_LABEL + ((600 - LEFT_LABEL - RIGHT_PAD) * val) / axisMax;
              const c = fund.color;
              const isSelected = fund.id === activeFundId;

              const vals = {
                p25_moic: fund.p25,
                median_moic: fund.p50,
                p75_moic: fund.p75,
                p90_moic: fund.p90,
                p95_moic: fund.p95,
              };

              return (
                <g key={fund.id} onClick={() => onSelectFund(fund.id)} style={{ cursor: 'pointer' }}>
                  {/* Hit area / selection highlight */}
                  <rect
                    x={0}
                    y={TOP_PAD + fi * ROW_HEIGHT}
                    width={600}
                    height={ROW_HEIGHT}
                    fill={isSelected ? 'rgba(255,255,255,0.05)' : 'transparent'}
                    style={{ cursor: 'pointer' }}
                  />

                  {/* Row separator */}
                  {fi > 0 && (
                    <line
                      x1={LEFT_LABEL - 8} y1={TOP_PAD + fi * ROW_HEIGHT}
                      x2={600 - RIGHT_PAD} y2={TOP_PAD + fi * ROW_HEIGHT}
                      stroke="rgba(255,255,255,0.08)" strokeWidth="1"
                    />
                  )}

                  {/* Selection indicator */}
                  {isSelected && (
                    <rect
                      x={0}
                      y={TOP_PAD + fi * ROW_HEIGHT}
                      width={3}
                      height={ROW_HEIGHT}
                      fill={c.main}
                    />
                  )}

                  {/* Fund name label */}
                  <text
                    x={8}
                    y={cy + 4}
                    fill={c.main}
                    fontFamily={MONO}
                    fontSize="10"
                    fontWeight="700"
                    textDecoration={isSelected ? 'underline' : 'none'}
                  >
                    {fund.name}
                  </text>

                  {/* Whisker line P25 → P95 */}
                  <line
                    x1={toX(vals.p25_moic)}
                    y1={cy}
                    x2={toX(vals.p95_moic)}
                    y2={cy}
                    stroke={c.dim}
                    strokeWidth="1.5"
                  />

                  {/* IQR bar P25 → P75 */}
                  <rect
                    x={toX(vals.p25_moic)}
                    y={cy - 6}
                    width={Math.max(toX(vals.p75_moic) - toX(vals.p25_moic), 1)}
                    height={12}
                    fill={c.bg}
                    stroke={c.dim}
                    strokeWidth="1"
                    rx="2"
                  />

                  {/* Dots */}
                  {PERCENTILE_KEYS.map((p) => {
                    const val = vals[p.key];
                    const x = toX(val);
                    const isMedian = p.key === 'median_moic';
                    const dotColor = p.color || c.dim;
                    return (
                      <g key={p.key}>
                        <circle
                          cx={x}
                          cy={cy}
                          r={isMedian ? 6 : 4}
                          fill={p.filled ? dotColor : '#000000'}
                          stroke={dotColor}
                          strokeWidth={p.filled ? 0 : 1.5}
                        />
                        {/* Value label above */}
                        <text
                          x={x}
                          y={cy - (isMedian ? 13 : 11)}
                          fill={dotColor}
                          fontFamily={MONO}
                          fontSize="8"
                          fontWeight={p.filled ? '700' : '400'}
                          textAnchor="middle"
                        >
                          {val.toFixed(2)}x
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
};

const ReturnFrequency = ({ funds, fundResults, activeFundId }) => {
  const res = fundResults[activeFundId];
  const distribution = res?.moic_distribution;
  const { bins, labels } = buildHistogram(distribution, 24);
  const color = getFundColor(funds, activeFundId);
  const activeFund = funds.find((f) => f.id === activeFundId);
  const hasData = bins.length > 0;

  return (
    <div style={{ border: '1px solid #ffffff', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, padding: '4px 8px', background: '#000000', borderBottom: '1px solid #ffffff', borderRight: '1px solid #ffffff', fontFamily: MONO, fontSize: '10px', zIndex: 5, display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span>RETURN DISTRIBUTION</span>
        {activeFund && <span style={{ color: color.main }}>{activeFund.name}</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'stretch', padding: '28px 16px 0 16px', gap: '1px' }}>
        {hasData ? bins.map((height, index) => (
          <div key={index} style={{ flex: 1, background: `linear-gradient(to top, ${color.main} 0%, ${color.bg} 100%)`, minHeight: '1px', position: 'relative', height: `${Math.max(height, 1)}%`, borderRadius: '1px 1px 0 0' }}>
          </div>
        )) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: '11px', color: DIM, paddingBottom: '16px' }}>
            CLICK A FUND TO VIEW
          </div>
        )}
      </div>
      {hasData && (
        <div style={{ fontFamily: MONO, fontSize: '9px', display: 'flex', justifyContent: 'space-between', padding: '4px 16px 4px', borderTop: '1px solid rgba(255,255,255,0.2)', color: DIM }}>
          {labels.map((l, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{l}</span>)}
        </div>
      )}
    </div>
  );
};

const KeyMetrics = ({ funds, fundResults }) => {
  const allResults = funds
    .filter((f) => fundResults[f.id])
    .map((f, i) => {
      const r = fundResults[f.id];
      const p95 = computeP95(r.moic_distribution);
      return { name: f.name, results: { ...r.results, p95_moic: p95 != null ? p95 : r.results.p90_moic }, color: FUND_COLORS[funds.indexOf(f) % FUND_COLORS.length] };
    });

  const fmt = (v, decimals = 2) => v != null ? v.toFixed(decimals) : '-';

  return (
    <div style={{ border: '1px solid #ffffff', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, padding: '4px 8px', background: '#000000', borderBottom: '1px solid #ffffff', borderRight: '1px solid #ffffff', fontFamily: MONO, fontSize: '10px', zIndex: 5 }}>
        KEY METRICS
      </div>
      <div style={{ padding: '28px 16px 16px', overflowY: 'auto', flex: 1 }}>
        {allResults.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: '12px', color: DIM, textAlign: 'center', paddingTop: '24px' }}>
            NO DATA
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: '11px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ffffff', color: DIM, fontWeight: 'normal' }}>METRIC</th>
                {allResults.map((sim, i) => (
                  <th key={i} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${sim.color.main}`, color: sim.color.main, fontWeight: 700, fontSize: '10px' }}>
                    {sim.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'p95_moic', label: 'P95 MOIC', suffix: 'x' },
                { key: 'p90_moic', label: 'P90 MOIC', suffix: 'x' },
                { key: 'p75_moic', label: 'P75 MOIC', suffix: 'x' },
                { key: 'median_moic', label: 'P50 MOIC', suffix: 'x' },
                { key: 'p25_moic', label: 'P25 MOIC', suffix: 'x' },
                { key: 'avg_total_companies', label: 'AVG PORTFOLIO SIZE', suffix: '', decimals: 1 },
              ].map((row, ri, arr) => (
                <tr key={row.key}>
                  <td style={{ padding: '5px 8px', borderBottom: ri === arr.length - 1 ? 'none' : BORDER_DIM, color: '#ffffff' }}>{row.label}</td>
                  {allResults.map((sim, si) => (
                    <td key={si} style={{ padding: '5px 8px', borderBottom: ri === arr.length - 1 ? 'none' : BORDER_DIM, textAlign: 'right', color: sim.color.main }}>
                      {fmt(sim.results[row.key], row.decimals || 2)}{row.suffix}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const ErrorBanner = ({ error, onDismiss }) => {
  if (!error) return null;
  return (
    <div style={{ padding: '8px 16px', background: 'rgba(255,50,50,0.15)', borderBottom: '1px solid rgba(255,50,50,0.4)', display: 'flex', alignItems: 'center', gap: '12px', fontFamily: MONO, fontSize: '11px', flexShrink: 0 }}>
      <span style={{ color: '#ff6666' }}>ERROR</span>
      <span style={{ color: DIM, flex: 1 }}>{error}</span>
      <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: DIM, cursor: 'pointer', fontFamily: MONO, fontSize: '14px' }}>×</button>
    </div>
  );
};

const App = () => {
  const [funds, setFunds] = useState(() => {
    const stored = localStorage.getItem('monaco_funds');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          nextFundId = Math.max(...parsed.map(f => f.id)) + 1;
          return parsed;
        }
      } catch (e) {}
    }
    return [{ id: 1, name: 'Fund A', config: { ...DEFAULT_CONFIG } }];
  });
  const [activeFundId, setActiveFundId] = useState(() => {
    const stored = localStorage.getItem('monaco_funds');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      } catch (e) {}
    }
    return 1;
  });
  const [marketScenario, setMarketScenario] = useState(() => {
    try { const g = JSON.parse(localStorage.getItem('monaco_globals')); return g?.marketScenario || 'MARKET'; } catch(e) { return 'MARKET'; }
  });
  const [numPeriods, setNumPeriods] = useState(() => {
    try { const g = JSON.parse(localStorage.getItem('monaco_globals')); return g?.numPeriods || 8; } catch(e) { return 8; }
  });
  const [numIterations, setNumIterations] = useState(() => {
    try { const g = JSON.parse(localStorage.getItem('monaco_globals')); return g?.numIterations || 3000; } catch(e) { return 3000; }
  });
  const [fundResults, setFundResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root {
        height: 100%;
        overflow: hidden;
      }
      body {
        background-color: #000000;
        color: #ffffff;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 12px;
        -webkit-font-smoothing: antialiased;
      }
      #root {
        display: flex;
        flex-direction: column;
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        height: 16px; width: 8px;
        background: #ffffff; cursor: pointer;
        border: 1px solid #000000; margin-top: -6px; border-radius: 0;
      }
      input[type=range]::-moz-range-thumb {
        height: 16px; width: 8px;
        background: #ffffff; cursor: pointer;
        border: 1px solid #000000; border-radius: 0;
      }
      input[type="text"]:focus, input[type="number"]:focus { border-color: #ffffff; }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      aside::-webkit-scrollbar { width: 4px; }
      aside::-webkit-scrollbar-track { background: transparent; }
      aside::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
      aside::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('monaco_funds', JSON.stringify(funds));
  }, [funds]);

  useEffect(() => {
    localStorage.setItem('monaco_globals', JSON.stringify({ marketScenario, numPeriods, numIterations }));
  }, [marketScenario, numPeriods, numIterations]);

  const addFund = useCallback(() => {
    if (funds.length >= 4) return;
    const usedNames = new Set(funds.map((f) => f.name));
    const name = FUND_NAMES.find((n) => !usedNames.has(n)) || `Fund ${nextFundId}`;
    const source = funds.find((f) => f.id === activeFundId) || funds[funds.length - 1];
    const newFund = { id: nextFundId++, name, config: { ...source.config } };
    setFunds((prev) => [...prev, newFund]);
    setActiveFundId(newFund.id);
  }, [funds, activeFundId]);

  const removeFund = useCallback((id) => {
    setFunds((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length === 0) return prev;
      return next;
    });
    setFundResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeFundId === id) {
      setActiveFundId((prev) => {
        const remaining = funds.filter((f) => f.id !== id);
        return remaining.length > 0 ? remaining[0].id : prev;
      });
    }
  }, [activeFundId, funds]);

  const updateConfig = useCallback((fundId, newConfig) => {
    setFunds((prev) => prev.map((f) => f.id === fundId ? { ...f, config: newConfig } : f));
  }, []);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const storedRates = localStorage.getItem('monaco_custom_graduation_rates');
      const customRates = storedRates ? JSON.parse(storedRates) : null;
      const storedVals = localStorage.getItem('monaco_custom_stage_valuations');
      const customValuations = storedVals ? JSON.parse(storedVals) : null;
      const simulations = funds.map((f) => {
        const { preseed_pct, preseed_check_size, seed_check_size, ...rest } = f.config;
        const checkSizes = {};
        const ownershipPcts = {};
        if (preseed_pct > 0) {
          checkSizes['Pre-seed'] = preseed_check_size;
          ownershipPcts['Pre-seed'] = preseed_check_size / PRESEED_VALUATION;
        }
        if (preseed_pct < 100) {
          checkSizes['Seed'] = seed_check_size;
          ownershipPcts['Seed'] = seed_check_size / SEED_VALUATION;
        }
        const cfg = {
          ...rest,
          market_scenario: marketScenario,
          num_periods: numPeriods,
          num_iterations: numIterations,
          check_sizes_at_entry: checkSizes,
          ownership_percentages_at_entry: ownershipPcts,
        };
        if (customRates && customRates[marketScenario]) {
          cfg.graduation_rates = customRates[marketScenario];
        }
        if (customValuations) {
          cfg.stage_valuations = customValuations;
        }
        return { name: f.name, config: cfg };
      });
      const response = await fetch(`${API_BASE}/api/simulate/multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulations }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Server error ${response.status}`);
      }
      const data = await response.json();
      const resultsMap = {};
      data.simulations.forEach((sim, i) => {
        resultsMap[funds[i].id] = sim;
      });
      setFundResults(resultsMap);
    } catch (err) {
      setError(err.message || 'Failed to run simulation');
    } finally {
      setLoading(false);
    }
  }, [funds, marketScenario, numPeriods, numIterations]);

  return (
    <div style={customStyles.root}>
      <Header />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Sidebar
          funds={funds}
          activeFundId={activeFundId}
          onSelectFund={setActiveFundId}
          onAddFund={addFund}
          onRemoveFund={removeFund}
          onUpdateConfig={updateConfig}
          marketScenario={marketScenario}
          onMarketScenarioChange={setMarketScenario}
          numPeriods={numPeriods}
          onNumPeriodsChange={setNumPeriods}
          numIterations={numIterations}
          onNumIterationsChange={setNumIterations}
        />

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          <Toolbar
            onRunSimulation={runSimulation}
            loading={loading}
            fundCount={funds.length}
          />

          <ErrorBanner error={error} onDismiss={() => setError(null)} />

          <div style={{ flex: 1, padding: '16px', display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', gap: '16px', overflow: 'hidden', minHeight: 0 }}>
            <DotPlot funds={funds} fundResults={fundResults} activeFundId={activeFundId} onSelectFund={setActiveFundId} />
            <ReturnFrequency funds={funds} fundResults={fundResults} activeFundId={activeFundId} />
            <KeyMetrics funds={funds} fundResults={fundResults} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
