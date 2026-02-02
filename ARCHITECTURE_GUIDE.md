# Monaco Simulation - Architecture & Web App Design Guide

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEB APPLICATION FRONTEND                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Configuration Panel          Results Dashboard        │   │
│  │  ├─ Fund Size Slider          ├─ MOIC Display        │   │
│  │  ├─ Stage Distribution         ├─ Percentiles         │   │
│  │  ├─ Check Size Inputs          ├─ Portfolio Table     │   │
│  │  ├─ Follow-on Reserve          └─ Outcome Breakdown   │   │
│  │  ├─ Pro-rata Threshold                               │   │
│  │  ├─ Market Condition Selector  Visualizations         │   │
│  │  └─ # Simulations             ├─ Percentile Chart    │   │
│  │                               ├─ Histogram           │   │
│  │  [RUN SIMULATION]             └─ Heatmap             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓ API Calls
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API LAYER                           │
│  Flask/FastAPI Server                                           │
│  ├─ POST /api/simulate           (Run single config)           │
│  ├─ POST /api/simulate-batch     (Run multiple configs)       │
│  ├─ GET  /api/results/:id        (Retrieve results)           │
│  ├─ POST /api/compare            (Compare strategies)          │
│  └─ GET  /api/metrics            (Export metrics)             │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Python Imports
┌─────────────────────────────────────────────────────────────────┐
│              MONTE CARLO SIMULATION ENGINE                       │
│                   (Existing Python Code)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Experiment Class                                          │  │
│  │ ├─ generate_montecarlo_configurations()                 │  │
│  │ ├─ simulate_multiple_firm_strategies()                  │  │
│  │ ├─ visualize_multiple_strategies()                      │  │
│  │ └─ get_simulation_outcome()                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Montecarlo Class                                          │  │
│  │ ├─ initialize_scenarios()                               │  │
│  │ ├─ simulate()                                           │  │
│  │ ├─ get_MoM_return_outcomes()                            │  │
│  │ ├─ performance_quartiles()                              │  │
│  │ └─ [Collection methods for metrics]                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Firm Class          │  Company Class                      │  │
│  │ ├─ portfolio[]      │  ├─ name                           │  │
│  │ ├─ get_MoM()        │  ├─ stage                          │  │
│  │ ├─ get_total_value()│  ├─ valuation                      │  │
│  │ └─ period_snapshots │  ├─ firm_ownership                │  │
│  │                     │  ├─ promote()                      │  │
│  │                     │  ├─ m_and_a()                      │  │
│  │                     │  └─ fail()                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Sequence Diagram

```
User Input Configuration
        ↓
   [FRONTEND]
   UI Form Submission
        ↓
   API POST /simulate
        ↓
   [BACKEND]
   ├─ Validate inputs
   ├─ Create Montecarlo_Sim_Configuration
   └─ Call Experiment.run_montecarlo()
        ↓
   [SIMULATION ENGINE]
   ├─ Create N Firm objects
   ├─ For each Firm:
   │  ├─ Initialize portfolio of Companies
   │  ├─ For each period (1-8):
   │  │  ├─ For each Company:
   │  │  │  ├─ Random outcome determination
   │  │  │  ├─ Company state transition (promote/fail/M&A)
   │  │  │  └─ Update fund's capital tracking
   │  │  └─ Take snapshot
   │  └─ Calculate MOIC
   └─ Return results dictionary
        ↓
   [BACKEND]
   Format results for JSON response
        ↓
   JSON Response
        ↓
   [FRONTEND]
   ├─ Update MOIC displays
   ├─ Render charts (Plotly)
   ├─ Display tables
   └─ Enable comparison/export
```

---

## Class Hierarchy & Relationships

```
Experiment (Orchestrator)
    ├─ manage: Montecarlo_Sim_Configuration[]
    ├─ manage: Montecarlo[]
    └─ output: visualization functions

Montecarlo_Sim_Configuration
    ├─ stages: List[String]
    ├─ graduation_rates: Dict[stage → [advance%, fail%, m_and_a%]]
    ├─ stage_valuations: Dict[stage → $M]
    ├─ stage_dilution: Dict[stage → %]
    ├─ primary_investments: Dict[stage → $M]
    ├─ initial_investment_sizes: Dict[stage → $M]
    ├─ follow_on_reserve: $M
    ├─ fund_size: $M
    ├─ pro_rata_at_or_below: $M
    ├─ lifespan_periods: integer
    ├─ lifespan_years: integer
    └─ num_scenarios: integer

Montecarlo (Simulation Engine)
    ├─ config: Montecarlo_Sim_Configuration
    ├─ firm_scenarios: Firm[] (length = num_scenarios)
    ├─ method: initialize_scenarios()
    ├─ method: simulate()
    └─ methods: get_*_outcomes()

Firm (Single Fund Scenario)
    ├─ portfolio: Company[]
    ├─ fund_size: $M
    ├─ follow_on_reserve: $M
    ├─ primary_capital_deployed: $M
    ├─ follow_on_capital_deployed: $M
    ├─ period_snapshots: Dict[]
    ├─ method: initialize_portfolio()
    ├─ method: get_total_value_of_portfolio()
    ├─ method: get_MoM()
    └─ method: get_detailed_portfolio_snapshot()

Company (Portfolio Company)
    ├─ name: String
    ├─ stage: String (Pre-seed, Seed, Series A, ...)
    ├─ valuation: $M
    ├─ state: String (Alive, Failed, Acquired)
    ├─ firm_ownership: %
    ├─ firm_invested_capital: $M
    ├─ age: integer
    ├─ market_constraints: Dict (reference to market data)
    ├─ method: promote() → moves to next stage
    ├─ method: m_and_a() → exit event
    ├─ method: fail() → total loss
    └─ method: get_firm_value() → current valuation × ownership
```

---

## State Transitions for Company

```
                    ┌─────────────┐
                    │   Created   │
                    │   (Alive)   │
                    └──────┬──────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ↓          ↓          ↓
         [50% advance] [35% fail] [15% M&A]
                │          │          │
                ↓          ↓          ↓
         ┌────────────┐ ┌──────────┐ ┌──────────────┐
         │   Promote  │ │  Failed  │ │  Acquired    │
         │  to Stage  │ │ (Loss $0)│ │  (Multiplier)│
         │   N+1      │ └──────────┘ └──────────────┘
         └────────────┘
              │
              └─ [Each period, if still Alive]
                   → Next outcome determination
```

---

## Configuration Structure (Detailed)

### Input Configuration Dictionary
```python
config = {
    # FUND STRUCTURE
    'fund_size': 200,                    # $M
    'follow_on_reserve': 30,             # $M (reserved for follow-ons)
    'pro_rata_at_or_below': 70,          # $M (valuation threshold)
    
    # INVESTMENT STRATEGY
    'primary_investments': {
        'Pre-seed': 85,
        'Seed': 85
    },
    'initial_investment_sizes': {
        'Pre-seed': 1.5,                 # Check size in $M
        'Seed': 4.0
    },
    
    # MARKET CONDITIONS
    'graduation_rates': {
        'Pre-seed': [0.50, 0.35, 0.15], # [advance%, fail%, m_and_a%]
        'Seed': [0.50, 0.35, 0.15],
        'Series A': [0.50, 0.30, 0.20],
        # ... etc for all stages
    },
    'stage_valuations': {
        'Pre-seed': 15,                  # Post-money valuation
        'Seed': 30,
        'Series A': 70,
        # ... etc
    },
    'stage_dilution': {
        'Seed': 0.20,                    # 20% dilution
        'Series A': 0.22,
        # ... etc (Pre-seed typically omitted)
    },
    
    # TIME PARAMETERS
    'lifespan_periods': 8,               # Time periods
    'lifespan_years': 13,                # Total fund life
    'stages': ['Pre-seed', 'Seed', ..., 'Series G'],
    
    # SIMULATION PARAMETERS
    'num_scenarios': 3000                # Number of Monte Carlo runs
}
```

### Output Results Dictionary
```python
results = {
    'Strategy': 'Strategy 1',
    
    # Fund Configuration
    'fund_size': 200,
    'follow_on_reserve': 30,
    'pro_rata_at_or_below': 70,
    
    # Investment Amounts
    'Pre-seed_investment_amount': 1.5,
    'Seed_investment_amount': 4.0,
    'Pre-seed_total_invested': 85,
    'Seed_total_invested': 85,
    
    # Ownership %
    'Pre-seed_avg_ownership': 10.0,
    'Seed_avg_ownership': 13.33,
    'overall_avg_ownership': 11.67,
    
    # Portfolio Composition (counts)
    'total_portfolio_companies': 157,
    'avg_portfolio_size': 159.2,
    'Pre-seed_companies': 24,
    'Seed_companies': 18,
    'Series A_companies': 45,
    # ... etc for all stages
    
    # Outcomes
    'Alive Companies': 65,
    'Failed Companies': 52,
    'Acquired Companies': 40,
    'Pro Rata Companies': 35,
    'No Pro Rata Companies': 122,
    
    # Returns & Performance
    '25th_percentile': 0.65,
    '50th_percentile': 1.25,
    '75th_percentile': 2.30,
    '90th_percentile': 4.50,
    'total_MOIC': 1.87,
    
    # Value Tracking
    'total_value_acquired': 125.5,
    'total_value_alive': 87.3
}
```

---

## Frontend Component Design

### 1. Configuration Panel Component
```
┌─────────────────────────────────────┐
│   FUND CONFIGURATION                 │
├─────────────────────────────────────┤
│                                      │
│  Fund Size ($M)                     │
│  [====●========] 200                │
│   40                    300          │
│                                      │
│  Follow-on Reserve ($M)             │
│  [====●========] 30                 │
│   0                     100          │
│                                      │
│  Pro-rata Threshold ($M)            │
│  [====●========] 70                 │
│   30                    200          │
│                                      │
│  Market Condition                   │
│  [Market ▼]                         │
│   - Market                          │
│   - Above Market                    │
│   - Below Market                    │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ INVESTMENT STRATEGY          │   │
│  ├──────────────────────────────┤   │
│  │                              │   │
│  │ Pre-seed Allocation: 50%    │   │
│  │ [====●========] 85/170      │   │
│  │                              │   │
│  │ Seed Allocation: 50%        │   │
│  │ [====●========] 85/170      │   │
│  │                              │   │
│  │ Pre-seed Check Size ($M):   │   │
│  │ [1.5______]                 │   │
│  │                              │   │
│  │ Seed Check Size ($M):       │   │
│  │ [4.0______]                 │   │
│  │                              │   │
│  └──────────────────────────────┘   │
│                                      │
│  Number of Simulations             │
│  [3000______]                       │
│                                      │
│              [RUN SIMULATION]        │
│                                      │
└─────────────────────────────────────┘
```

### 2. Results Dashboard Component
```
┌──────────────────────────────────────────────┐
│  RESULTS                                     │
├──────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ FUND PERFORMANCE                     │   │
│  ├──────────────────────────────────────┤   │
│  │                                      │   │
│  │  Median MOIC    1.25x                │   │
│  │  25th %ile      0.65x                │   │
│  │  50th %ile      1.25x                │   │
│  │  75th %ile      2.30x                │   │
│  │  90th %ile      4.50x                │   │
│  │  Mean MOIC      1.87x                │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ PORTFOLIO BREAKDOWN                  │   │
│  ├──────────────────────────────────────┤   │
│  │                                      │   │
│  │ Pre-seed:        24 companies        │   │
│  │ Seed:            18 companies        │   │
│  │ Series A:        45 companies        │   │
│  │ Series B:        32 companies        │   │
│  │ ... (all stages)                     │   │
│  │                                      │   │
│  │ Total Portfolio: 157 companies       │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ OUTCOMES                             │   │
│  ├──────────────────────────────────────┤   │
│  │                                      │   │
│  │ Alive:     65 (41.4%) - $87.3M      │   │
│  │ Acquired:  40 (25.5%) - $125.5M     │   │
│  │ Failed:    52 (33.1%) - $0M         │   │
│  │                                      │   │
│  │ Total Value: $212.8M                │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
└──────────────────────────────────────────────┘
```

### 3. Visualization Component
```
Multiple strategies charted together:

MOIC (Multiple on Invested Capital)
5.0x ┤
     ├─ Green: 90th percentile
     ├─ Red shaded region (75th-90th)
     ├─ Red: 75th percentile
     ├─ Gray: 50th percentile (median)
     ├─ Dotted Gray: 25th percentile
     │
2.5x ├                    ╱
     │   ╱              ╱
2.0x ├ ╱              ╱
     │              ╱
1.5x ├             ╱
     │           ╱
1.0x ├         ╱
     │       ╱
0.5x ├ ___╱
     │
0.0x └──────────────────────────────────
       Strategy 1  Strategy 2  Strategy 3
```

---

## API Endpoint Specifications

### 1. POST /api/simulate
**Request:**
```json
{
  "fund_size": 200,
  "follow_on_reserve": 30,
  "pro_rata_at_or_below": 70,
  "primary_investments": {"Pre-seed": 85, "Seed": 85},
  "initial_investment_sizes": {"Pre-seed": 1.5, "Seed": 4.0},
  "market_condition": "MARKET",
  "num_scenarios": 3000
}
```

**Response:**
```json
{
  "status": "success",
  "result_id": "sim_12345",
  "results": {
    "fund_size": 200,
    "25th_percentile": 0.65,
    "50th_percentile": 1.25,
    "75th_percentile": 2.30,
    "90th_percentile": 4.50,
    "total_MOIC": 1.87,
    // ... all other metrics
  },
  "execution_time_ms": 5230
}
```

### 2. POST /api/simulate-batch
**Request:**
```json
{
  "configurations": [
    { config1 },
    { config2 },
    { config3 }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "results": [
    { result1 },
    { result2 },
    { result3 }
  ],
  "execution_time_ms": 12450
}
```

### 3. GET /api/results/:id
**Response:**
```json
{
  "status": "success",
  "result": { result_object },
  "created_at": "2025-01-10T18:30:00Z"
}
```

### 4. POST /api/compare
**Request:**
```json
{
  "result_ids": ["sim_12345", "sim_12346"]
}
```

**Response:**
```json
{
  "status": "success",
  "comparison": {
    "strategies": [
      { result1 },
      { result2 }
    ],
    "differences": {
      "total_MOIC_delta": 0.25,
      "percentile_deltas": { ... }
    }
  }
}
```

---

## Performance Considerations

### Simulation Runtime
- 1,000 scenarios: ~2-3 seconds
- 3,000 scenarios: ~5-8 seconds
- 10,000 scenarios: ~15-25 seconds

### Web App Optimization Strategies
1. **Caching Results**: Store common configurations
2. **Background Processing**: Queue long simulations
3. **Progressive Loading**: Show 25th/50th percentiles first
4. **Chart Rendering**: Use Plotly for interactive charts
5. **Database Indexing**: Index by configuration hash for quick lookups

### Database Schema (Optional)
```sql
CREATE TABLE simulations (
  id VARCHAR(50) PRIMARY KEY,
  config_hash VARCHAR(64) UNIQUE,
  configuration JSON,
  results JSON,
  execution_time_ms INT,
  created_at TIMESTAMP,
  user_id VARCHAR(50)
);

CREATE INDEX idx_config_hash ON simulations(config_hash);
CREATE INDEX idx_user_id ON simulations(user_id);
```

---

## Technology Stack Recommendations

### Frontend
- **Framework**: React.js or Vue.js
- **Charts**: Plotly.js (interactive), Chart.js (lightweight)
- **State Management**: Redux (React) or Vuex (Vue)
- **UI Components**: Material-UI, Ant Design, or Bootstrap
- **HTTP Client**: Axios or Fetch API

### Backend
- **Framework**: Flask (lightweight) or FastAPI (modern)
- **Task Queue**: Celery (for long simulations)
- **Cache**: Redis (for storing results)
- **Database**: PostgreSQL (robust) or MongoDB (flexible)

### Deployment
- **Backend**: Docker + Kubernetes or AWS Lambda
- **Frontend**: Vercel, Netlify, or AWS S3 + CloudFront
- **Database**: AWS RDS, Azure Database, or Heroku Postgres

---

## Development Roadmap

### Phase 1: MVP (Weeks 1-4)
- Basic React frontend with input controls
- Flask API wrapper around simulation engine
- Single simulation execution
- Basic results display

### Phase 2: Enhanced UI (Weeks 5-8)
- Interactive charts (Plotly)
- Comparison interface
- Export to CSV/Excel
- Saved scenarios (database)

### Phase 3: Advanced Features (Weeks 9-12)
- Batch processing / queuing
- Parametric sensitivity analysis
- Custom market condition builder
- Performance optimization & caching

### Phase 4: Polish & Scale (Weeks 13+)
- User authentication
- Portfolio history tracking
- Custom visualizations
- Mobile responsiveness

