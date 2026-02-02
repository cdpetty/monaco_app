# Migration Notes: Jupyter Notebook to FastAPI Backend

## Summary

Successfully extracted all Python code from `Monaco.ipynb` and organized it into a production-ready FastAPI backend. The core simulation logic has been preserved while removing Jupyter-specific dependencies.

## Code Organization

### 1. models.py (27KB)
**Contains:**
- `Company` class: Portfolio company lifecycle management
- `Firm` class: Investment firm and portfolio management
- `Montecarlo` class: Monte Carlo simulation engine
- `Montecarlo_Sim_Configuration` class: Simulation configuration

**Key Changes from Notebook:**
- Added comprehensive docstrings
- Added type hints throughout
- Removed display() calls and Jupyter widgets
- Maintained all core simulation logic intact

### 2. simulation.py (18KB)
**Contains:**
- `Experiment` class: Multi-strategy simulation and comparison
- Result processing and formatting functions
- `print_montecarlo_simulation_results_table()`: Result aggregation

**Key Changes:**
- Removed matplotlib visualization code (can be re-added later)
- Removed pandas display() calls
- Kept all calculation and analysis logic
- Returns data structures instead of displaying directly

### 3. config.py (4KB)
**Contains:**
- `DEFAULT_STAGES`: List of funding stages
- `DEFAULT_STAGE_VALUATIONS`: Valuations by stage
- `DEFAULT_STAGE_DILUTION`: Dilution rates
- `MARKET`, `ABOVE_MARKET`, `BELOW_MARKET`: Graduation rate scenarios
- Example fund configurations

**Key Changes:**
- Consolidated all constants from notebook cells 16-18
- Added type hints
- Organized into logical groups

### 4. main.py (10KB)
**Contains:**
- FastAPI application setup
- REST API endpoints:
  - `POST /api/simulate`: Single simulation
  - `POST /api/simulate/multiple`: Compare strategies
  - `POST /api/simulate/quick`: Quick test simulation
  - `GET /api/presets`: Get preset configurations
- Pydantic models for request/response validation
- CORS configuration

**This is NEW code** - not from notebook, created to provide API access to simulations.

## Removed from Notebook

The following Jupyter/Hex-specific code was removed:

1. **Hex Platform Variables** (Cells 0-10):
   - `hex_scheduled`, `hex_user_email`, etc.
   - Not needed for backend operation

2. **Jupyter Display Code**:
   - `display(df)` calls
   - IPython widgets
   - Interactive visualizations

3. **Matplotlib Plotting**:
   - `visualize_multiple_strategies()` plotting code
   - `run_single_simulation_and_visualize()` histogram code
   - Can be re-implemented as separate visualization endpoints if needed

4. **Example Execution Code** (Cells 17, 19-21):
   - Specific simulation runs
   - These are now handled via API calls

## Important Simulation Logic Preserved

All core simulation logic has been kept:

1. **Company Lifecycle**:
   - Promotion between stages with dilution
   - M&A exits with outcome distribution
   - Failure handling
   - Pro-rata investment logic

2. **Portfolio Management**:
   - Initial portfolio construction
   - Follow-on capital deployment
   - Extra investment allocation for unused reserves

3. **Monte Carlo Simulation**:
   - Random outcome generation
   - Multi-period aging
   - Statistical outcome calculation

4. **Result Analysis**:
   - MOIC percentile calculations
   - Portfolio composition metrics
   - Value attribution (alive vs acquired)
   - Pro-rata participation tracking

## Known Issues and Notes

### From Original Code Comments:

1. **Stage Index Handling** (Company.promote, line 73):
   - Original comment: "if already at last stage, stay at last stage"
   - Issue noted: "should throw an error if going beyond last stage"
   - Current behavior maintained for compatibility

2. **Pre-Seed Dilution** (Company.promote, line 77):
   - Original comment: "note there's no dilution for Pre-Seed"
   - This is by design in the market constraints

3. **Ownership Calculation** (Company.promote, line 102):
   - Original comment: "This applies dilution from a Seed round even if it's the first round"
   - Potential edge case in dilution logic

4. **M&A Outcomes** (Company.m_and_a, lines 115-117):
   - Hardcoded outcome probabilities and multipliers
   - Original comment suggests these should be moved to config
   - Kept in Company class for now

5. **Pro-Rata Counter Logic** (Company.promote, lines 89-96):
   - Original comments suggest ambiguity about tracking companies vs events
   - Current implementation tracks events (number of times)

6. **IRR Calculation**:
   - Not implemented (returns error message)
   - Only MOIC is calculated

## API Usage Examples

### Quick Test
```bash
curl -X POST "http://localhost:8000/api/simulate/quick?fund_size=200&preseed_amount=170&preseed_check_size=1.5&follow_on_reserve=30&num_scenarios=1000"
```

### Full Configuration
```python
import requests

config = {
    "primary_investments": {"Pre-seed": 170},
    "initial_investment_sizes": {"Pre-seed": 1.5},
    "follow_on_reserve": 30,
    "fund_size": 200,
    "pro_rata_at_or_below": 70,
    "num_scenarios": 1000
}

response = requests.post("http://localhost:8000/api/simulate", json=config)
results = response.json()
```

### Compare Strategies
```python
configs = [
    {
        "primary_investments": {"Pre-seed": 170},
        "initial_investment_sizes": {"Pre-seed": 1.5},
        "follow_on_reserve": 30,
        "fund_size": 200,
        "pro_rata_at_or_below": 70,
        "num_scenarios": 1000
    },
    {
        "primary_investments": {"Pre-seed": 85, "Seed": 85},
        "initial_investment_sizes": {"Pre-seed": 1.5, "Seed": 4},
        "follow_on_reserve": 30,
        "fund_size": 200,
        "pro_rata_at_or_below": 70,
        "num_scenarios": 1000
    }
]

response = requests.post("http://localhost:8000/api/simulate/multiple", json={"configs": configs})
```

## Next Steps / Recommendations

1. **Testing**: Add unit tests for core simulation logic
2. **Validation**: Add more input validation for edge cases
3. **Performance**: Consider caching for common configurations
4. **Visualization**: Add endpoints that return chart-ready data
5. **Documentation**: Add OpenAPI/Swagger documentation examples
6. **Logging**: Add structured logging for debugging
7. **Database**: Consider storing simulation results for historical analysis
8. **Authentication**: Add API authentication if deploying publicly

## File Summary

Total files created:
- `/backend/__init__.py`: Package initialization
- `/backend/models.py`: Core data models (27KB)
- `/backend/simulation.py`: Experiment and analysis (18KB)
- `/backend/config.py`: Constants and presets (4KB)
- `/backend/main.py`: FastAPI application (10KB)
- `/backend/requirements.txt`: Dependencies
- `/backend/README.md`: Documentation
- `/backend/run.sh`: Quick start script
- `/.gitignore`: Git ignore rules
- `/backend/MIGRATION_NOTES.md`: This file

Total lines of Python code: ~2,000 (organized from ~2,900 notebook lines)
