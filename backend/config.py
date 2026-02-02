"""
Configuration constants for Monte Carlo simulation.

This module contains default values for:
- Funding stages
- Stage valuations
- Dilution rates
- Graduation rates (market, above-market, below-market scenarios)
- Fund lifespan parameters
"""

from typing import Dict, List

# Default funding stages
DEFAULT_STAGES: List[str] = [
    'Pre-seed',
    'Seed',
    'Series A',
    'Series B',
    'Series C',
    'Series D',
    'Series E',
    'Series F',
    'Series G'
]

# Default stage dilution rates
DEFAULT_STAGE_DILUTION: Dict[str, float] = {
    'Seed': 0.20,
    'Series A': 0.22,
    'Series B': 0.2,
    'Series C': 0.15,
    'Series D': 0.1,
    'Series E': 0.08,
    'Series F': 0.08,
    'Series G': 0.08
}

# Default stage valuations (in millions)
DEFAULT_STAGE_VALUATIONS: Dict[str, float] = {
    'Pre-seed': 15,
    'Seed': 30,
    'Series A': 70,
    'Series B': 200,
    'Series C': 500,
    'Series D': 750,
    'Series E': 1500,
    'Series F': 5000,
    'Series G': 10000,
}

# Alternative valuation scenario with outsized Series G
STAGE_VALUATIONS_OUTSIZED_SERIES_G: Dict[str, float] = {
    'Pre-seed': 15,
    'Seed': 30,
    'Series A': 70,
    'Series B': 200,
    'Series C': 500,
    'Series D': 750,
    'Series E': 1500,
    'Series F': 5000,
    'Series G': 25000,
}

# Default fund lifespan parameters
DEFAULT_LIFESPAN_PERIODS: int = 8
DEFAULT_LIFESPAN_YEARS: int = 13

# Graduation rates represent [promote to next round, fail, M&A exit]
# Probabilities for each outcome at each stage

# Market scenario - modest performance relative to 2010s
MARKET: Dict[str, List[float]] = {
    'Pre-seed': [0.50, 0.35, 0.15],
    'Seed': [0.50, 0.35, 0.15],
    'Series A': [0.50, 0.30, 0.20],
    'Series B': [0.50, 0.25, 0.25],
    'Series C': [0.50, 0.25, 0.25],
    'Series D': [0.50, 0.25, 0.25],
    'Series E': [0.40, 0.30, 0.30],
    'Series F': [0.30, 0.30, 0.30],
    'Series G': [0.0, 0.0, 0.0]  # Terminal stage
}

# Above-market scenario - better than average performance
ABOVE_MARKET: Dict[str, List[float]] = {
    'Pre-seed': [0.60, 0.30, 0.10],
    'Seed': [0.60, 0.30, 0.10],
    'Series A': [0.60, 0.25, 0.15],
    'Series B': [0.55, 0.25, 0.20],
    'Series C': [0.55, 0.25, 0.20],
    'Series D': [0.55, 0.25, 0.20],
    'Series E': [0.40, 0.30, 0.30],
    'Series F': [0.30, 0.30, 0.30],
    'Series G': [0.0, 0.0, 0.0]  # Terminal stage
}

# Below-market scenario - simpler coin tosses with slightly better M&A at later stages
BELOW_MARKET: Dict[str, List[float]] = {
    'Pre-seed': [0.45, 0.40, 0.15],
    'Seed': [0.45, 0.40, 0.15],
    'Series A': [0.50, 0.35, 0.15],
    'Series B': [0.50, 0.35, 0.15],
    'Series C': [0.50, 0.30, 0.20],
    'Series D': [0.50, 0.30, 0.20],
    'Series E': [0.40, 0.30, 0.30],
    'Series F': [0.30, 0.40, 0.20],
    'Series G': [0.0, 0.0, 0.0]  # Terminal stage
}

# Example default configuration for a $200M fund
DEFAULT_FUND_CONFIG = {
    'stages': DEFAULT_STAGES,
    'graduation_rates': MARKET,
    'stage_dilution': DEFAULT_STAGE_DILUTION,
    'stage_valuations': DEFAULT_STAGE_VALUATIONS,
    'lifespan_periods': DEFAULT_LIFESPAN_PERIODS,
    'lifespan_years': DEFAULT_LIFESPAN_YEARS,
    'primary_investments': {'Pre-seed': 170},
    'initial_investment_sizes': {'Pre-seed': 1.5},
    'follow_on_reserve': 30,
    'fund_size': 200,
    'pro_rata_at_or_below': 70,
    'num_scenarios': 10000
}

# Example configuration with mixed Pre-seed and Seed investments
MIXED_STAGE_CONFIG = {
    'stages': DEFAULT_STAGES,
    'graduation_rates': MARKET,
    'stage_dilution': DEFAULT_STAGE_DILUTION,
    'stage_valuations': DEFAULT_STAGE_VALUATIONS,
    'lifespan_periods': DEFAULT_LIFESPAN_PERIODS,
    'lifespan_years': DEFAULT_LIFESPAN_YEARS,
    'primary_investments': {'Pre-seed': 85, 'Seed': 85},
    'initial_investment_sizes': {'Pre-seed': 1.5, 'Seed': 4},
    'follow_on_reserve': 30,
    'fund_size': 200,
    'pro_rata_at_or_below': 70,
    'num_scenarios': 3000
}
