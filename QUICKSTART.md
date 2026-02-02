# Quick Start Guide

Get Monaco Venture Fund Simulator up and running in 3 minutes.

## One-Command Start

```bash
./start.sh
```

This will:
1. Start the FastAPI backend on port 8000
2. Start the React frontend on port 5173
3. Auto-install dependencies if needed

Then open http://localhost:5173 in your browser.

---

## Manual Start (if you prefer)

### Terminal 1 - Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Backend running at: http://localhost:8000

### Terminal 2 - Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend running at: http://localhost:5173

---

## First Simulation

1. Open http://localhost:5173
2. The default parameters are already loaded
3. Click **"Run Simulation"**
4. View results in ~3-5 seconds

---

## Compare Strategies

1. Configure your base strategy using the sidebar controls
2. Click **"Compare Strategies"**
3. See how your strategy performs vs:
   - High Pro-Rata (100% follow-on)
   - No Pro-Rata (no follow-on)

---

## Quick Parameter Guide

**Most Important Parameters:**

- **Fund Size**: Total capital (default: $50M)
- **Pro-Rata**: Follow-on investment intensity (0 = none, 1 = full)
- **Breakout Percentile**: % of companies that become big winners
- **Market Scenario**: Market, Above Market, or Below Market

**Pro Tip:** Start with defaults, run a simulation, then adjust one parameter at a time to see its impact.

---

## Troubleshooting

**"Cannot connect to API"?**
- Make sure backend is running on port 8000
- Check terminal for error messages

**Slow simulations?**
- Reduce iterations from 3000 to 1000
- Reduce periods from 8 to 6

**Nothing happening?**
- Check browser console (F12) for errors
- Refresh the page

---

## Next Steps

- Read `README.md` for full documentation
- Check `SIMULATION_ANALYSIS.md` to understand the math
- Explore `backend/README.md` for API details
- View API docs at http://localhost:8000/docs
