import { useState, useEffect } from 'react';
import './App.css';
import ParameterControls from './components/ParameterControls';
import Charts from './components/Charts';
import simulationApi from './services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  SimulationConfig,
  SimulationResponse,
  SimulationRequest,
  PresetConfig,
} from './types/simulation';

function App() {
  const [config, setConfig] = useState<Partial<SimulationConfig>>({
    fund_size_m: 50,
    management_fee_pct: 2,
    fee_duration_years: 10,
    recycled_capital_pct: 20,
    capital_per_company: 10,
    deploy_percentage: 90,
    check_sizes_at_entry: {
      'Pre-seed': 0.5,
      Seed: 1.0,
      'Series A': 2.0,
      'Series B': 3.0,
      'Series C': 4.0,
    },
    ownership_percentages_at_entry: {
      'Pre-seed': 0.15,
      Seed: 0.12,
      'Series A': 0.10,
      'Series B': 0.08,
      'Series C': 0.06,
    },
    pro_rata: 0.5,
    dry_powder_reserve_for_pro_rata: 30,
    pro_rata_ownership_dilution_per_round: 0.2,
    breakout_percentile: 10,
    market_scenario: 'MARKET',
    num_iterations: 3000,
    num_periods: 8,
  });

  const [simulations, setSimulations] = useState<SimulationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetConfig[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  // Check API health on mount
  useEffect(() => {
    checkApiHealth();
    loadPresets();
  }, []);

  const checkApiHealth = async () => {
    try {
      await simulationApi.healthCheck();
      setApiStatus('connected');
    } catch (err) {
      setApiStatus('disconnected');
      console.error('API health check failed:', err);
    }
  };

  const loadPresets = async () => {
    try {
      const response = await simulationApi.getPresets();
      setPresets(response.presets);
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  };

  const handleRunSimulation = async () => {
    setLoading(true);
    setError(null);

    try {
      const request: SimulationRequest = {
        name: 'Current Strategy',
        config: config,
      };

      const result = await simulationApi.runSimulation(request);
      setSimulations([result]);
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail;
      let errorMessage = 'Failed to run simulation';

      if (Array.isArray(errorDetail)) {
        errorMessage = errorDetail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
      } else if (typeof errorDetail === 'string') {
        errorMessage = errorDetail;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      console.error('Simulation error:', err);
      console.error('Error detail:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const handleCompareStrategies = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create variations of the current config for comparison
      const strategies: SimulationRequest[] = [
        {
          name: 'Current Strategy',
          config: config,
        },
        {
          name: 'High Pro-Rata',
          config: { ...config, pro_rata: 1.0, dry_powder_reserve_for_pro_rata: 50 },
        },
        {
          name: 'No Pro-Rata',
          config: { ...config, pro_rata: 0, dry_powder_reserve_for_pro_rata: 0 },
        },
      ];

      const result = await simulationApi.runMultipleSimulations({
        simulations: strategies,
      });

      setSimulations(result.simulations);
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail;
      let errorMessage = 'Failed to compare strategies';

      if (Array.isArray(errorDetail)) {
        errorMessage = errorDetail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
      } else if (typeof errorDetail === 'string') {
        errorMessage = errorDetail;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      console.error('Comparison error:', err);
      console.error('Error detail:', err.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPreset = (presetName: string) => {
    const preset = presets.find((p) => p.name === presetName);
    if (preset) {
      setConfig(preset.config);
      setSelectedPreset(presetName);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Monaco
            </h1>
            <span className="text-sm text-muted-foreground">Venture Fund Simulator</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${apiStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted-foreground">
              {apiStatus === 'connected' ? 'Connected' : apiStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
            </span>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Preset Selection */}
            {presets && presets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Load Preset</CardTitle>
                  <CardDescription>Choose a predefined strategy</CardDescription>
                </CardHeader>
                <CardContent>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={selectedPreset}
                    onChange={(e) => handleLoadPreset(e.target.value)}
                  >
                    <option value="">-- Select Preset --</option>
                    {presets.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>
            )}

            {/* Parameter Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Parameters</CardTitle>
                <CardDescription>Configure your simulation</CardDescription>
              </CardHeader>
              <CardContent>
                <ParameterControls config={config} onChange={setConfig} />
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleRunSimulation}
                disabled={loading || apiStatus !== 'connected'}
              >
                {loading ? 'Running...' : 'Run Simulation'}
              </Button>

              <Button
                className="w-full"
                variant="secondary"
                onClick={handleCompareStrategies}
                disabled={loading || apiStatus !== 'connected'}
              >
                {loading ? 'Comparing...' : 'Compare Strategies'}
              </Button>
            </div>

            {/* Error Display */}
            {error && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-sm text-destructive">Error</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-destructive">{error}</p>
                </CardContent>
              </Card>
            )}

            {/* API Disconnected Warning */}
            {apiStatus === 'disconnected' && (
              <Card className="border-yellow-500">
                <CardHeader>
                  <CardTitle className="text-sm text-yellow-600">Warning</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-yellow-600">
                    Cannot connect to API server. Please make sure the backend is running at http://localhost:8000
                  </p>
                </CardContent>
              </Card>
            )}
          </aside>

          {/* Main Content */}
          <main>
            {loading && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="spinner mb-4" />
                  <p className="text-muted-foreground">Running Monte Carlo simulation...</p>
                </CardContent>
              </Card>
            )}

            {!loading && simulations.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <h2 className="text-2xl font-bold mb-2">Welcome to Monaco</h2>
                  <p className="text-muted-foreground max-w-md">
                    Configure your venture fund parameters in the sidebar and run a simulation to see results.
                  </p>
                </CardContent>
              </Card>
            )}

            {!loading && simulations.length > 0 && <Charts simulations={simulations} />}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
