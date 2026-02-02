# Monaco Monte Carlo Simulation Backend

A FastAPI-based backend for running venture capital fund Monte Carlo simulations. This application simulates portfolio company outcomes over a fund's lifecycle to estimate returns (MOIC/IRR).

## Project Structure

```
backend/
├── __init__.py              # Package initialization
├── models.py                # Core data models (Company, Firm, Montecarlo)
├── simulation.py            # Experiment class and simulation logic
├── config.py                # Configuration constants and presets
├── main.py                  # FastAPI application and API endpoints
├── requirements.txt         # Python dependencies
└── README.md               # This file
```

## Core Components

### models.py
- **Company**: Represents a portfolio company with investment lifecycle
- **Firm**: Investment firm with portfolio management
- **Montecarlo**: Monte Carlo simulation engine
- **Montecarlo_Sim_Configuration**: Configuration for simulation parameters

### simulation.py
- **Experiment**: Class for running and comparing multiple strategies
- Result processing and analysis functions

### config.py
- Default funding stages (Pre-seed through Series G)
- Stage valuations and dilution rates
- Market scenarios (Market, Above-Market, Below-Market)
- Preset configurations

### main.py
- FastAPI application with REST endpoints
- CORS configuration
- Request/response models

## Installation

### Prerequisites
- Python 3.8 or higher
- pip

### Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

## Running the Server

### Development Mode
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Alternative docs: http://localhost:8000/redoc

## API Endpoints

### GET /
Root endpoint with API information

### GET /health
Health check endpoint

### GET /api/presets
Get preset configurations for quick testing

**Response:**
```json
{
  "market_scenarios": {...},
  "valuations": {...},
  "dilution": {...},
  "example_configs": {...}
}
```

### POST /api/simulate
Run a single Monte Carlo simulation

**Request Body:**
```json
{
  "primary_investments": {"Pre-seed": 170},
  "initial_investment_sizes": {"Pre-seed": 1.5},
  "follow_on_reserve": 30,
  "fund_size": 200,
  "pro_rata_at_or_below": 70,
  "num_scenarios": 1000
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "fund_size": 200,
    "total_MOIC": 2.3,
    "50th_percentile": 1.8,
    "75th_percentile": 2.5,
    "90th_percentile": 3.8,
    ...
  }
}
```

### POST /api/simulate/multiple
Compare multiple strategies

**Request Body:**
```json
{
  "configs": [
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
}
```

### POST /api/simulate/quick
Quick simulation with simplified parameters

**Query Parameters:**
- `fund_size` (float): Total fund size in millions (default: 200)
- `preseed_amount` (float): Total pre-seed investment (default: 170)
- `preseed_check_size` (float): Individual check size (default: 1.5)
- `follow_on_reserve` (float): Follow-on reserve (default: 30)
- `num_scenarios` (int): Number of scenarios (default: 1000)

## Configuration Options

### Fund Parameters
- `fund_size`: Total fund size in millions
- `primary_investments`: Dict of investment amounts by stage
- `initial_investment_sizes`: Dict of check sizes by stage
- `follow_on_reserve`: Amount reserved for follow-on investments
- `pro_rata_at_or_below`: Valuation threshold for pro-rata rights

### Market Parameters
- `stages`: List of funding stages
- `graduation_rates`: Probabilities [promote, fail, M&A] by stage
- `stage_valuations`: Company valuations by stage
- `stage_dilution`: Dilution rates by stage

### Simulation Parameters
- `num_scenarios`: Number of Monte Carlo scenarios to run
- `lifespan_periods`: Number of simulation periods
- `lifespan_years`: Fund lifespan in years

## Example Usage

### Python Client
```python
import requests

# Quick simulation
response = requests.post(
    "http://localhost:8000/api/simulate/quick",
    params={
        "fund_size": 200,
        "preseed_amount": 170,
        "preseed_check_size": 1.5,
        "follow_on_reserve": 30,
        "num_scenarios": 1000
    }
)

results = response.json()
print(f"Median MOIC: {results['summary']['median_moic']}")
```

### cURL
```bash
curl -X POST "http://localhost:8000/api/simulate/quick?fund_size=200&preseed_amount=170&preseed_check_size=1.5&follow_on_reserve=30&num_scenarios=1000"
```

## Understanding the Simulation

### How It Works
1. **Portfolio Initialization**: Creates companies based on primary investment configuration
2. **Simulation Loop**: For each period, companies either:
   - Promote to next funding stage (with dilution)
   - Get acquired (with outcome distribution)
   - Fail (valuation goes to zero)
3. **Pro-Rata Investments**: Firm can invest follow-on capital to maintain ownership
4. **Final Calculation**: Calculates MOIC, IRR, and other metrics

### Key Metrics
- **MOIC** (Multiple on Invested Capital): Total value / Total invested
- **Percentiles**: Distribution of outcomes across scenarios
- **Portfolio Composition**: Number of companies by stage/state
- **Value Distribution**: Breakdown of value by alive/acquired companies

## Development

### Code Quality
```bash
# Format code
black .

# Lint code
flake8 .

# Type checking
mypy .
```

### Testing
```bash
pytest
```

## Notes

- The simulation uses historical VC performance data as default assumptions
- M&A outcomes follow a power-law distribution (few big wins, many small exits)
- Pro-rata logic assumes firms maintain ownership percentages up to a valuation threshold
- The model doesn't account for fund management fees or carry

## License

See main project LICENSE file.
