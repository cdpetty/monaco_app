// Pre-compute simulation results for the named fund-size presets and write them to
// frontend/public/preset-results.json. The app loads this file when a ?preset=… link
// is opened so the comparison page shows results instantly (no waiting for a sim run);
// users can still hit "RUN ALL SIMULATIONS" to recompute live.
//
// Usage:  node scripts/gen-preset-cache.mjs [apiBase]
//   apiBase defaults to http://127.0.0.1:8077 (a locally running backend).
//
// IMPORTANT: the preset definitions and buildPayload() below MUST mirror App.jsx
// (fundStrategies / PRESETS / buildSimPayload). If those change, re-run this script.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API_BASE = process.argv[2] || 'http://127.0.0.1:8077';
const MARKET_SCENARIO = 'MARKET';
const ITERATIONS = 7000; // must match COMPARISON_ITERATIONS in App.jsx

// ── valuations + presets: mirror of App.jsx ─────────────────────────────────
const DEFAULT_STAGE_VALUATIONS = { 'Pre-seed': 15, 'Seed': 30, 'Series A': 70, 'Series B': 200 };

const presetCfg = (fund_size_m, reserve, pro_rata, stage_allocations) => ({
  fund_size_m,
  management_fee_pct: 2,
  fee_duration_years: 10,
  recycled_capital_pct: 20,
  dry_powder_reserve_for_pro_rata: reserve,
  reinvest_unused_reserve: true,
  pro_rata_max_valuation: pro_rata,
  stage_allocations,
});

// Checks = ownership × stage valuations (Pre-seed $15M, Seed $30M) so each tier is
// exactly 2.5/5/10% at both stages. Must match OWNERSHIP_TIERS in App.jsx.
const OWNERSHIP_TIERS = [
  { label: '2.5%', ps: 0.375, seed: 0.75 },
  { label: '5%',   ps: 0.75,  seed: 1.5 },
  { label: '10%',  ps: 1.5,   seed: 3.0 },
];
const RESERVE_TIERS = [25, 50];

const fundStrategies = (fund, allocation) =>
  OWNERSHIP_TIERS.flatMap((own, oi) =>
    RESERVE_TIERS.map((reserve, ri) => ({
      name: `#${oi * RESERVE_TIERS.length + ri + 1} ${own.label} Ownership / ${reserve}% Reserve`,
      config: presetCfg(fund, reserve, 2000, allocation(own)),
    }))
  );

const preseedOnly     = (own) => [{ stage: 'Pre-seed', pct: 100, check_size: own.ps }];
const preseedSeed6040 = (own) => [
  { stage: 'Pre-seed', pct: 60, check_size: own.ps },
  { stage: 'Seed',     pct: 40, check_size: own.seed },
];

const PRESETS = {
  '30m':  fundStrategies(30,  preseedOnly),
  '100m': fundStrategies(100, preseedSeed6040),
  '200m': fundStrategies(200, preseedSeed6040),
};

// ── buildSimPayload: mirror of App.jsx (no localStorage custom overrides) ────
function buildPayload(config) {
  const { stage_allocations, ...rest } = config;
  const valuations = DEFAULT_STAGE_VALUATIONS;
  const checkSizes = {}, ownershipPcts = {}, allocationPcts = {};
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
  return {
    ...rest,
    market_scenario: MARKET_SCENARIO,
    num_periods: 8,
    num_iterations: ITERATIONS,
    check_sizes_at_entry: checkSizes,
    ownership_percentages_at_entry: ownershipPcts,
    stage_allocation_pcts: allocationPcts,
  };
}

const round3 = (x) => Math.round(x * 1000) / 1000;

async function runPreset(key) {
  const strategies = PRESETS[key];
  const sims = strategies.map((s) => ({ name: s.name, config: buildPayload(s.config) }));
  const res = await fetch(`${API_BASE}/api/simulate/multiple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ simulations: sims }),
  });
  if (!res.ok) throw new Error(`${key}: server ${res.status} — ${await res.text()}`);
  const data = await res.json();
  // Strip the redundant tvpi_distribution (backend sets it === moic_distribution; the
  // app reconstructs it on load) and round the distribution to keep the file small.
  return data.simulations.map((sim) => ({
    name: sim.name,
    config: sim.config,
    results: sim.results,
    moic_distribution: (sim.moic_distribution || []).map(round3),
  }));
}

const out = {};
for (const key of Object.keys(PRESETS)) {
  process.stdout.write(`Running preset ${key} (${PRESETS[key].length} strategies × ${ITERATIONS} iters)… `);
  out[key] = await runPreset(key);
  const med = out[key].map((s) => `${s.results.median_moic?.toFixed(2)}x`).join(', ');
  console.log(`done. median MOIC: ${med}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'preset-results.json');
writeFileSync(outPath, JSON.stringify(out));
const bytes = JSON.stringify(out).length;
console.log(`\nWrote ${outPath} (${(bytes / 1024).toFixed(0)} KB, scenario=${MARKET_SCENARIO}, N=${ITERATIONS})`);
