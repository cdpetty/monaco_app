# Monaco Simulation - Quick Reference Guide

## 60-Second Summary

Monaco is a venture fund simulation tool that:
1. Takes fund parameters (size, allocation, check sizes)
2. Runs 3,000-10,000 Monte Carlo simulations
3. For each simulation: creates a portfolio, runs it through 8 time periods, randomly determines company outcomes
4. Returns performance metrics (MOIC, percentiles) and portfolio statistics
5. Compares multiple investment strategies

---

## Key Classes at a Glance

| Class | Purpose | Key Methods |
|-------|---------|-------------|
| **Company** | Single portfolio company | promote(), m_and_a(), fail(), get_firm_value() |
| **Firm** | Fund with portfolio | initialize_portfolio(), get_MoM(), get_total_value_of_portfolio() |
| **Montecarlo** | Simulation engine | initialize_scenarios(), simulate(), get_MoM_return_outcomes() |
| **Montecarlo_Sim_Configuration** | Config holder | make_minor_round_size_adjustments_for_modeling() |
| **Experiment** | Strategy orchestrator | generate_montecarlo_configurations(), run_montecarlo(), visualize_multiple_strategies() |

---

## Main Entry Points

### Running a Single Simulation
```python
from Monaco import Experiment, Montecarlo_Sim_Configuration

experiment = Experiment()
config = Montecarlo_Sim_Configuration(
    stages=['Pre-seed', 'Seed', ..., 'Series G'],
    graduation_rates=MARKET,
    stage_dilution=DEFAULT_STAGE_DILUTION,
    stage_valuations=DEFAULT_STAGE_VALUATIONS,
    lifespan_periods=8,
    lifespan_years=13,
    primary_investments={'Pre-seed': 85, 'Seed': 85},
    initial_investment_sizes={'Pre-seed': 1.5, 'Seed': 4.0},
    follow_on_reserve=30,
    fund_size=200,
    pro_rata_at_or_below=70,
    num_scenarios=3000
)

montecarlo = Montecarlo(config)
montecarlo.initialize_scenarios()
montecarlo.simulate()

results = experiment.get_simulation_outcome(montecarlo)
experiment.run_single_simulation_and_visualize(config)
```

### Comparing Multiple Strategies
```python
config_options = {
    'stages': DEFAULT_STAGES,
    'graduation_rates': [MARKET, ABOVE_MARKET, BELOW_MARKET],
    'stage_dilution': DEFAULT_STAGE_DILUTION,
    'stage_valuations': DEFAULT_STAGE_VALUATIONS,
    'lifespan_periods': 8,
    'lifespan_years': 13,
    'primary_investments': [
        {'Pre-seed': 0, 'Seed': 170},
        {'Pre-seed': 85, 'Seed': 85},
        {'Pre-seed': 170, 'Seed': 0}
    ],
    'initial_investment_sizes': {'Pre-seed': 1.5, 'Seed': 4.0},
    'follow_on_reserve': 30,
    'fund_size': 200,
    'pro_rata_at_or_below': 70,
    'num_scenarios': 3000
}

configs = experiment.generate_montecarlo_configurations(config_options)
results = experiment.simulate_multiple_firm_strategies(configs)
experiment.visualize_multiple_strategies(results)
```

---

## Key Parameters Quick Lookup

### Fund Size
- **Typical Range**: $40M - $300M
- **Impact**: Larger funds = more portfolio diversification
- **Default**: $200M

### Follow-on Reserve
- **Typical Range**: $0M - $100M (usually 15-30% of fund)
- **Impact**: More reserve = more pro-rata participation, but fewer initial companies
- **Default**: $30M

### Check Size (Initial Investment Size)
- **Pre-seed Range**: $0.5M - $3.0M
- **Seed Range**: $1.0M - $6.0M
- **Impact**: Smaller checks = more companies but lower ownership per company
- **Default**: Pre-seed: $1.5M, Seed: $4.0M

### Pro-rata Threshold
- **Typical Range**: $30M - $200M (valuation at which pro-rata ends)
- **Impact**: Higher threshold = fund invests in more rounds
- **Default**: $70M

### Market Condition
- **MARKET**: Baseline (50% advance, 35% fail, 15% M&A at early stages)
- **ABOVE_MARKET**: 60% advance, 30% fail, 10% M&A (better for LP returns)
- **BELOW_MARKET**: 45% advance, 40% fail, 15% M&A (worse for LP returns)

### Number of Scenarios
- **1,000**: Quick testing (~2-3 seconds)
- **3,000**: Balanced (~5-8 seconds)
- **10,000**: Robust (~15-25 seconds)

---

## Key Output Metrics Quick Lookup

| Metric | Meaning | Good Value |
|--------|---------|-----------|
| **MOIC** | Multiple on Invested Capital = Total Value / Capital Deployed | 1.5x - 3.0x |
| **25th Percentile** | Worst 25% of outcomes | 0.5x - 1.0x |
| **50th Percentile** | Median outcome | 1.0x - 2.0x |
| **75th Percentile** | Strong outcomes | 1.5x - 3.0x |
| **90th Percentile** | Best 10% of outcomes | 2.5x - 5.0x+ |
| **Alive Companies %** | Still private | 30-50% |
| **Acquired Companies %** | Successful exits | 20-40% |
| **Failed Companies %** | Total loss | 20-40% |
| **Avg Ownership %** | Fund's diluted ownership | 5-15% per company |

---

## Visualization Outputs

### 1. Percentile Line Chart
- **X-axis**: Different strategies
- **Y-axis**: MOIC (0x - 10x)
- **Lines**: 25th, 50th, 75th, 90th percentiles
- **Shading**: Red area between 75th-90th percentiles

### 2. Distribution Histogram
- **X-axis**: MOIC bins (0x, 1x, 2x, ..., 10x+)
- **Y-axis**: Percentage of simulations
- **Vertical Lines**: Percentiles marked

### 3. Results Table
- **Rows**: Each simulation scenario
- **Columns**: MOIC, companies by stage, outcomes, values

---

## Common Scenarios to Model

### Scenario 1: All Pre-Seed Fund
```
primary_investments: {'Pre-seed': 170}
follow_on_reserve: 30
```
Result: Smaller ownership per company, longer fund life needed

### Scenario 2: Balanced 50/50
```
primary_investments: {'Pre-seed': 85, 'Seed': 85}
follow_on_reserve: 30
```
Result: Mixed portfolio, moderate risk/return

### Scenario 3: All Seed Fund
```
primary_investments: {'Seed': 170}
follow_on_reserve: 30
```
Result: Larger ownership per company, shorter fund life

### Scenario 4: Lower Check Sizes (More Companies)
```
initial_investment_sizes: {'Pre-seed': 1.0, 'Seed': 2.0}
```
Result: More portfolio companies, lower individual ownership

### Scenario 5: Larger Check Sizes (Fewer Companies)
```
initial_investment_sizes: {'Pre-seed': 2.5, 'Seed': 5.0}
```
Result: Fewer portfolio companies, higher individual ownership

### Scenario 6: High Pro-rata Reserve
```
follow_on_reserve: 60
pro_rata_at_or_below: 200
```
Result: Fund participates in many follow-ons, fewer initial companies

---

## Troubleshooting Common Issues

### Issue: "Total primary investment plus follow-on reserve does not equal fund size"
**Cause**: Your allocations don't sum to fund_size
**Fix**: Ensure `primary_investments.values().sum() + follow_on_reserve == fund_size`

### Issue: Simulations are very slow
**Cause**: Too many scenarios or large portfolio
**Fix**: Start with 1,000 scenarios, scale up once validated

### Issue: All companies fail
**Cause**: Using BELOW_MARKET graduation rates exclusively
**Fix**: Mix market conditions or use MARKET/ABOVE_MARKET

### Issue: MOIC consistently 1.0x (breakeven)
**Cause**: Only getting breakeven M&A outcomes
**Fix**: Increase scenarios to see distribution, or adjust market conditions

---

## Web App Implementation Priorities

### Must Have (MVP)
1. Fund size slider
2. Follow-on reserve slider
3. Pre-seed/Seed allocation sliders
4. Market condition selector (MARKET/ABOVE_MARKET/BELOW_MARKET)
5. Run simulation button
6. Display MOIC percentiles
7. Simple bar chart of outcomes

### Should Have (Phase 2)
1. Check size inputs
2. Pro-rata threshold input
3. Number of scenarios input
4. Interactive Plotly charts
5. Comparison of multiple strategies
6. Export to CSV

### Nice to Have (Phase 3+)
1. Custom graduation rates builder
2. Custom stage valuation builder
3. Batch processing
4. Saved scenarios database
5. Sensitivity analysis heatmaps
6. Mobile responsive design

---

## Data Dictionaries

### Input Configuration
```python
{
    'fund_size': float,                          # Total capital
    'follow_on_reserve': float,                  # Allocated for follow-ons
    'pro_rata_at_or_below': float,               # Valuation threshold
    'primary_investments': {'stage': amount},    # Initial allocations
    'initial_investment_sizes': {'stage': size}, # Check sizes
    'graduation_rates': {stage: [advance%, fail%, m_and_a%]},
    'stage_valuations': {'stage': valuation},    # Post-money values
    'stage_dilution': {'stage': dilution%},      # Ownership dilution
    'num_scenarios': int,                        # Monte Carlo runs
    'lifespan_periods': int,                     # Time periods
    'lifespan_years': int                        # Total fund life
}
```

### Output Results
```python
{
    'fund_size': float,
    'follow_on_reserve': float,
    'pro_rata_at_or_below': float,
    'Pre-seed_investment_amount': float,
    'Seed_investment_amount': float,
    'Pre-seed_total_invested': float,
    'Seed_total_invested': float,
    'Pre-seed_avg_ownership': float,
    'Seed_avg_ownership': float,
    'overall_avg_ownership': float,
    'avg_portfolio_size': float,
    'total_portfolio_companies': int,
    '{stage}_companies': int,                    # For each stage
    'Alive Companies': int,
    'Failed Companies': int,
    'Acquired Companies': int,
    'Pro Rata Companies': int,
    'No Pro Rata Companies': int,
    '25th_percentile': float,
    '50th_percentile': float,
    '75th_percentile': float,
    '90th_percentile': float,
    'total_MOIC': float,
    'total_value_acquired': float,
    'total_value_alive': float
}
```

---

## Performance Baseline

- 1 simulation with 3,000 scenarios: ~5-8 seconds
- 3 simulations with 3,000 scenarios each: ~15-20 seconds
- 10 simulations with 3,000 scenarios each: ~50-70 seconds

### Optimization Tips
1. Use 1,000 scenarios for UI testing
2. Cache results for identical configs
3. Run expensive comparisons async
4. Display partial results as they complete

