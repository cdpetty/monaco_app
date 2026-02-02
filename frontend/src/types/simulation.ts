// TypeScript types for the venture fund simulation

export interface SimulationConfig {
  fund_size_m: number;
  capital_per_company: number;
  deploy_percentage: number;
  check_sizes_at_entry: Record<string, number>;
  ownership_percentages_at_entry: Record<string, number>;
  pro_rata: number;
  dry_powder_reserve_for_pro_rata: number;
  pro_rata_ownership_dilution_per_round: number;
  breakout_percentile: number;
  breakout_from_series_onwards?: string;
  market_scenario: 'MARKET' | 'ABOVE_MARKET' | 'BELOW_MARKET';
  stage_valuations?: Record<string, number>;
  num_companies_to_simulate: number;
  num_iterations: number;
  num_periods: number;
}

export interface SimulationRequest {
  name: string;
  config: Partial<SimulationConfig>;
}

export interface SimulationResponse {
  name: string;
  config: SimulationConfig;
  results: {
    mean_moic: number;
    median_moic: number;
    p25_moic: number;
    p75_moic: number;
    p90_moic: number;
    std_moic: number;
    num_simulations: number;
    // Portfolio statistics
    avg_total_companies?: number;
    avg_failed_companies?: number;
    avg_active_companies?: number;
    avg_acquired_companies?: number;
    // Stage distributions
    stage_distribution?: Record<string, number>;
    // Value breakdown
    total_value_invested?: number;
    total_value_returned?: number;
  };
  moic_distribution?: number[];
}

export interface MultipleSimulationRequest {
  simulations: SimulationRequest[];
}

export interface MultipleSimulationResponse {
  simulations: SimulationResponse[];
}

export interface QuickSimulationRequest {
  fund_size_m?: number;
  num_iterations?: number;
  market_scenario?: 'MARKET' | 'ABOVE_MARKET' | 'BELOW_MARKET';
}

export interface PresetConfig {
  name: string;
  description: string;
  config: SimulationConfig;
}

export interface PresetsResponse {
  presets: PresetConfig[];
}

// Chart data types
export interface MOICComparisonData {
  percentile: string;
  [key: string]: number | string; // Dynamic keys for different strategies
}

export interface MOICDistributionData {
  moic: number;
  frequency: number;
}
