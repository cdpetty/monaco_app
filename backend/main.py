"""
FastAPI application for Monaco Monte Carlo simulation.

This module provides REST API endpoints for:
- Running Monte Carlo simulations
- Comparing multiple strategies
- Retrieving simulation results and statistics
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
import uvicorn

from models import Montecarlo_Sim_Configuration, Montecarlo
from simulation import Experiment
from config import (
    DEFAULT_STAGES,
    DEFAULT_STAGE_DILUTION,
    DEFAULT_STAGE_VALUATIONS,
    DEFAULT_LIFESPAN_PERIODS,
    DEFAULT_LIFESPAN_YEARS,
    MARKET,
    ABOVE_MARKET,
    BELOW_MARKET
)

app = FastAPI(
    title="Monaco Monte Carlo Simulation API",
    description="API for running venture capital fund Monte Carlo simulations",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic models for request/response validation
class SimulationConfig(BaseModel):
    """Simulation configuration matching frontend schema."""
    fund_size_m: Optional[float] = Field(default=50, description="Fund size in millions")
    capital_per_company: Optional[float] = Field(default=10, description="Capital per company in millions")
    deploy_percentage: Optional[float] = Field(default=90, description="Percentage of fund to deploy")
    check_sizes_at_entry: Optional[Dict[str, float]] = Field(default=None, description="Check sizes by stage in millions")
    ownership_percentages_at_entry: Optional[Dict[str, float]] = Field(default=None, description="Target ownership by stage")
    pro_rata: Optional[float] = Field(default=0.5, description="Pro-rata participation (0-1) [deprecated]")
    pro_rata_max_valuation: Optional[float] = Field(default=None, description="Max valuation ($M) for pro-rata follow-on")
    dry_powder_reserve_for_pro_rata: Optional[float] = Field(default=30, description="Reserve for pro-rata (%)")
    pro_rata_ownership_dilution_per_round: Optional[float] = Field(default=0.2, description="Dilution per round")
    breakout_percentile: Optional[float] = Field(default=10, description="Breakout percentile")
    breakout_from_series_onwards: Optional[str] = Field(default="Series A", description="Breakout starting stage")
    market_scenario: Optional[str] = Field(default="MARKET", description="Market scenario")
    graduation_rates: Optional[Dict[str, List[float]]] = Field(default=None, description="Custom graduation rates by stage")
    stage_valuations: Optional[Dict[str, float]] = Field(default=None, description="Custom stage valuations")
    num_companies_to_simulate: Optional[int] = Field(default=100, description="Number of companies")
    num_iterations: Optional[int] = Field(default=3000, description="Number of iterations")
    num_periods: Optional[int] = Field(default=8, description="Number of periods")


class SimulationRequest(BaseModel):
    """Request for running a simulation."""
    name: str = Field(description="Strategy name")
    config: SimulationConfig = Field(description="Simulation configuration")


class MultipleSimulationRequest(BaseModel):
    """Request for running multiple simulations."""
    simulations: List[SimulationRequest] = Field(description="List of simulations to run")


class SimulationConfigRequest(BaseModel):
    """Legacy request model for backward compatibility."""
    stages: Optional[List[str]] = Field(default=DEFAULT_STAGES)
    graduation_rates: Optional[Dict[str, List[float]]] = Field(default=MARKET)
    stage_dilution: Optional[Dict[str, float]] = Field(default=DEFAULT_STAGE_DILUTION)
    stage_valuations: Optional[Dict[str, float]] = Field(default=DEFAULT_STAGE_VALUATIONS)
    lifespan_periods: Optional[int] = Field(default=DEFAULT_LIFESPAN_PERIODS)
    lifespan_years: Optional[int] = Field(default=DEFAULT_LIFESPAN_YEARS)
    primary_investments: Dict[str, float] = Field(
        description="Primary investment amounts by stage",
        example={"Pre-seed": 170}
    )
    initial_investment_sizes: Dict[str, float] = Field(
        description="Initial check sizes by stage",
        example={"Pre-seed": 1.5}
    )
    follow_on_reserve: float = Field(description="Follow-on reserve amount")
    fund_size: float = Field(description="Total fund size")
    pro_rata_at_or_below: float = Field(description="Pro-rata valuation threshold")
    num_scenarios: int = Field(default=1000, description="Number of Monte Carlo scenarios")


class SimulationResultResponse(BaseModel):
    """Response model for simulation results."""
    fund_size: float
    follow_on_reserve: float
    pro_rata_at_or_below: float
    avg_portfolio_size: float
    total_MOIC: float
    percentile_25th: float = Field(alias="25th_percentile")
    percentile_50th: float = Field(alias="50th_percentile")
    percentile_75th: float = Field(alias="75th_percentile")
    percentile_90th: float = Field(alias="90th_percentile")
    alive_companies: int = Field(alias="Alive Companies")
    failed_companies: int = Field(alias="Failed Companies")
    acquired_companies: int = Field(alias="Acquired Companies")
    total_value_alive: float
    total_value_acquired: float

    class Config:
        allow_population_by_field_name = True


class MultiStrategyRequest(BaseModel):
    """Request model for comparing multiple strategies."""
    configs: List[SimulationConfigRequest]


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Monaco Monte Carlo Simulation API",
        "version": "1.0.0",
        "description": "API for running venture capital fund Monte Carlo simulations"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/presets")
async def get_presets():
    """Get available preset configurations."""
    presets = [
        {
            "name": "Conservative Fund",
            "description": "Low risk, diversified portfolio with minimal pro-rata",
            "config": {
                "fund_size_m": 50,
                "capital_per_company": 8,
                "deploy_percentage": 85,
                "check_sizes_at_entry": {
                    "Pre-seed": 0.5,
                    "Seed": 1.0,
                    "Series A": 1.5,
                    "Series B": 2.0,
                    "Series C": 3.0
                },
                "ownership_percentages_at_entry": {
                    "Pre-seed": 0.15,
                    "Seed": 0.12,
                    "Series A": 0.10,
                    "Series B": 0.08,
                    "Series C": 0.06
                },
                "pro_rata": 0.3,
                "dry_powder_reserve_for_pro_rata": 20,
                "pro_rata_ownership_dilution_per_round": 0.2,
                "breakout_percentile": 15,
                "market_scenario": "MARKET",
                "num_iterations": 3000,
                "num_periods": 8
            }
        },
        {
            "name": "Aggressive Growth",
            "description": "High conviction, concentrated bets with full pro-rata",
            "config": {
                "fund_size_m": 100,
                "capital_per_company": 15,
                "deploy_percentage": 95,
                "check_sizes_at_entry": {
                    "Pre-seed": 1.0,
                    "Seed": 2.0,
                    "Series A": 3.0,
                    "Series B": 5.0,
                    "Series C": 8.0
                },
                "ownership_percentages_at_entry": {
                    "Pre-seed": 0.20,
                    "Seed": 0.15,
                    "Series A": 0.12,
                    "Series B": 0.10,
                    "Series C": 0.08
                },
                "pro_rata": 1.0,
                "dry_powder_reserve_for_pro_rata": 50,
                "pro_rata_ownership_dilution_per_round": 0.15,
                "breakout_percentile": 5,
                "market_scenario": "ABOVE_MARKET",
                "num_iterations": 3000,
                "num_periods": 8
            }
        },
        {
            "name": "Seed Specialist",
            "description": "Focus on seed stage with moderate follow-on",
            "config": {
                "fund_size_m": 75,
                "capital_per_company": 12,
                "deploy_percentage": 90,
                "check_sizes_at_entry": {
                    "Pre-seed": 0.75,
                    "Seed": 2.5,
                    "Series A": 3.0,
                    "Series B": 4.0,
                    "Series C": 5.0
                },
                "ownership_percentages_at_entry": {
                    "Pre-seed": 0.12,
                    "Seed": 0.18,
                    "Series A": 0.12,
                    "Series B": 0.10,
                    "Series C": 0.08
                },
                "pro_rata": 0.6,
                "dry_powder_reserve_for_pro_rata": 35,
                "pro_rata_ownership_dilution_per_round": 0.18,
                "breakout_percentile": 10,
                "market_scenario": "MARKET",
                "num_iterations": 3000,
                "num_periods": 8
            }
        }
    ]

    return {"presets": presets}


def convert_frontend_config_to_backend(sim_config: SimulationConfig) -> Dict[str, Any]:
    """Convert frontend simulation config to backend format."""
    # Get market scenario graduation rates
    market_scenarios = {
        "BELOW_MARKET": BELOW_MARKET,
        "MARKET": MARKET,
        "ABOVE_MARKET": ABOVE_MARKET
    }
    if sim_config.graduation_rates:
        graduation_rates = sim_config.graduation_rates
    else:
        graduation_rates = market_scenarios.get(sim_config.market_scenario or "MARKET", MARKET)

    # All values in millions to match stage_valuations and internal model units
    fund_size = sim_config.fund_size_m or 50

    # Calculate follow-on reserve
    dry_powder_pct = (sim_config.dry_powder_reserve_for_pro_rata or 30) / 100
    follow_on_reserve = fund_size * dry_powder_pct

    # Calculate total primary investment (must equal fund_size - follow_on_reserve)
    total_primary_investment = fund_size - follow_on_reserve

    # Distribute primary investment across stages that have check sizes
    check_sizes = sim_config.check_sizes_at_entry or {}
    primary_investments = {}
    initial_investment_sizes = {}

    if check_sizes:
        # Split primary capital proportionally across provided stages
        num_entry_stages = len(check_sizes)
        per_stage = total_primary_investment / num_entry_stages
        for stage, check in check_sizes.items():
            primary_investments[stage] = per_stage
            initial_investment_sizes[stage] = check  # already in millions
    else:
        # Fallback: all to Pre-seed at $1.5M checks
        primary_investments['Pre-seed'] = total_primary_investment
        initial_investment_sizes['Pre-seed'] = 1.5

    # Pro-rata threshold (in same units as stage_valuations, i.e. millions)
    if sim_config.pro_rata_max_valuation is not None:
        pro_rata_at_or_below = sim_config.pro_rata_max_valuation
    else:
        pro_rata_factor = sim_config.pro_rata or 0.5
        pro_rata_at_or_below = 1000 if pro_rata_factor > 0.5 else 50

    return {
        "stages": DEFAULT_STAGES,
        "graduation_rates": graduation_rates,
        "stage_dilution": DEFAULT_STAGE_DILUTION,
        "stage_valuations": sim_config.stage_valuations or DEFAULT_STAGE_VALUATIONS,
        "lifespan_periods": sim_config.num_periods or DEFAULT_LIFESPAN_PERIODS,
        "lifespan_years": DEFAULT_LIFESPAN_YEARS,
        "primary_investments": primary_investments,
        "initial_investment_sizes": initial_investment_sizes,
        "follow_on_reserve": follow_on_reserve,
        "fund_size": fund_size,
        "pro_rata_at_or_below": pro_rata_at_or_below,
        "num_scenarios": sim_config.num_iterations or 3000
    }


@app.post("/api/simulate")
async def run_simulation(request: SimulationRequest) -> Dict[str, Any]:
    """
    Run a single Monte Carlo simulation.

    Args:
        request: Simulation request with name and configuration

    Returns:
        Simulation results including MOIC statistics and portfolio metrics
    """
    try:
        # Convert frontend config to backend format
        config_dict = convert_frontend_config_to_backend(request.config)

        # Create experiment
        experiment = Experiment()

        # Create configuration
        config = experiment.create_montecarlo_sim_configuration(config_dict)
        if not config:
            raise HTTPException(status_code=400, detail="Invalid configuration")

        # Run simulation
        result = experiment.run_montecarlo(config)
        if not result:
            raise HTTPException(status_code=400, detail="Simulation failed")

        # Transform backend result format to frontend format
        transformed_results = {
            "mean_moic": result.get("total_MOIC", 0),
            "median_moic": result.get("50th_percentile", 0),
            "p25_moic": result.get("25th_percentile", 0),
            "p75_moic": result.get("75th_percentile", 0),
            "p90_moic": result.get("90th_percentile", 0),
            "std_moic": 0,  # Not calculated in backend yet
            "num_simulations": config_dict["num_scenarios"],
            "avg_total_companies": result.get("avg_portfolio_size", 0),
            "avg_failed_companies": result.get("Failed Companies", 0),
            "avg_active_companies": result.get("Alive Companies", 0),
            "avg_acquired_companies": result.get("Acquired Companies", 0),
            "total_value_invested": result.get("fund_size", 0),
            "total_value_returned": result.get("total_value_acquired", 0) + result.get("total_value_alive", 0),
        }

        return {
            "name": request.name,
            "config": request.config.dict(),
            "results": transformed_results,
            "moic_distribution": result.get("moic_outcomes", []),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


@app.post("/api/simulate/multiple")
async def run_multiple_simulations(request: MultipleSimulationRequest) -> Dict[str, Any]:
    """
    Run multiple Monte Carlo simulations with different strategies.

    Args:
        request: Multiple simulation configurations

    Returns:
        Comparative results for all strategies
    """
    try:
        experiment = Experiment()

        # Run each simulation
        all_results = []
        for sim_request in request.simulations:
            # Convert frontend config to backend format
            config_dict = convert_frontend_config_to_backend(sim_request.config)

            # Create configuration
            config = experiment.create_montecarlo_sim_configuration(config_dict)
            if not config:
                continue

            # Run simulation
            result = experiment.run_montecarlo(config)
            if result:
                # Transform backend result format to frontend format
                transformed_results = {
                    "mean_moic": result.get("total_MOIC", 0),
                    "median_moic": result.get("50th_percentile", 0),
                    "p25_moic": result.get("25th_percentile", 0),
                    "p75_moic": result.get("75th_percentile", 0),
                    "p90_moic": result.get("90th_percentile", 0),
                    "std_moic": 0,  # Not calculated in backend yet
                    "num_simulations": config_dict["num_scenarios"],
                    "avg_total_companies": result.get("avg_portfolio_size", 0),
                    "avg_failed_companies": result.get("Failed Companies", 0),
                    "avg_active_companies": result.get("Alive Companies", 0),
                    "avg_acquired_companies": result.get("Acquired Companies", 0),
                    "total_value_invested": result.get("fund_size", 0),
                    "total_value_returned": result.get("total_value_acquired", 0) + result.get("total_value_alive", 0),
                }

                all_results.append({
                    "name": sim_request.name,
                    "config": sim_request.config.dict(),
                    "results": transformed_results,
                    "moic_distribution": result.get("moic_outcomes", []),
                })

        if not all_results:
            raise HTTPException(status_code=400, detail="No valid simulations completed")

        return {
            "simulations": all_results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


@app.get("/api/tests/run")
async def run_tests():
    """Execute the simulation test suite and return results."""
    try:
        from test_runner import run_all_tests
        results = run_all_tests()
        passed = sum(1 for r in results if r['passed'])
        return {
            "passed": passed,
            "total": len(results),
            "all_passed": passed == len(results),
            "tests": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test execution error: {str(e)}")


@app.get("/api/presets")
async def get_presets():
    """
    Get preset configurations for quick testing.

    Returns:
        Dictionary of preset configurations
    """
    return {
        "market_scenarios": {
            "market": MARKET,
            "above_market": ABOVE_MARKET,
            "below_market": BELOW_MARKET
        },
        "valuations": {
            "default": DEFAULT_STAGE_VALUATIONS
        },
        "dilution": DEFAULT_STAGE_DILUTION,
        "example_configs": {
            "preseed_focused": {
                "primary_investments": {"Pre-seed": 170},
                "initial_investment_sizes": {"Pre-seed": 1.5},
                "follow_on_reserve": 30,
                "fund_size": 200,
                "pro_rata_at_or_below": 70,
                "num_scenarios": 1000
            },
            "mixed_stage": {
                "primary_investments": {"Pre-seed": 85, "Seed": 85},
                "initial_investment_sizes": {"Pre-seed": 1.5, "Seed": 4},
                "follow_on_reserve": 30,
                "fund_size": 200,
                "pro_rata_at_or_below": 70,
                "num_scenarios": 1000
            }
        }
    }


@app.post("/api/simulate/quick")
async def run_quick_simulation(
    fund_size: float = 200,
    preseed_amount: float = 170,
    preseed_check_size: float = 1.5,
    follow_on_reserve: float = 30,
    num_scenarios: int = 1000
) -> Dict[str, Any]:
    """
    Run a quick simulation with simplified parameters.

    Args:
        fund_size: Total fund size in millions
        preseed_amount: Total pre-seed investment amount
        preseed_check_size: Individual pre-seed check size
        follow_on_reserve: Follow-on reserve amount
        num_scenarios: Number of scenarios to simulate

    Returns:
        Simplified simulation results
    """
    try:
        config_dict = {
            'stages': DEFAULT_STAGES,
            'graduation_rates': MARKET,
            'stage_dilution': DEFAULT_STAGE_DILUTION,
            'stage_valuations': DEFAULT_STAGE_VALUATIONS,
            'lifespan_periods': DEFAULT_LIFESPAN_PERIODS,
            'lifespan_years': DEFAULT_LIFESPAN_YEARS,
            'primary_investments': {'Pre-seed': preseed_amount},
            'initial_investment_sizes': {'Pre-seed': preseed_check_size},
            'follow_on_reserve': follow_on_reserve,
            'fund_size': fund_size,
            'pro_rata_at_or_below': 70,
            'num_scenarios': num_scenarios
        }

        experiment = Experiment()
        config = experiment.create_montecarlo_sim_configuration(config_dict)

        if not config:
            raise HTTPException(status_code=400, detail="Invalid configuration")

        result = experiment.run_montecarlo(config)

        if not result:
            raise HTTPException(status_code=400, detail="Simulation failed")

        # Return simplified response
        return {
            "success": True,
            "summary": {
                "fund_size": fund_size,
                "num_scenarios": num_scenarios,
                "median_moic": result['50th_percentile'],
                "mean_moic": result['total_MOIC'],
                "p25_moic": result['25th_percentile'],
                "p75_moic": result['75th_percentile'],
                "p90_moic": result['90th_percentile'],
                "avg_portfolio_size": result['avg_portfolio_size']
            },
            "full_results": result
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
