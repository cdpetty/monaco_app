import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { SimulationResponse, MOICComparisonData } from '../types/simulation';

interface ChartsProps {
  simulations: SimulationResponse[];
}

const Charts: React.FC<ChartsProps> = ({ simulations }) => {
  // Prepare data for MOIC comparison chart
  const prepareComparisonData = (): MOICComparisonData[] => {
    const percentiles = ['p25_moic', 'median_moic', 'p75_moic', 'p90_moic'];
    const percentileLabels: Record<string, string> = {
      p25_moic: '25th',
      median_moic: 'Median',
      p75_moic: '75th',
      p90_moic: '90th',
    };

    return percentiles.map((percentile) => {
      const dataPoint: MOICComparisonData = {
        percentile: percentileLabels[percentile],
      };

      simulations.forEach((sim) => {
        dataPoint[sim.name] = sim.results[percentile as keyof typeof sim.results] as number;
      });

      return dataPoint;
    });
  };

  // Prepare data for MOIC distribution histogram
  const prepareDistributionData = (moicDistribution: number[]) => {
    const bins = 20;
    const min = Math.min(...moicDistribution);
    const max = Math.max(...moicDistribution);
    const binSize = (max - min) / bins;

    const histogram: { moic: string; frequency: number }[] = [];

    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binSize;
      const binEnd = binStart + binSize;
      const count = moicDistribution.filter((m) => m >= binStart && m < binEnd).length;

      histogram.push({
        moic: `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`,
        frequency: count,
      });
    }

    return histogram;
  };

  const comparisonData = prepareComparisonData();

  // Colors for different strategies
  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];

  return (
    <div className="charts-container">
      <h2>Results Visualization</h2>

      {/* MOIC Comparison Chart */}
      <section className="chart-section">
        <h3>MOIC by Percentile - Strategy Comparison</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="percentile" />
            <YAxis label={{ value: 'MOIC', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            {simulations.map((sim, index) => (
              <Line
                key={sim.name}
                type="monotone"
                dataKey={sim.name}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Individual Distribution Charts */}
      {simulations.map((sim, index) => {
        if (!sim.moic_distribution || sim.moic_distribution.length === 0) {
          return null;
        }

        const distributionData = prepareDistributionData(sim.moic_distribution);

        return (
          <section key={sim.name} className="chart-section">
            <h3>{sim.name} - MOIC Distribution</h3>
            <div className="stats-summary">
              <div className="stat">
                <span className="stat-label">Mean:</span>
                <span className="stat-value">{sim.results.mean_moic.toFixed(2)}x</span>
              </div>
              <div className="stat">
                <span className="stat-label">Median:</span>
                <span className="stat-value">{sim.results.median_moic.toFixed(2)}x</span>
              </div>
              <div className="stat">
                <span className="stat-label">90th Percentile:</span>
                <span className="stat-value">{sim.results.p90_moic.toFixed(2)}x</span>
              </div>
              <div className="stat">
                <span className="stat-label">Std Dev:</span>
                <span className="stat-value">{sim.results.std_moic.toFixed(2)}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={distributionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="moic"
                  label={{ value: 'MOIC Range', position: 'insideBottom', offset: -5 }}
                />
                <YAxis label={{ value: 'Frequency', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="frequency" fill={colors[index % colors.length]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        );
      })}

      {/* Portfolio Statistics */}
      {simulations.length > 0 && (
        <section className="chart-section">
          <h3>Portfolio Statistics Comparison</h3>
          <div className="portfolio-stats-grid">
            {simulations.map((sim) => (
              <div key={sim.name} className="portfolio-card">
                <h4>{sim.name}</h4>
                <div className="stat-grid">
                  {sim.results.avg_total_companies !== undefined && (
                    <div className="stat">
                      <span className="stat-label">Avg Companies:</span>
                      <span className="stat-value">
                        {sim.results.avg_total_companies.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {sim.results.avg_failed_companies !== undefined && (
                    <div className="stat">
                      <span className="stat-label">Avg Failed:</span>
                      <span className="stat-value">
                        {sim.results.avg_failed_companies.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {sim.results.avg_acquired_companies !== undefined && (
                    <div className="stat">
                      <span className="stat-label">Avg Acquired:</span>
                      <span className="stat-value">
                        {sim.results.avg_acquired_companies.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {sim.results.avg_active_companies !== undefined && (
                    <div className="stat">
                      <span className="stat-label">Avg Active:</span>
                      <span className="stat-value">
                        {sim.results.avg_active_companies.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Charts;
