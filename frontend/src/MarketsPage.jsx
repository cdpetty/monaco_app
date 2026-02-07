import React, { useState, useEffect, useCallback } from 'react';

const MONO = "'JetBrains Mono', monospace";
const DIM = '#999';
const BORDER_DIM = '1px solid rgba(0, 0, 0, 0.15)';
const RATES_KEY = 'monaco_custom_graduation_rates';
const VALUATIONS_KEY = 'monaco_custom_stage_valuations';
const MNA_KEY = 'monaco_custom_mna_outcomes';

const STAGES = [
  'Pre-seed', 'Seed', 'Series A', 'Series B',
  'Series C', 'Series D', 'Series E', 'Series F', 'Series G',
];

const SCENARIOS = [
  { key: 'BELOW_MARKET', label: 'Bear', color: '#dc2626' },
  { key: 'MARKET', label: 'Average', color: '#000000' },
  { key: 'ABOVE_MARKET', label: 'Bull', color: '#16a34a' },
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

const DEFAULT_MNA_OUTCOMES = [
  { pct: 0.01, multiple: 10, label: 'Outsized' },
  { pct: 0.05, multiple: 5, label: 'Strong' },
  { pct: 0.60, multiple: 1, label: 'Neutral' },
  { pct: 0.34, multiple: 0.1, label: 'Fire Sale' },
];

const patternLines = {
  background: `repeating-linear-gradient(45deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 4px)`,
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

function loadMnaOutcomes() {
  try { const s = localStorage.getItem(MNA_KEY); if (s) return JSON.parse(s); } catch {}
  return deepClone(DEFAULT_MNA_OUTCOMES);
}

function saveRates(r) { localStorage.setItem(RATES_KEY, JSON.stringify(r)); }
function saveValuations(v) { localStorage.setItem(VALUATIONS_KEY, JSON.stringify(v)); }
function saveMnaOutcomes(m) { localStorage.setItem(MNA_KEY, JSON.stringify(m)); }

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
        background: disabled ? '#f5f5f5' : '#fff',
        border: disabled ? '1px solid rgba(0,0,0,0.1)' : '1px solid #000',
        color: disabled ? '#ccc' : '#000',
        fontFamily: MONO, fontSize: '11px', padding: '4px 2px', outline: 'none',
        borderRadius: 0,
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
        background: '#fff', border: '1px solid #000',
        color: '#000', fontFamily: MONO, fontSize: '11px',
        padding: '4px 6px', outline: 'none', borderRadius: 0,
      }}
    />
  );
};

/* ---- Multiplier input (e.g. 10, 5, 1, 0.1) ---- */
const MultInput = ({ value, onChange }) => {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const n = parseFloat(local);
    if (!isNaN(n) && n >= 0) onChange(n);
    else setLocal(String(value));
  };
  return (
    <input type="text" value={local}
      onChange={(e) => setLocal(e.target.value.replace(/[^0-9.]/g, ''))}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      style={{
        width: '52px', textAlign: 'center',
        background: '#fff', border: '1px solid #000',
        color: '#000', fontFamily: MONO, fontSize: '11px',
        padding: '4px 2px', outline: 'none', borderRadius: 0,
      }}
    />
  );
};

/* ---- Section divider ---- */
const SectionTitle = ({ children }) => (
  <div style={{
    padding: '14px 12px 6px', fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px',
    color: '#000', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
    borderBottom: '1px solid #000',
  }}>
    {children}
  </div>
);

/* ================================================================ */

const MarketsPage = () => {
  const [rates, setRates] = useState(loadRates);
  const [valuations, setValuations] = useState(loadValuations);
  const [mnaOutcomes, setMnaOutcomes] = useState(loadMnaOutcomes);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const linkFont = document.createElement('link');
    linkFont.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    linkFont.rel = 'stylesheet';
    document.head.appendChild(linkFont);
    const style = document.createElement('style');
    style.textContent = `
      html, body, #root { margin:0; padding:0; height:100%; overflow:hidden;
        background:#fff; color:#000; font-family:'Barlow Condensed', sans-serif; }
      * { box-sizing: border-box; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(linkFont); document.head.removeChild(style); };
  }, []);

  const updateRate = useCallback((scenario, stage, idx, v) => {
    setRates((p) => { const n = deepClone(p); n[scenario][stage][idx] = v; return n; });
    setSaved(false);
  }, []);

  const updateValuation = useCallback((stage, v) => {
    setValuations((p) => ({ ...p, [stage]: v }));
    setSaved(false);
  }, []);

  const updateMnaOutcome = useCallback((idx, field, v) => {
    setMnaOutcomes((p) => { const n = deepClone(p); n[idx][field] = v; return n; });
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    saveRates(rates); saveValuations(valuations); saveMnaOutcomes(mnaOutcomes); setSaved(true);
  }, [rates, valuations, mnaOutcomes]);

  const handleReset = useCallback(() => {
    const r = deepClone(DEFAULT_RATES);
    const v = { ...DEFAULT_VALUATIONS };
    const m = deepClone(DEFAULT_MNA_OUTCOMES);
    setRates(r); setValuations(v); setMnaOutcomes(m);
    saveRates(r); saveValuations(v); saveMnaOutcomes(m);
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
        height: '48px', borderBottom: '2px solid #000', display: 'flex',
        alignItems: 'center', padding: '0 20px', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ ...patternLines, width: '24px', height: '24px', border: '1px solid #000' }} />
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, fontSize: '15px' }}>
            Market Data
          </span>
        </div>
        <a href="#/" style={{ fontFamily: MONO, color: DIM, fontSize: '11px', textDecoration: 'none', border: '1px solid #000', padding: '6px 14px', letterSpacing: '0.03em', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#000'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DIM; }}
        >BACK TO SIMULATOR</a>
      </header>

      {/* Toolbar */}
      <div style={{
        height: '52px', borderBottom: '1px solid #000', display: 'flex',
        alignItems: 'center', padding: '0 20px', gap: '12px', flexShrink: 0,
      }}>
        <button onClick={handleSave} style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', fontWeight: 600,
          background: saved ? 'transparent' : '#000',
          color: saved ? DIM : '#fff',
          border: '1px solid #000', padding: '8px 20px',
          cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {saved ? 'SAVED' : 'SAVE CHANGES'}
        </button>
        <button onClick={handleReset} style={{
          fontFamily: "'Barlow Condensed', sans-serif", fontSize: '13px', fontWeight: 600,
          background: 'transparent', color: DIM,
          border: BORDER_DIM, padding: '8px 20px', cursor: 'pointer',
          letterSpacing: '0.08em', textTransform: 'uppercase',
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
              <th style={{ ...thBase, width: '100px', borderBottom: '1px solid #000' }} />
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
              <th style={{ ...thBase, textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid #000' }}>STAGE</th>
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
                <tr key={stage} style={{ background: isTerminal ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                  <td style={{
                    padding: '6px 12px', borderBottom: BORDER_DIM,
                    color: isTerminal ? DIM : '#000',
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
                          color: isTerminal ? '#ddd' : sumOk ? '#ccc' : '#dc2626',
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

        {/* ---- M&A Exit Outcomes ---- */}
        <SectionTitle>M&A Exit Outcomes</SectionTitle>
        <table style={{ borderCollapse: 'collapse', fontFamily: MONO, fontSize: '11px', margin: '0 12px' }}>
          <thead>
            <tr>
              <th style={{ ...subTh, textAlign: 'left', padding: '8px 12px 6px 0' }}>TIER</th>
              <th style={{ ...subTh, textAlign: 'center', padding: '8px 12px 6px' }}>% OF M&A</th>
              <th style={{ ...subTh, textAlign: 'center', padding: '8px 12px 6px' }}>MULTIPLE</th>
              <th style={{ ...subTh, textAlign: 'left', padding: '8px 12px 6px' }}>DESCRIPTION</th>
            </tr>
          </thead>
          <tbody>
            {mnaOutcomes.map((tier, idx) => {
              const mnaSum = mnaOutcomes.reduce((s, t) => s + t.pct, 0);
              const sumOk = Math.abs(mnaSum - 1.0) < 0.005;
              return (
                <tr key={idx}>
                  <td style={{ padding: '4px 12px 4px 0', borderBottom: BORDER_DIM, fontWeight: 700, fontSize: '10px' }}>
                    {tier.label || `Tier ${idx + 1}`}
                  </td>
                  <td style={{ padding: '4px 12px', borderBottom: BORDER_DIM, textAlign: 'center' }}>
                    <PctInput value={tier.pct} onChange={(v) => updateMnaOutcome(idx, 'pct', v)} />
                  </td>
                  <td style={{ padding: '4px 12px', borderBottom: BORDER_DIM, textAlign: 'center' }}>
                    <MultInput value={tier.multiple} onChange={(v) => updateMnaOutcome(idx, 'multiple', v)} />
                  </td>
                  <td style={{ padding: '4px 12px', borderBottom: BORDER_DIM, fontSize: '10px', color: DIM }}>
                    {Math.round(tier.pct * 100)}% chance of {tier.multiple}x valuation at exit
                  </td>
                </tr>
              );
            })}
            <tr>
              <td style={{ padding: '4px 12px 4px 0', fontSize: '10px', fontWeight: 600 }}>&Sigma;</td>
              <td style={{ padding: '4px 12px', textAlign: 'center', fontSize: '10px',
                color: Math.abs(mnaOutcomes.reduce((s, t) => s + t.pct, 0) - 1.0) < 0.005 ? '#ccc' : '#dc2626',
                fontWeight: Math.abs(mnaOutcomes.reduce((s, t) => s + t.pct, 0) - 1.0) < 0.005 ? 'normal' : 700,
              }}>
                {Math.round(mnaOutcomes.reduce((s, t) => s + t.pct, 0) * 100)}%
              </td>
              <td colSpan={2} />
            </tr>
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
          <div style={{ marginTop: '8px', color: '#ccc' }}>
            Note: The simulation uses M&A and FAIL rates directly. The effective promote rate is 1 &minus; FAIL &minus; M&A.
            Rows that don&apos;t sum to 100 will still work but the promote rate shown may differ from the effective rate.
          </div>
          <div style={{ marginTop: '4px', color: '#ccc' }}>
            Valuations determine the company price at each stage. They affect ownership calculations,
            pro-rata investment amounts, and final portfolio value.
          </div>
          <div style={{ marginTop: '4px', color: '#ccc' }}>
            M&amp;A outcomes control what happens when a company is acquired. Each tier has a probability
            and a valuation multiple applied at exit.
          </div>
        </div>
      </div>
    </div>
  );
};

const thBase = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '10px', color: '#999',
  fontWeight: 'normal', letterSpacing: '0.05em', textTransform: 'uppercase',
};

const subTh = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '9px', fontWeight: 'normal', letterSpacing: '0.05em',
  textTransform: 'uppercase', padding: '6px 4px',
  borderBottom: '1px solid rgba(0,0,0,0.15)',
  textAlign: 'center', minWidth: '44px',
};

export default MarketsPage;
