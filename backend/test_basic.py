#!/usr/bin/env python3
"""
Basic test script to verify the backend modules work correctly.
Run this before starting the API server to verify everything is set up.
"""

def test_imports():
    """Test that all modules can be imported."""
    print("Testing imports...")
    try:
        import models
        import simulation
        import config
        import main
        print("  All imports successful!")
        return True
    except ImportError as e:
        print(f"  Import failed: {e}")
        return False


def test_configuration():
    """Test creating a configuration object."""
    print("\nTesting configuration creation...")
    try:
        from models import Montecarlo_Sim_Configuration
        from config import DEFAULT_STAGES, MARKET, DEFAULT_STAGE_DILUTION, DEFAULT_STAGE_VALUATIONS

        config = Montecarlo_Sim_Configuration(
            stages=DEFAULT_STAGES,
            graduation_rates=MARKET,
            stage_dilution=DEFAULT_STAGE_DILUTION,
            stage_valuations=DEFAULT_STAGE_VALUATIONS,
            lifespan_periods=8,
            lifespan_years=13,
            primary_investments={'Pre-seed': 170},
            initial_investment_sizes={'Pre-seed': 1.5},
            follow_on_reserve=30,
            fund_size=200,
            pro_rata_at_or_below=70,
            num_scenarios=10
        )
        print(f"  Configuration created: Fund size ${config.fund_size}M")
        return True
    except Exception as e:
        print(f"  Configuration test failed: {e}")
        return False


def test_small_simulation():
    """Test running a small simulation."""
    print("\nTesting small simulation (10 scenarios)...")
    try:
        from models import Montecarlo_Sim_Configuration, Montecarlo
        from config import DEFAULT_STAGES, MARKET, DEFAULT_STAGE_DILUTION, DEFAULT_STAGE_VALUATIONS

        config = Montecarlo_Sim_Configuration(
            stages=DEFAULT_STAGES,
            graduation_rates=MARKET,
            stage_dilution=DEFAULT_STAGE_DILUTION,
            stage_valuations=DEFAULT_STAGE_VALUATIONS,
            lifespan_periods=8,
            lifespan_years=13,
            primary_investments={'Pre-seed': 170},
            initial_investment_sizes={'Pre-seed': 1.5},
            follow_on_reserve=30,
            fund_size=200,
            pro_rata_at_or_below=70,
            num_scenarios=10
        )

        montecarlo = Montecarlo(config)
        montecarlo.initialize_scenarios()
        print(f"  Initialized {len(montecarlo.firm_scenarios)} scenarios")

        montecarlo.simulate()
        print("  Simulation completed")

        outcomes = montecarlo.get_MoM_return_outcomes()
        median = montecarlo.get_median_return_outcome('MoM')
        print(f"  Median MOIC: {median}x")
        print(f"  Results: min={min(outcomes):.2f}x, max={max(outcomes):.2f}x")

        return True
    except Exception as e:
        print(f"  Simulation test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_experiment():
    """Test the Experiment class."""
    print("\nTesting Experiment class...")
    try:
        from simulation import Experiment
        from config import DEFAULT_FUND_CONFIG

        experiment = Experiment()
        configs = experiment.generate_montecarlo_configurations(DEFAULT_FUND_CONFIG)
        print(f"  Generated {len(configs)} configuration(s)")

        return True
    except Exception as e:
        print(f"  Experiment test failed: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("Monaco Backend Basic Tests")
    print("=" * 60)

    tests = [
        test_imports,
        test_configuration,
        test_experiment,
        test_small_simulation
    ]

    results = []
    for test in tests:
        results.append(test())

    print("\n" + "=" * 60)
    print(f"Results: {sum(results)}/{len(results)} tests passed")
    print("=" * 60)

    if all(results):
        print("\n SUCCESS! Backend is working correctly.")
        print("\nYou can now start the API server with:")
        print("  ./run.sh")
        print("  or")
        print("  python main.py")
        return 0
    else:
        print("\n FAILED: Some tests did not pass.")
        print("\nPlease check the error messages above.")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
