# Monaco Venture Fund Simulation - Comprehensive Analysis

## PROJECT OVERVIEW
Monaco is a Monte Carlo simulation engine for venture fund performance analysis. It models the lifecycle of a venture fund portfolio from initial investments through exits (M&A, acquisitions, or failures), allowing founders and fund managers to test various investment strategies.

---

## 1. BUSINESS LOGIC / SIMULATION CORE

### What the Simulation Does:
1. Creates a virtual venture fund with specified capital allocation
2. Initializes a portfolio of companies at specified investment stages (Pre-seed, Seed, Series A-G)
3. Runs the portfolio through multiple time periods (typically 8 periods over 13 years)
4. For each company in each period:
   - Randomly determines outcome: company advances to next stage, gets acquired (M&A), or fails
   - Applies outcome-specific effects (dilution, valuation updates, pro-rata investments)
   - Tracks fund's follow-on reserve capital consumption
5. Aggregates results across multiple scenarios (typically 3,000-10,000 simulations)
6. Calculates fund performance metrics (MOIC, percentiles, portfolio composition)

### Core Simulation Flow:
```
Initialize Fund
  ↓
Create Portfolio (based on primary investment strategy)
  ↓
For each Period (1-8):
  ├─ For each Company in Portfolio:
  │  ├─ If Alive: Randomly determine outcome
  │  │  ├─ M&A outcome: Apply multiplier (0.1x, 1x, 5x, 10x)
  │  │  ├─ Failure: Set valuation to $0
  │  │  └─ Next Stage: Promote, apply dilution, make pro-rata investment if reserves available
  │  └─ Update snapshots
  ├─ Deploy remaining capital as additional primary investments
  └─ Continue to next period
  ↓
Calculate Returns (MOIC, percentiles, quartiles)
```

---

## 2. KEY INPUT PARAMETERS (CONFIGURABLE)

### Fund Structure Parameters:
| Parameter | Type | Example Values | Purpose |
|-----------|------|-----------------|---------|
| `fund_size` | Float | 40-300 (millions) | Total capital available in fund |
| `follow_on_reserve` | Float | 0-100 | Capital reserved for follow-on investments |
| `pro_rata_at_or_below` | Float | 30-200 | Valuation threshold for pro-rata investments |
| `num_scenarios` | Integer | 1000-10000 | Number of Monte Carlo simulations |

### Investment Strategy Parameters:
| Parameter | Type | Example | Purpose |
|-----------|------|---------|---------|
| `primary_investments` | Dict | {'Pre-seed': 170, 'Seed': 0} | Capital deployed at each stage |
| `initial_investment_sizes` | Dict | {'Pre-seed': 1.5, 'Seed': 4.0} | Check size for each investment |
| `stages` | List | ['Pre-seed', 'Seed', ..., 'Series G'] | Investment stages to track |

### Market/Outcome Parameters:
| Parameter | Type | Example | Purpose |
|-----------|------|---------|---------|
| `graduation_rates` | Dict | {'Pre-seed': [0.5, 0.35, 0.15]} | [advance, fail, M&A] probabilities |
| `stage_valuations` | Dict | {'Pre-seed': 15, 'Seed': 30} | Post-money valuation ($M) at each stage |
| `stage_dilution` | Dict | {'Seed': 0.20, 'Series A': 0.22} | Ownership dilution % at each stage |
| `lifespan_periods` | Integer | 8 | Number of time periods to simulate |
| `lifespan_years` | Integer | 13 | Total fund lifespan in years |

### Pre-defined Market Conditions:
1. **MARKET** - Baseline market conditions
   - Pre-seed: 50% advance, 35% fail, 15% M&A
   - Seed: 50% advance, 35% fail, 15% M&A
   - Series stages: Decreasing advance rates (50%→30%), increasing M&A rates
   
2. **ABOVE_MARKET** - Superior market conditions (higher advance rates)
3. **BELOW_MARKET** - Weaker market conditions (higher failure rates)

---

## 3. CORE DATA STRUCTURES & CLASSES

### Company Class
Represents a single portfolio company.

**Key Attributes:**
- `name`: Company identifier
- `stage`: Current investment stage ('Pre-seed', 'Seed', etc.)
- `valuation`: Post-money valuation ($M)
- `state`: 'Alive', 'Failed', or 'Acquired'
- `firm_invested_capital`: Total capital invested by fund
- `firm_ownership`: Fund's ownership percentage
- `age`: Number of rounds/periods survived
- `market_constraints`: Reference to stage valuations, dilution, probabilities
- `initial_stage`: Tracking for reporting
- `did_pro_rata`: Binary flag if pro-rata was exercised

**Key Methods:**
- `promote()`: Advance company to next stage, apply dilution, execute pro-rata
- `m_and_a()`: Mark as acquired with outcome multiplier
- `fail()`: Mark as failed
- `get_firm_value()`: Calculate current value = valuation × ownership
- `get_numerical_stage()`: Get stage index

### Firm Class
Represents a venture fund with its portfolio.

**Key Attributes:**
- `name`: Fund name
- `portfolio`: List of Company objects
- `primary_capital_deployed`: Capital invested in initial companies
- `follow_on_capital_deployed`: Capital invested in follow-on rounds
- `follow_on_reserve`: Capital reserved for secondary investments
- `fund_size`: Total fund capital
- `firm_lifespan_years`: Fund life expectancy
- `period_snapshots`: Historical portfolio snapshots

**Key Methods:**
- `initialize_portfolio()`: Create initial companies
- `get_total_value_of_portfolio()`: Sum of all company values
- `get_MoM()`: Multiple on invested capital = total value / capital deployed
- `get_detailed_portfolio_snapshot()`: Count of companies by stage/state

### Montecarlo Class
Engine for running simulations.

**Key Methods:**
- `initialize_scenarios()`: Create multiple Firm instances
- `simulate()`: Run all scenarios through time periods
- `get_MoM_return_outcomes()`: Array of MOIC for each scenario
- `get_total_companies_by_stage()`: Aggregated company counts
- `performance_quartiles()`: Calculate 25th, 50th, 75th, 90th percentiles
- `get_individual_montecarlo_simulation_inputs_and_outputs()`: Detailed per-firm results

### Montecarlo_Sim_Configuration Class
Configuration holder and validator.

**Key Attributes:**
- All market and investment parameters
- Validation logic for fund size allocation
- Configuration-to-scenario conversion

### Experiment Class
High-level orchestrator for comparing multiple strategies.

**Key Methods:**
- `generate_montecarlo_configurations()`: Create configurations from parameter ranges
- `run_montecarlo()`: Execute single simulation and extract results
- `simulate_multiple_firm_strategies()`: Run multiple configs in sequence
- `visualize_multiple_strategies()`: Create charts and comparison tables

---

## 4. VISUALIZATION FUNCTIONS

### Main Visualization Functions:

#### 1. `visualize_multiple_strategies(results)`
**Purpose:** Compare multiple investment strategies side-by-side

**What it plots:**
- Line chart with 4 percentile lines:
  - 25th percentile (dotted gray)
  - 50th percentile/Median (solid gray)
  - 75th percentile (solid red)
  - 90th percentile (solid green)
- Shaded region between 75th and 90th percentiles (red, 10% opacity)
- X-axis: Strategy labels
- Y-axis: MOIC (Multiple on Invested Capital) 0-10x scale

**Outputs:**
- Matplotlib figure (16x8 inches)
- Tab-separated table with all metrics

#### 2. `run_single_simulation_and_visualize(config)`
**Purpose:** Visualize distribution of outcomes for single simulation

**What it plots:**
- Histogram of MOIC outcomes (capped at 10x)
- X-axis: MOIC bins (0x to 10x+)
- Y-axis: Percentage of simulations
- 4 percentile vertical lines

**Summary Statistics printed:**
- 25th, 50th, 75th, 90th percentile MOIC
- Mean MOIC
- % of outcomes above 10x

#### 3. `print_montecarlo_simulation_results_table(results)`
**Purpose:** Output detailed per-scenario results

**Columns:**
- Firm number
- MOIC
- Total companies
- Pre-seed investments/values
- Seed investments/values
- Alive/Failed/Acquired company counts and values
- Percentage rows

---

## 5. OUTPUT METRICS STRUCTURE

### Per-Simulation Output Variables:

**Fund Configuration:**
- `fund_size`: Total fund capital (e.g., $200M)
- `follow_on_reserve`: Reserved for follow-on (e.g., $30M)
- `pro_rata_at_or_below`: Pro-rata investment threshold valuation

**Investment Amounts:**
- `Pre-seed_investment_amount`: Size of each Pre-seed check
- `Seed_investment_amount`: Size of each Seed check
- `Pre-seed_total_invested`: Total deployed to Pre-seed
- `Seed_total_invested`: Total deployed to Seed

**Ownership:**
- `Pre-seed_avg_ownership`: Average ownership % at Pre-seed
- `Seed_avg_ownership`: Average ownership % at Seed
- `overall_avg_ownership`: Blended initial ownership %

**Portfolio Composition:**
- `avg_portfolio_size`: Average companies after pro-rata adjustments
- `total_portfolio_companies`: Total initial company count
- `Pre-seed_companies`: Count of Pre-seed companies
- `Seed_companies`: Count of Seed companies
- `Series A-G_companies`: Count by stage

**Outcomes:**
- `Alive Companies`: Still private
- `Failed Companies`: Total loss
- `Acquired Companies`: Exit via M&A

**Returns:**
- `25th_percentile`, `50th_percentile`, `75th_percentile`, `90th_percentile`: MOIC percentiles
- `total_MOIC`: Mean MOIC across all simulations
- `total_value_acquired`: Sum of M&A exit values
- `total_value_alive`: Sum of unrealized values

**Pro-rata Tracking:**
- `Pro Rata Companies`: Count that received pro-rata
- `No Pro Rata Companies`: Count that didn't
- `# times pro rata`: Total pro-rata investments made
- `# times pass on pro rata: out of reserved capital`: Missed due to reserve exhaustion
- `# times pass on pro rata: too late stage`: Missed because valuation too high

---

## 6. DEFAULT CONSTANTS & CONFIGURATION VALUES

### Default Stages:
```
['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C', 'Series D', 'Series E', 'Series F', 'Series G']
```

### Default Stage Dilution:
```
'Seed': 0.20, 'Series A': 0.22, 'Series B': 0.20, 'Series C': 0.15,
'Series D': 0.10, 'Series E': 0.08, 'Series F': 0.08, 'Series G': 0.08
```

### Default Stage Valuations ($M):
```
Pre-seed: 15, Seed: 30, Series A: 70, Series B: 200, Series C: 500,
Series D: 750, Series E: 1500, Series F: 5000, Series G: 10000
```

### M&A Outcome Odds (for all stages):
```
10% Probability: 10x outcome
5% Probability:  5x outcome
60% Probability: 1x outcome (breakeven)
34% Probability: 0.1x outcome (loss)
```

### Default Lifespan:
```
Lifespan Periods: 8
Lifespan Years: 13
```

### Default Fund Configuration:
```
Fund Size: $200M
Follow-on Reserve: $30-60M (varies by scenario)
Pro-rata Threshold: $70M-$200M (varies by stage in some scenarios)
```

### Common Check Sizes:
```
Pre-seed: $0.5M - $3.0M
Seed: $1.0M - $6.0M
```

---

## 7. DATA FLOW ARCHITECTURE

```
USER INPUTS (Parameters)
    ↓
Experiment.generate_montecarlo_configurations()
    ↓
Montecarlo_Sim_Configuration objects (validated)
    ↓
Experiment.run_montecarlo() × N
    ↓
Montecarlo.initialize_scenarios() → Create N Firm objects
    ↓
Firm.initialize_portfolio() → Create Company objects
    ↓
Montecarlo.simulate()
    │
    ├─ For each period:
    │  ├─ Company.promote/fail/m_and_a()
    │  └─ Firm.period_snapshots.append()
    │
    └─ Calculate Firm.get_MoM() for each scenario
    ↓
Experiment.get_simulation_outcome() → Dictionary of metrics
    ↓
Experiment.visualize_multiple_strategies()
    ├─ matplotlib plot
    └─ tab-separated table
```

---

## 8. KEY EXPERIMENT PATTERNS IN NOTEBOOK

### Pattern 1: Single Configuration Test
```python
config_options = {params}
configs = experiment.generate_montecarlo_configurations(config_options)
results = experiment.simulate_multiple_firm_strategies(configs)
experiment.visualize_multiple_strategies(results)
```

### Pattern 2: Parametric Sweep
- Vary `primary_investments` (Pre-seed/Seed split)
- Vary `follow_on_reserve` (0, 30, 60, 100)
- Vary `initial_investment_sizes` (check size variations)
- Vary `fund_size` (40-300M)
- Vary `graduation_rates` (MARKET, ABOVE_MARKET, BELOW_MARKET)

### Pattern 3: Stage Valuation Sensitivity
- Test different Series G exit valuations (10K, 20K, 30K, 40K)
- Analyze impact on overall fund returns

---

## 9. CALCULATION EXAMPLES

### MOIC Calculation:
```
MOIC = Total Portfolio Value / Capital Deployed
Total Portfolio Value = Sum of (Valuation × Ownership) for all companies
Capital Deployed = Primary Capital + Follow-on Capital
```

### Ownership After Pro-Rata:
```
New Ownership = (Old Ownership × (1 - Dilution)) + (Pro-rata Investment / New Valuation)
Pro-rata Investment = min((Old Ownership - New Ownership) × Valuation, Available Reserve)
```

### M&A Return:
```
Exit Value = Current Valuation × Multiplier
Fund Value = Exit Value × Fund Ownership
```

---

## 10. WEB APPLICATION DESIGN RECOMMENDATIONS

### Dashboard Sections:
1. **Configuration Panel** (Inputs)
   - Fund size slider
   - Primary investment sliders (Pre-seed %, Seed %)
   - Check size inputs
   - Follow-on reserve input
   - Pro-rata threshold input
   - Market condition selector (MARKET, ABOVE_MARKET, BELOW_MARKET)
   - Number of scenarios input

2. **Results Dashboard** (Outputs)
   - Large MOIC display (with percentiles: 25th, 50th, 75th, 90th)
   - Portfolio composition table (companies by stage)
   - Outcome breakdown (Alive %, Acquired %, Failed %)
   - Value breakdown (Acquired value, Alive value)

3. **Visualizations**
   - Percentile line chart (comparing strategies)
   - MOIC distribution histogram
   - Portfolio heatmap (stage × outcome)
   - Sensitivity analysis charts

4. **Comparison Tool**
   - Side-by-side strategy comparison
   - Export to CSV/Excel

### Technology Stack Considerations:
- Backend: Python (existing simulation engine)
- Frontend: React/Vue.js for interactive controls
- Charting: Plotly (interactive), D3.js (custom)
- State Management: Redux/Vuex for simulation results
- Database: Store saved scenarios and results

### API Endpoints Needed:
- POST /simulate (run one config)
- POST /simulate-batch (run multiple configs)
- GET /results/:id (retrieve saved results)
- POST /compare (compare multiple strategies)
- GET /metrics (export metrics table)

