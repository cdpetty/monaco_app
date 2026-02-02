import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { SimulationConfig } from '../types/simulation';

interface ParameterControlsProps {
  config: Partial<SimulationConfig>;
  onChange: (config: Partial<SimulationConfig>) => void;
}

const ParameterControls: React.FC<ParameterControlsProps> = ({ config, onChange }) => {
  const handleChange = (field: keyof SimulationConfig, value: any) => {
    onChange({ ...config, [field]: value });
  };

  const handleCheckSizeChange = (stage: string, value: number) => {
    const newCheckSizes = { ...config.check_sizes_at_entry, [stage]: value };
    onChange({ ...config, check_sizes_at_entry: newCheckSizes });
  };

  const handleOwnershipChange = (stage: string, value: number) => {
    const newOwnership = { ...config.ownership_percentages_at_entry, [stage]: value };
    onChange({ ...config, ownership_percentages_at_entry: newOwnership });
  };

  return (
    <div className="space-y-6">
      {/* Fund Parameters */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Fund Parameters</h3>

        <div className="space-y-2">
          <Label htmlFor="fund_size">Fund Size (M)</Label>
          <Input
            id="fund_size"
            type="number"
            value={config.fund_size_m || 0}
            onChange={(e) => handleChange('fund_size_m', parseFloat(e.target.value))}
            step={10}
            min={0}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="deploy_percentage">Deploy Percentage (%)</Label>
          <Input
            id="deploy_percentage"
            type="number"
            value={config.deploy_percentage || 0}
            onChange={(e) => handleChange('deploy_percentage', parseFloat(e.target.value))}
            step={5}
            min={0}
            max={100}
          />
        </div>
      </div>

      {/* Investment Strategy */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Investment Strategy</h3>

        <div className="space-y-2">
          <Label htmlFor="pro_rata">Pro-Rata Participation</Label>
          <Input
            id="pro_rata"
            type="number"
            value={config.pro_rata || 0}
            onChange={(e) => handleChange('pro_rata', parseFloat(e.target.value))}
            step={0.1}
            min={0}
            max={1}
          />
          <p className="text-xs text-muted-foreground">0 = No follow-on, 1 = Full pro-rata</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dry_powder">Dry Powder Reserve (%)</Label>
          <Input
            id="dry_powder"
            type="number"
            value={config.dry_powder_reserve_for_pro_rata || 0}
            onChange={(e) => handleChange('dry_powder_reserve_for_pro_rata', parseFloat(e.target.value))}
            step={5}
            min={0}
            max={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="breakout_percentile">Breakout Percentile</Label>
          <Input
            id="breakout_percentile"
            type="number"
            value={config.breakout_percentile || 0}
            onChange={(e) => handleChange('breakout_percentile', parseFloat(e.target.value))}
            step={5}
            min={0}
            max={100}
          />
          <p className="text-xs text-muted-foreground">Top X% of companies become breakouts</p>
        </div>
      </div>

      {/* Market Conditions */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Market Conditions</h3>

        <div className="space-y-2">
          <Label htmlFor="market_scenario">Market Scenario</Label>
          <select
            id="market_scenario"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={config.market_scenario || 'MARKET'}
            onChange={(e) => handleChange('market_scenario', e.target.value as any)}
          >
            <option value="BELOW_MARKET">Below Market</option>
            <option value="MARKET">Market</option>
            <option value="ABOVE_MARKET">Above Market</option>
          </select>
        </div>
      </div>

      {/* Simulation Parameters */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Simulation Parameters</h3>

        <div className="space-y-2">
          <Label htmlFor="num_iterations">Number of Iterations</Label>
          <Input
            id="num_iterations"
            type="number"
            value={config.num_iterations || 3000}
            onChange={(e) => handleChange('num_iterations', parseInt(e.target.value))}
            step={1000}
            min={100}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="num_periods">Number of Periods</Label>
          <Input
            id="num_periods"
            type="number"
            value={config.num_periods || 8}
            onChange={(e) => handleChange('num_periods', parseInt(e.target.value))}
            step={1}
            min={1}
            max={20}
          />
        </div>
      </div>
    </div>
  );
};

export default ParameterControls;
