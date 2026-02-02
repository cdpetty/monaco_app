# Monaco Venture Fund Simulator

An interactive web application for simulating venture fund performance using Monte Carlo methods. Configure fund parameters, run simulations, and visualize results in real-time.

## Project Structure

```
monaco_app/
├── backend/                 # FastAPI Python backend
│   ├── models.py           # Company, Firm, Montecarlo classes
│   ├── simulation.py       # Simulation logic and experiments
│   ├── config.py           # Configuration and constants
│   ├── main.py             # FastAPI application
│   └── requirements.txt    # Python dependencies
├── frontend/               # React TypeScript frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API client
│   │   ├── types/         # TypeScript definitions
│   │   ├── App.tsx        # Main application
│   │   └── App.css        # Styles
│   └── package.json       # Node dependencies
└── Monaco.ipynb           # Original Jupyter notebook
```

## Features

- **Interactive Parameter Controls**: Adjust fund size, investment strategy, pro-rata participation, and more
- **Real-time Simulations**: Run Monte Carlo simulations with 3,000+ iterations
- **Strategy Comparison**: Compare multiple investment strategies side-by-side
- **Rich Visualizations**: View MOIC distributions, percentile comparisons, and portfolio statistics
- **Preset Configurations**: Load predefined strategy templates
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

### Prerequisites

- Python 3.8 or higher
- Node.js 16 or higher
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the FastAPI server:
   ```bash
   python main.py
   ```

   Or use the convenience script:
   ```bash
   ./run.sh
   ```

   The API will be available at http://localhost:8000

   Interactive API documentation: http://localhost:8000/docs

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install Node dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   The application will be available at http://localhost:5173

## Usage

1. **Start both servers**: Run the backend (port 8000) and frontend (port 5173)

2. **Configure parameters**: Use the sidebar controls to adjust:
   - Fund size and capital allocation
   - Investment strategy (pro-rata, check sizes, ownership targets)
   - Market conditions
   - Simulation parameters

3. **Run simulations**:
   - Click "Run Simulation" for a single strategy
   - Click "Compare Strategies" to compare multiple approaches

4. **Analyze results**: View:
   - MOIC percentiles (25th, 50th, 75th, 90th)
   - Distribution histograms
   - Portfolio statistics
   - Strategy comparisons

## API Endpoints

- `GET /` - API information
- `GET /health` - Health check
- `GET /api/presets` - Get preset configurations
- `POST /api/simulate` - Run single simulation
- `POST /api/simulate/multiple` - Compare multiple strategies
- `POST /api/simulate/quick` - Quick simulation with simplified parameters

See http://localhost:8000/docs for interactive API documentation.

## Key Parameters

### Fund Parameters
- **Fund Size (M)**: Total fund capital in millions
- **Capital Per Company (M)**: Average capital per portfolio company
- **Deploy Percentage**: Percentage of fund to deploy

### Investment Strategy
- **Pro-Rata Participation**: 0-1 scale for follow-on investment intensity
- **Dry Powder Reserve**: Percentage reserved for pro-rata
- **Breakout Percentile**: Top X% of companies that become breakouts

### Market Conditions
- **Below Market**: Conservative valuations and outcomes
- **Market**: Standard market conditions
- **Above Market**: Aggressive valuations

### Simulation Parameters
- **Number of Iterations**: Monte Carlo simulation runs (default: 3000)
- **Number of Periods**: Investment lifecycle periods (default: 8)

## Development

### Backend Development

```bash
cd backend

# Run tests
python test_basic.py

# Format code
black *.py

# Type checking
mypy *.py
```

### Frontend Development

```bash
cd frontend

# Run dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

## Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **NumPy**: Numerical computing
- **Pandas**: Data manipulation
- **Pydantic**: Data validation
- **Uvicorn**: ASGI server

### Frontend
- **React 18**: UI framework
- **TypeScript**: Type-safe JavaScript
- **Vite**: Build tool and dev server
- **Recharts**: Charting library
- **Axios**: HTTP client

## Documentation

- `SIMULATION_ANALYSIS.md` - Detailed technical analysis of simulation logic
- `ARCHITECTURE_GUIDE.md` - System architecture and design
- `QUICK_REFERENCE.md` - Developer quick reference
- `BACKEND_SETUP_COMPLETE.md` - Backend setup guide
- `backend/README.md` - Backend API documentation
- `backend/MIGRATION_NOTES.md` - Migration notes from Jupyter notebook

## Troubleshooting

### Backend won't start
- Ensure Python 3.8+ is installed: `python3 --version`
- Activate virtual environment: `source venv/bin/activate`
- Check all dependencies installed: `pip list`

### Frontend can't connect to API
- Verify backend is running on port 8000
- Check API status indicator in top-right of app
- Check browser console for CORS errors
- Verify VITE_API_URL in frontend/.env (if using custom URL)

### Simulations are slow
- Reduce number of iterations (try 1000 instead of 3000)
- Reduce number of periods
- Use the "Quick Simulation" endpoint

### Charts not displaying
- Check browser console for errors
- Verify simulation returned data
- Try refreshing the page

## License

Private project for venture fund simulation analysis.

## Contributing

This project is currently private. For questions or contributions, please contact the repository owner.
