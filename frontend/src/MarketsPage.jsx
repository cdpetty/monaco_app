import React, { useState, useEffect, useCallback } from 'react';

const MONO = "'Space Mono', 'Courier New', monospace";
const DIM = 'rgba(255, 255, 255, 0.5)';
const BORDER_DIM = '1px solid rgba(255, 255, 255, 0.3)';
const RATES_KEY = 'monaco_custom_graduation_rates';
const VALUATIONS_KEY = 'monaco_custom_stage_valuations';

const STAGES = [
  'Pre-seed', 'Seed', 'Series A', 'Series B',
  'Series C', 'Series D', 'Series E', 'Series F', 'Series G',
];

const SCENARIOS = [
  { key: 'BELOW_MARKET', label: 'Bear', color: '#f87171' },
  { key: 'MARKET', label: 'Market', color: '#ffffff' },
  { key: 'ABOVE_MARKET', label: 'Bull', color: '#4ade80' },
];

const DEFAULT_RATES = {
  BELOW_MARKET: {
    'Pre-seed': [0.45, 0.40, 0.15], 'Seed': [0.45, 0.40, 0.15],
    'Series A': [0.50, 0.35, 0.15], 'Series B': [0.50, 0.35, 0.15],
    'Series C': [0.50, 0.30, 0.20], 'Series D': [0.50, 0.30, 0.20],
    'Series E': [0.40, 0.30, 0.30], 'Series F': [0.30, 0.40, 0.20],
    'Series G': [0.0, 0.0, 0.0],
  },
  MARKET: {
    'Pre-seed': [0.50, 0.35, 0.15], 'Seed': [0.50, 0.35, 0.15],
    'Series A': [0.50, 0.30, 0.20], 'Series B': [0.50, 0.25, 0.25],
    'Series C': [0.50, 0.25, 0.25], 'Series D': [0.50, 0.25, 0.25],
    'Series E': [0.40, 0.30, 0.30], 'Series F': [0.30, 0.30, 0.30],
    'Series G': [0.0, 0.0, 0.0],
  },
  ABOVE_MARKET: {
    'Pre-seed': [0.60, 0.30, 0.10], 'Seed': [0.60, 0.30, 0.10],
    'Series A': [0.60, 0.25, 0.15], 'Series B': [0.55, 0.25, 0.20],
    'Series C': [0.55, 0.25, 0.20], 'Series D': [0.55, 0.25, 0.20],
    'Series E': [0.40, 0.30, 0.30], 'Series F': [0.30, 0.30, 0.30],
    'Series G': [0.0, 0.0, 0.0],
  },
};

const DEFAULT_VALUATIONS = {
  'Pre-seed': 15, 'Seed': 30, 'Series A': 70, 'Series B': 200,
  'Series C': 500, 'Series D': 750, 'Series E': 1500,
  'Series F': 5000, 'Series G': 10000,
};

const patternLines = {
  background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.2), rgba(255,255,255,0.2) 1px, transparent 1px, transparent 4px)`,
};

const headerRuler = {
  position: 'absolute', bottom: 0, left: 0, right: 0, height: '8px',
  background: `linear-gradient(90deg, #ffffff 1px, transparent 1px) 0 bottom / 20px 100%, linear-gradient(90deg, #ffffff 1px, transparent 1px) 0 bottom / 4px 40%`,
  backgroundRepeat: 'repeat-x',
};

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function loadRates() {
  try { const s = localStorage.getItem(RATES_KEY); if (s) return JSON.parse(s); } catch {}
  return deepClone(DEFAULT_RATES);
}

function loadValuations() {
  try { const s = localStorage.getItem(VALUATIONS_KEY); if (s) return JSON.parse(s); } catch {}
  return { ...DEFAULT_VALUATIONS };
}

function saveRates(r) { localStorage.setItem(RATES_KEY, JSON.stringify(r)); }
function saveValuations(v) { localStorage.setItem(VALUATIONS_KEY, JSON.stringify(v)); }

/* ---- Percent input (0-100 display, 0-1 stored) ---- */
const PctInput = ({ value, onChange, disabled }) => {
  const [local, setLocal] = useState(String(Math.round(value * 100)));
  useEffect(() => { setLocal(String(Math.round(value * 100))); }, [value]);
  const commit = () => {
    const n = parseInt(local, 10);
    if (!isNaN(n) && n >= 0 && n <= 100) onChange(n / 100);
    else setLocal(String(Math.round(value * 100)));
  };
  return (
    <input type="text" value={local} disabled={disabled}
      onChange={(e) => setLocal(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      style={{
        width: '36px', textAlign: 'center',
        background: disabled ? 'transparent' : 'rgba(255,255,255,0.06)',
        border: disabled ? '1px solid rgba(255,255,255,0.1)' : BORDER_DIM,
        color: disabled ? 'rgba(255,255,255,0.25)' : '#ffffff',
        fontFamily: MONO, fontSize: '11px', padding: '4px 2px', outline: 'none',
      }}
    />
  );
};

/* ---- Dollar-million input ---- */
const ValInput = ({ value, onChange }) => {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const n = parseFloat(local);
    if (!isNaN(n) && n > 0) onChange(n);
    else setLocal(String(value));
  };
  return (
    <input type="text" value={local}
      onChange={(e) => setLocal(e.target.value.replace(/[^0-9.]/g, ''))}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      style={{
        width: '72px', textAlign: 'right',
        background: 'rgba(255,255,255,0.06)', border: BORDER_DIM,
        color: '#ffffff', fontFamily: MONO, fontSize: '11px',
        padding: '4px 6px', outline: 'none',
      }}
    />
  );
};

/* ---- Section divider ---- */
const SectionTitle = ({ children }) => (
  <div style={{
    padding: '14px 12px 6px', fontFamily: MONO, fontSize: '10px',
    color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase',
    borderBottom: '1px solid #ffffff',
  }}>
    {children}
  </div>
);

/* ================================================================ */

const MarketsPage = () => {
  const [rates, setRates] = useState(loadRates);
  const [valuations, setValuations] = useState(loadValuations);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
      html, body, #root { margin:0; padding:0; height:100%; overflow:hidden;
        background:#000; color:#fff; font-family:'Space Mono','Courier New',monospace; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const updateRate = useCallback((scenario, stage, idx, v) => {
    setRates((p) => { const n = deepClone(p); n[scenario][stage][idx] = v; return n; });
    setSaved(false);
  }, []);

  const updateValuation = useCallback((stage, v) => {
    setValuations((p) => ({ ...p, [stage]: v }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    saveRates(rates); saveValuations(valuations); setSaved(true);
  }, [rates, valuations]);

  const handleReset = useCallback(() => {
    const r = deepClone(DEFAULT_RATES);
    const v = { ...DEFAULT_VALUATIONS };
    setRates(r); setValuations(v);
    saveRates(r); saveValuations(v);
    setSaved(true);
  }, []);

  const getRowSum = (scenario, stage) => {
    const r = rates[scenario][stage];
    return r[0] + r[1] + r[2];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Header */}
      <header style={{
        height: '48px', borderBottom: '1px solid #fff', display: 'flex',
        alignItems: 'center', padding: '0 16px', justifyContent: 'space-between',
        flexShrink: 0, position: 'relative',
      }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ ...patternLines, width: '24px', height: '24px', border: '1px solid #fff' }} />
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: MONO, fontWeight: 700 }}>
            Monte Carlo / Market Inputs
          </span>
        </div>
        <a href="#/" style={{ fontFamily: MONO, color: DIM, fontSize: '10px', textDecoration: 'none', border: BORDER_DIM, padding: '4px 10px', letterSpacing: '0.05em' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = DIM; }}
        >BACK TO SIMULATOR</a>
        <div style={headerRuler} />
      </header>

      {/* Toolbar */}
      <div style={{
        height: '52px', borderBottom: '1px solid #fff', display: 'flex',
        alignItems: 'center', padding: '0 16px', gap: '12px', flexShrink: 0,
      }}>
        <button onClick={handleSave} style={{
          fontFamily: MONO, fontSize: '11px', fontWeight: 700,
          background: saved ? 'rgba(255,255,255,0.1)' : '#fff',
          color: saved ? DIM : '#000',
          border: '1px solid #fff', padding: '6px 16px',
          cursor: 'pointer', letterSpacing: '0.05em',
        }}>
          {saved ? 'SAVED' : 'SAVE CHANGES'}
        </button>
        <button onClick={handleReset} style={{
          fontFamily: MONO, fontSize: '11px', background: 'transparent', color: DIM,
          border: BORDER_DIM, padding: '6px 16px', cursor: 'pointer', letterSpacing: '0.05em',
        }}>
          RESET DEFAULTS
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>

        {/* ---- Stage Valuations ---- */}
        <SectionTitle>Stage Valuations ($M)</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: '11px' }}>
          <thead>
            <tr>
              {STAGES.map((s) => (
                <th key={s} style={{
                  padding: '8px 6px', fontWeight: 700, fontSize: '9px',
                  color: DIM, letterSpacing: '0.04em', textAlign: 'center',
                  borderBottom: BORDER_DIM, whiteSpace: 'nowrap',
                }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {STAGES.map((s) => (
                <td key={s} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: BORDER_DIM }}>
                  <ValInput value={valuations[s]} onChange={(v) => updateValuation(s, v)} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* ---- Graduation Rates ---- */}
        <SectionTitle>Graduation Rates (%) &mdash; Promote / Fail / M&A</SectionTitle>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: '11px',
          minWidth: '780px',
        }}>
          <thead>
            <tr>
              <th style={{ ...thBase, width: '100px', borderBottom: '1px solid #fff' }} />
              {SCENARIOS.map((s) => (
                <th key={s.key} colSpan={4} style={{
                  ...thBase, borderBottom: `2px solid ${s.color}`, color: s.color,
                  fontWeight: 700, fontSize: '11px', letterSpacing: '0.05em',
                  textAlign: 'center', padding: '10px 8px',
                }}>
                  {s.label.toUpperCase()}
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ ...thBase, textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid #fff' }}>STAGE</th>
              {SCENARIOS.map((s) => (
                <React.Fragment key={s.key}>
                  <th style={{ ...subTh, color: s.color }}>PRO</th>
                  <th style={{ ...subTh, color: s.color }}>FAIL</th>
                  <th style={{ ...subTh, color: s.color }}>M&A</th>
                  <th style={{ ...subTh, color: s.color, fontSize: '8px', minWidth: '30px' }}>&Sigma;</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => {
              const isTerminal = stage === 'Series G';
              return (
                <tr key={stage} style={{ background: isTerminal ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{
                    padding: '6px 12px', borderBottom: BORDER_DIM,
                    color: isTerminal ? DIM : '#fff',
                    fontWeight: isTerminal ? 'normal' : 700,
                    fontSize: '10px', letterSpacing: '0.03em', whiteSpace: 'nowrap',
                  }}>
                    {stage}
                  </td>
                  {SCENARIOS.map((s) => {
                    const sum = getRowSum(s.key, stage);
                    const sumOk = Math.abs(sum - 1.0) < 0.005;
                    return (
                      <React.Fragment key={s.key}>
                        {[0, 1, 2].map((idx) => (
                          <td key={idx} style={{ padding: '4px 4px', borderBottom: BORDER_DIM, textAlign: 'center' }}>
                            <PctInput
                              value={rates[s.key][stage][idx]}
                              onChange={(v) => updateRate(s.key, stage, idx, v)}
                              disabled={isTerminal}
                            />
                          </td>
                        ))}
                        <td style={{
                          padding: '4px 6px', borderBottom: BORDER_DIM, textAlign: 'center', fontSize: '10px',
                          color: isTerminal ? 'rgba(255,255,255,0.2)' : sumOk ? 'rgba(255,255,255,0.3)' : '#f87171',
                          fontWeight: sumOk ? 'normal' : 700,
                        }}>
                          {Math.round(sum * 100)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{
          padding: '20px 16px', fontFamily: MONO, fontSize: '9px',
          color: DIM, letterSpacing: '0.05em', lineHeight: '1.8',
        }}>
          <div>PRO = probability of promoting to the next stage</div>
          <div>FAIL = probability of company failure (valuation &rarr; 0)</div>
          <div>M&A = probability of acquisition exit</div>
          <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.3)' }}>
            Note: The simulation uses M&A and FAIL rates directly. The effective promote rate is 1 &minus; FAIL &minus; M&A.
            Rows that don&apos;t sum to 100 will still work but the promote rate shown may differ from the effective rate.
          </div>
          <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.3)' }}>
            Valuations determine the company price at each stage. They affect ownership calculations,
            pro-rata investment amounts, and final portfolio value.
          </div>
        </div>
      </div>
    </div>
  );
};

const thBase = {
  fontFamily: "'Space Mono','Courier New',monospace",
  fontSize: '10px', color: 'rgba(255,255,255,0.5)',
  fontWeight: 'normal', letterSpacing: '0.05em', textTransform: 'uppercase',
};

const subTh = {
  fontFamily: "'Space Mono','Courier New',monospace",
  fontSize: '9px', fontWeight: 'normal', letterSpacing: '0.05em',
  textTransform: 'uppercase', padding: '6px 4px',
  borderBottom: '1px solid rgba(255,255,255,0.3)',
  textAlign: 'center', minWidth: '44px',
};

export default MarketsPage;
