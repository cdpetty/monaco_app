import React, { useState, useEffect } from 'react';

const customStyles = {
  root: {
    '--ink': '#000000',
    '--paper': '#ffffff',
    '--trace': 'rgba(0,0,0,0.1)',
    '--grid': 'rgba(0,0,0,0.15)',
    '--hairline': '1px',
    '--thick': '4px'
  },
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: "'Barlow Condensed', sans-serif",
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontSize: '14px',
    letterSpacing: '0.02em'
  }
};

const Button = ({ children, onClick, variant = 'primary', style = {}, className = '' }) => {
  const baseClass = variant === 'secondary' 
    ? 'btn' 
    : 'btn';
  
  return (
    <button 
      className={`${baseClass} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
};

const IconPlus = () => (
  <div className="icon-plus"></div>
);

const InputGroup = ({ label, value, onChange, type = 'text', rightLabel }) => (
  <div className="input-group">
    <label className="input-label">
      <span>{label}</span>
      {rightLabel && <span className="mono">{rightLabel}</span>}
    </label>
    <input 
      type={type} 
      className="input-field" 
      value={value}
      onChange={onChange}
    />
  </div>
);

const SliderControl = ({ label, value, onChange, min, max, step = 1, unit = '' }) => (
  <div className="slider-container">
    <div className="slider-header">
      <span>{label}</span>
      <span className="mono">{value}{unit}</span>
    </div>
    <div className="range-wrapper">
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value}
        onChange={onChange}
      />
    </div>
  </div>
);

const StrategyCard = ({ title, code, checkSize, reserves, isActive, onClick }) => (
  <div 
    className={`strategy-card ${isActive ? 'active' : ''}`}
    onClick={onClick}
  >
    <div className="strategy-card-header">
      <strong>{title}</strong>
      <span className="mono">{code}</span>
    </div>
    <div className="metric-row">
      <span>Check Size</span>
      <span className="mono">{checkSize}</span>
    </div>
    <div className="metric-row">
      <span>Reserves</span>
      <span className="mono">{reserves}</span>
    </div>
  </div>
);

const StatBox = ({ value, label }) => (
  <div className="stat-box">
    <span className="stat-value">{value}</span>
    <span className="stat-label">{label}</span>
  </div>
);

const MonteCarloLines = ({ simulations }) => {
  return (
    <svg className="monte-carlo-lines" viewBox="0 0 800 400" preserveAspectRatio="none">
      {simulations.map((sim, i) => (
        <path 
          key={i}
          className="sim-line" 
          d={sim.path}
        />
      ))}
      <path className="median-line" d="M0,400 C120,380 350,290 800,140" />
    </svg>
  );
};

const App = () => {
  const [fundName, setFundName] = useState('Growth Opps IV');
  const [fundSize, setFundSize] = useState(150);
  const [managementFees, setManagementFees] = useState(2.0);
  const [carry, setCarry] = useState(20);
  const [dealCount, setDealCount] = useState(25);
  const [graduationRate, setGraduationRate] = useState(35);
  const [exitMultipleCap, setExitMultipleCap] = useState(15);
  const [activeStrategy, setActiveStrategy] = useState('A');
  const [simulations, setSimulations] = useState([]);
  const [stats, setStats] = useState({
    tvpi: '3.24x',
    irr: '18.5%',
    distributions: '$486M',
    lossRatio: '12%'
  });

  useEffect(() => {
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      :root {
        --ink: #000000;
        --paper: #ffffff;
        --trace: rgba(0,0,0,0.1);
        --grid: rgba(0,0,0,0.15);
        --hairline: 1px;
        --thick: 4px;
      }

      * {
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
      }

      h1, h2, h3, .label {
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.05em;
        margin: 0;
      }

      .mono {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.9em;
      }

      .app-container {
        display: grid;
        grid-template-columns: 320px 320px 1fr;
        height: 100%;
        width: 100%;
      }

      .panel {
        border-right: var(--hairline) solid var(--ink);
        display: flex;
        flex-direction: column;
        position: relative;
      }

      .panel:last-child {
        border-right: none;
      }

      .panel-header {
        background-color: var(--ink);
        color: var(--paper);
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .panel-header h2 {
        font-size: 16px;
      }

      .panel-content {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 32px;
        background-image: 
          linear-gradient(var(--trace) 1px, transparent 1px),
          linear-gradient(90deg, var(--trace) 1px, transparent 1px);
        background-size: 40px 40px;
        background-position: -1px -1px;
      }

      .input-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .input-label {
        font-size: 12px;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
      }

      .input-field {
        background: var(--paper);
        border: var(--hairline) solid var(--ink);
        padding: 10px 12px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 14px;
        color: var(--ink);
        outline: none;
        transition: all 0.2s;
        border-radius: 0;
      }

      .input-field:focus {
        box-shadow: 4px 4px 0 var(--ink);
        transform: translate(-1px, -1px);
      }

      .slider-container {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .slider-header {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 600;
      }

      .range-wrapper {
        position: relative;
        height: 20px;
        display: flex;
        align-items: center;
      }

      input[type=range] {
        -webkit-appearance: none;
        width: 100%;
        background: transparent;
      }

      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        height: 16px;
        width: 16px;
        border: 2px solid var(--ink);
        background: var(--paper);
        border-radius: 50%;
        cursor: pointer;
        margin-top: -7px;
        position: relative;
        z-index: 2;
      }

      input[type=range]::-webkit-slider-runnable-track {
        width: 100%;
        height: 2px;
        background: transparent;
        border-bottom: 1px dashed var(--ink);
      }

      .strategy-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .strategy-card {
        border: var(--hairline) solid var(--ink);
        background: var(--paper);
        padding: 16px;
        position: relative;
        cursor: pointer;
      }

      .strategy-card.active {
        box-shadow: 6px 6px 0 var(--ink);
        border-width: 2px;
      }

      .strategy-card-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--trace);
        padding-bottom: 8px;
      }

      .metric-row {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin-bottom: 4px;
      }

      .vis-panel {
        background-color: var(--paper);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .chart-container {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .monte-carlo-lines {
        width: 100%;
        height: 100%;
        position: relative;
        opacity: 0.8;
      }

      .sim-line {
        fill: none;
        stroke: var(--ink);
        stroke-width: 1;
        opacity: 0.15;
        vector-effect: non-scaling-stroke;
      }

      .median-line {
        fill: none;
        stroke: var(--ink);
        stroke-width: 3;
        stroke-dasharray: 8 4;
      }

      .polar-grid {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80vh;
        height: 80vh;
        border-radius: 50%;
        border: 1px dashed var(--grid);
        pointer-events: none;
      }

      .polar-grid::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60%;
        height: 60%;
        border-radius: 50%;
        border: 1px dashed var(--grid);
      }

      .polar-grid::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 140%;
        height: 140%;
        border-radius: 50%;
        border: 1px dashed var(--grid);
      }

      .btn {
        background: var(--ink);
        color: var(--paper);
        border: none;
        padding: 12px 24px;
        font-family: 'Barlow Condensed', sans-serif;
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.1em;
        cursor: pointer;
        width: 100%;
        margin-top: auto;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
      }

      .btn:hover {
        opacity: 0.9;
      }

      .stats-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 120px;
        background: var(--paper);
        border-top: 1px solid var(--ink);
        display: grid;
        grid-template-columns: repeat(4, 1fr);
      }

      .stat-box {
        border-right: 1px solid var(--trace);
        padding: 20px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .stat-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 24px;
        font-weight: 500;
      }

      .stat-label {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
        text-transform: uppercase;
      }

      .section-divider {
        height: 1px;
        background: var(--ink);
        margin: 8px 0;
      }

      .icon-plus {
        width: 12px;
        height: 12px;
        position: relative;
      }
      .icon-plus::before, .icon-plus::after {
        content: '';
        position: absolute;
        background: currentColor;
      }
      .icon-plus::before { width: 100%; height: 2px; top: 5px; }
      .icon-plus::after { height: 100%; width: 2px; left: 5px; }
    `;
    document.head.appendChild(styleTag);

    const linkBarlow = document.createElement('link');
    linkBarlow.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    linkBarlow.rel = 'stylesheet';
    document.head.appendChild(linkBarlow);

    generateSimulations();

    return () => {
      document.head.removeChild(styleTag);
      document.head.removeChild(linkBarlow);
    };
  }, []);

  const generateSimulations = () => {
    const newSimulations = [];
    for (let i = 0; i < 40; i++) {
      const yEnd = Math.random() * 350 + 20;
      const c1x = Math.random() * 200 + 50;
      const c1y = 400 - (Math.random() * 50);
      const c2x = Math.random() * 300 + 300;
      const c2y = yEnd + (Math.random() * 100);
      
      newSimulations.push({
        path: `M0,400 C${c1x},${c1y} ${c2x},${c2y} 800,${yEnd}`
      });
    }
    setSimulations(newSimulations);
  };

  const runSimulation = () => {
    generateSimulations();
    
    const newTVPI = (2 + Math.random() * 3).toFixed(2) + 'x';
    const newIRR = (10 + Math.random() * 20).toFixed(1) + '%';
    const newDist = '$' + Math.floor(fundSize * (2 + Math.random() * 3)) + 'M';
    const newLoss = Math.floor(5 + Math.random() * 20) + '%';
    
    setStats({
      tvpi: newTVPI,
      irr: newIRR,
      distributions: newDist,
      lossRatio: newLoss
    });
  };

  return (
    <div style={customStyles.body}>
      <div className="app-container">
        <aside className="panel">
          <div className="panel-header">
            <h2>1. Fund Strategy</h2>
            <span className="mono">SETUP</span>
          </div>
          <div className="panel-content">
            <InputGroup 
              label="FUND NAME"
              value={fundName}
              onChange={(e) => setFundName(e.target.value)}
            />

            <div className="section-divider"></div>

            <div className="strategy-list">
              <div className="label" style={{ fontSize: '12px', color: '#666' }}>
                SAVED MODELS
              </div>
              
              <StrategyCard
                title="SAAS LATE STAGE"
                code="A"
                checkSize="$5M - $10M"
                reserves="40%"
                isActive={activeStrategy === 'A'}
                onClick={() => setActiveStrategy('A')}
              />

              <StrategyCard
                title="DEEP TECH SEED"
                code="B"
                checkSize="$500K"
                reserves="65%"
                isActive={activeStrategy === 'B'}
                onClick={() => setActiveStrategy('B')}
              />
            </div>

            <Button
              variant="secondary"
              style={{ 
                marginTop: '24px', 
                background: 'transparent', 
                color: 'var(--ink)', 
                border: '1px solid var(--ink)' 
              }}
              onClick={() => alert('New strategy creation coming soon!')}
            >
              <IconPlus /> New Strategy
            </Button>
          </div>
        </aside>

        <aside className="panel">
          <div className="panel-header">
            <h2>2. Variables</h2>
            <span className="mono">INPUT</span>
          </div>
          <div className="panel-content">
            <div className="input-group">
              <label className="input-label">
                <span>FUND SIZE</span>
                <span className="mono">${fundSize}M</span>
              </label>
              <input 
                type="range" 
                min="10" 
                max="500" 
                value={fundSize}
                onChange={(e) => setFundSize(e.target.value)}
              />
            </div>

            <div className="section-divider"></div>

            <SliderControl
              label="MANAGEMENT FEES"
              value={managementFees}
              onChange={(e) => setManagementFees(e.target.value)}
              min={0}
              max={5}
              step={0.1}
              unit="%"
            />

            <SliderControl
              label="CARRY"
              value={carry}
              onChange={(e) => setCarry(e.target.value)}
              min={0}
              max={30}
              step={1}
              unit="%"
            />

            <div className="section-divider"></div>
            <div className="label" style={{ marginBottom: '8px' }}>
              Portfolio Construction
            </div>

            <SliderControl
              label="DEAL COUNT"
              value={dealCount}
              onChange={(e) => setDealCount(e.target.value)}
              min={10}
              max={50}
              step={1}
            />

            <SliderControl
              label="GRADUATION RATE"
              value={graduationRate}
              onChange={(e) => setGraduationRate(e.target.value)}
              min={0}
              max={100}
              step={5}
              unit="%"
            />

            <SliderControl
              label="EXIT MULTIPLE CAP"
              value={exitMultipleCap}
              onChange={(e) => setExitMultipleCap(e.target.value)}
              min={2}
              max={50}
              step={1}
              unit="x"
            />

            <Button onClick={runSimulation}>
              RUN SIMULATION
            </Button>
          </div>
        </aside>

        <main className="panel vis-panel">
          <div 
            className="panel-header" 
            style={{ 
              background: 'white', 
              color: 'black', 
              borderBottom: '1px solid black' 
            }}
          >
            <h2>3. Monte Carlo Projection</h2>
            <span className="mono">N=10,000</span>
          </div>

          <div className="chart-container">
            <div className="polar-grid"></div>

            <MonteCarloLines simulations={simulations} />
            
            <div style={{ 
              position: 'absolute', 
              bottom: '130px', 
              left: '20px', 
              fontFamily: 'JetBrains Mono', 
              fontSize: '10px' 
            }}>
              0x
            </div>
            <div style={{ 
              position: 'absolute', 
              top: '140px', 
              left: '20px', 
              fontFamily: 'JetBrains Mono', 
              fontSize: '10px' 
            }}>
              10x
            </div>
            <div style={{ 
              position: 'absolute', 
              bottom: '130px', 
              right: '20px', 
              fontFamily: 'JetBrains Mono', 
              fontSize: '10px' 
            }}>
              YR 10
            </div>
          </div>

          <div className="stats-overlay">
            <StatBox value={stats.tvpi} label="TVPI (Median)" />
            <StatBox value={stats.irr} label="IRR (Median)" />
            <StatBox value={stats.distributions} label="Distributions" />
            <StatBox value={stats.lossRatio} label="Loss Ratio" />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;