"""
Test runner for Monte Carlo simulation logic.

Provides deterministic and statistical tests that validate
portfolio construction, dilution math, pro-rata logic,
M&A outcomes, MOIC calculations, and probability distributions.
"""

import random
import math
import numpy as np
from typing import List, Dict, Any

from models import Company, Firm, Montecarlo, Montecarlo_Sim_Configuration
from simulation import Experiment
from main import convert_frontend_config_to_backend, SimulationConfig
from config import (
    DEFAULT_STAGES, MARKET, ABOVE_MARKET, BELOW_MARKET,
    DEFAULT_STAGE_DILUTION,
    DEFAULT_STAGE_VALUATIONS, DEFAULT_LIFESPAN_PERIODS, DEFAULT_LIFESPAN_YEARS
)


def make_config(num_scenarios=1, **overrides):
    """Create a standard test configuration."""
    params = dict(
        stages=DEFAULT_STAGES,
        graduation_rates=MARKET,
        stage_dilution=DEFAULT_STAGE_DILUTION,
        stage_valuations=DEFAULT_STAGE_VALUATIONS,
        lifespan_periods=DEFAULT_LIFESPAN_PERIODS,
        lifespan_years=DEFAULT_LIFESPAN_YEARS,
        primary_investments={'Pre-seed': 170},
        initial_investment_sizes={'Pre-seed': 1.5},
        follow_on_reserve=30,
        fund_size=200,
        pro_rata_at_or_below=70,
        num_scenarios=num_scenarios,
    )
    params.update(overrides)
    return Montecarlo_Sim_Configuration(**params)


def make_company(stage='Pre-seed', valuation=None, ownership=None, invested=None):
    """Create a single Company for unit testing."""
    if valuation is None:
        valuation = DEFAULT_STAGE_VALUATIONS[stage]
    check = invested if invested is not None else 1.5
    own = ownership if ownership is not None else check / valuation
    return Company(
        name='test_co',
        stage=stage,
        valuation=valuation,
        state='Alive',
        firm_invested_capital=check,
        firm_ownership=own,
        stages=DEFAULT_STAGES,
        valuations=DEFAULT_STAGE_VALUATIONS,
        dilution=DEFAULT_STAGE_DILUTION,
    )


def approx(a, b, tol=1e-9):
    return abs(a - b) < tol


# ---------------------------------------------------------------------------
# Test definitions
# ---------------------------------------------------------------------------

def test_portfolio_construction():
    """Verify correct number of companies and follow-on adjustment."""
    try:
        config = make_config(num_scenarios=1)
        # After rounding: 170 // 1.5 = 113, 113 * 1.5 = 169.5, remainder = 0.5
        expected_companies = 113
        expected_follow_on = 30.5
        expected_primary = 169.5

        mc = Montecarlo(config)
        mc.initialize_scenarios()
        firm = mc.firm_scenarios[0]
        actual_companies = len(firm.portfolio)
        actual_follow_on = config.follow_on_reserve
        actual_primary = config.primary_investments['Pre-seed']

        passed = (
            actual_companies == expected_companies
            and approx(actual_follow_on, expected_follow_on)
            and approx(actual_primary, expected_primary)
        )

        return dict(
            id='portfolio_construction',
            name='Portfolio Construction',
            category='deterministic',
            description=(
                'A $200M fund allocating $170M to Pre-seed at $1.5M checks should '
                'create exactly 113 companies (170/1.5 = 113.33, rounded down). '
                'The $0.5M remainder is added to the follow-on reserve (30 + 0.5 = 30.5).'
            ),
            expected=f'{expected_companies} companies, follow-on = ${expected_follow_on}M, primary = ${expected_primary}M',
            actual=f'{actual_companies} companies, follow-on = ${actual_follow_on}M, primary = ${actual_primary}M',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='portfolio_construction', name='Portfolio Construction',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_initial_ownership():
    """Verify ownership = check_size / valuation for every company."""
    try:
        config = make_config(num_scenarios=1)
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        firm = mc.firm_scenarios[0]

        expected_ownership = 1.5 / 15  # 0.1 = 10%
        all_correct = all(
            approx(c.firm_ownership, expected_ownership)
            for c in firm.portfolio
        )
        sample = firm.portfolio[0].firm_ownership

        return dict(
            id='initial_ownership',
            name='Initial Ownership',
            category='deterministic',
            description=(
                'Each Pre-seed company receives a $1.5M check at a $15M valuation, '
                'so initial ownership should be 1.5/15 = 10.0% for every company.'
            ),
            expected=f'{expected_ownership:.4f} (10.0%) for all 113 companies',
            actual=f'{sample:.4f} ({sample*100:.1f}%) — all match: {all_correct}',
            passed=all_correct,
            details='',
        )
    except Exception as e:
        return dict(id='initial_ownership', name='Initial Ownership',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_dilution_math():
    """Verify dilution when promoting with NO pro-rata."""
    try:
        co = make_company(stage='Pre-seed', valuation=15, ownership=0.1, invested=1.5)
        # Promote with no pro-rata (threshold=0 means valuation always exceeds it)
        co.promote(secondary_dry_powder=0, pro_rata_at_or_below=0)

        expected_stage = 'Seed'
        expected_valuation = 30
        expected_ownership = 0.1 * (1 - 0.20)  # 0.08
        passed = (
            co.stage == expected_stage
            and approx(co.valuation, expected_valuation)
            and approx(co.firm_ownership, expected_ownership)
        )

        return dict(
            id='dilution_math',
            name='Dilution Calculation',
            category='deterministic',
            description=(
                'A Pre-seed company with 10% ownership promotes to Seed. '
                'Seed dilution is 20%, so new ownership = 10% × (1 - 0.20) = 8.0%. '
                'No pro-rata is attempted (threshold set to $0).'
            ),
            expected=f'stage=Seed, valuation=$30M, ownership={expected_ownership:.4f} (8.0%)',
            actual=f'stage={co.stage}, valuation=${co.valuation}M, ownership={co.firm_ownership:.4f} ({co.firm_ownership*100:.1f}%)',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='dilution_math', name='Dilution Calculation',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_pro_rata_investment():
    """Verify pro-rata restores ownership when within threshold."""
    try:
        co = make_company(stage='Pre-seed', valuation=15, ownership=0.1, invested=1.5)
        investment = co.promote(secondary_dry_powder=100, pro_rata_at_or_below=70)

        # Seed valuation=$30 which is <= $70 threshold, so pro-rata fires
        # Dilution at Seed = 20%: post_dilution = 0.1 * 0.8 = 0.08
        # Pro-rata = (0.1 - 0.08) * 30 = 0.6
        # New ownership = 0.08 + 0.6/30 = 0.08 + 0.02 = 0.1
        expected_investment = 0.02 * 30  # 0.6
        expected_ownership = 0.1
        expected_total_invested = 1.5 + 0.6  # 2.1

        passed = (
            approx(investment, expected_investment)
            and approx(co.firm_ownership, expected_ownership)
            and approx(co.firm_invested_capital, expected_total_invested)
        )

        return dict(
            id='pro_rata_investment',
            name='Pro-Rata Follow-On',
            category='deterministic',
            description=(
                'A Pre-seed company (10% ownership) promotes to Seed ($30M valuation, '
                'within $70M threshold). Dilution is 20%, dropping ownership to 8%. '
                'Pro-rata investment = (10% - 8%) × $30M = $0.6M, restoring ownership to 10%.'
            ),
            expected=f'investment=${expected_investment:.2f}M, ownership={expected_ownership:.4f}, total invested=${expected_total_invested:.2f}M',
            actual=f'investment=${investment:.2f}M, ownership={co.firm_ownership:.4f}, total invested=${co.firm_invested_capital:.2f}M',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='pro_rata_investment', name='Pro-Rata Follow-On',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_pro_rata_threshold():
    """Verify pro-rata is skipped when valuation exceeds threshold."""
    try:
        # Create a Seed company promoting to Series A ($70M)
        # Set threshold to $50M so Series A valuation exceeds it
        co = make_company(stage='Seed', valuation=30, ownership=0.1, invested=1.5)
        investment = co.promote(secondary_dry_powder=100, pro_rata_at_or_below=50)

        # Series A valuation = $70M > $50M threshold → no pro-rata
        # Dilution at Series A = 22%: ownership = 0.1 * (1 - 0.22) = 0.078
        expected_investment = 0.0
        expected_ownership = 0.1 * (1 - 0.22)

        passed = (
            approx(investment, expected_investment)
            and approx(co.firm_ownership, expected_ownership)
            and co.no_pro_rata_counter['too late stage'] == 1
        )

        return dict(
            id='pro_rata_threshold',
            name='Pro-Rata Threshold',
            category='deterministic',
            description=(
                'A Seed company promotes to Series A ($70M valuation) but the pro-rata '
                'threshold is set to $50M. Since $70M > $50M, no pro-rata investment is made. '
                'Ownership drops from 10% to 7.8% (22% dilution at Series A).'
            ),
            expected=f'investment=$0.00M, ownership={expected_ownership:.4f} (7.8%), reason="too late stage"',
            actual=f'investment=${investment:.2f}M, ownership={co.firm_ownership:.4f} ({co.firm_ownership*100:.1f}%), too_late_stage={co.no_pro_rata_counter["too late stage"]}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='pro_rata_threshold', name='Pro-Rata Threshold',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_fail_state():
    """Verify failed companies have valuation=0."""
    try:
        co = make_company(stage='Pre-seed', valuation=15, ownership=0.1, invested=1.5)
        co.fail()

        passed = (
            co.valuation == 0
            and co.state == 'Failed'
            and co.age == 1
        )

        return dict(
            id='fail_state',
            name='Company Failure',
            category='deterministic',
            description=(
                'When a company fails, its valuation is set to 0, state becomes "Failed", '
                'and age increments by 1. The firm\'s invested capital is unchanged (sunk cost).'
            ),
            expected='valuation=0, state=Failed, age=1',
            actual=f'valuation={co.valuation}, state={co.state}, age={co.age}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='fail_state', name='Company Failure',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_m_and_a_outcomes():
    """Verify all 4 M&A multiplier buckets by finding seeds that trigger each."""
    try:
        # M&A buckets: [0, 0.01) → 10x, [0.01, 0.06) → 5x, [0.06, 0.66) → 1x, [0.66, 1.0) → 0.1x
        # Find seeds that produce random values in each bucket
        buckets = [
            (10, 0.0, 0.01, '10x (unicorn exit)'),
            (5, 0.01, 0.06, '5x (strong exit)'),
            (1, 0.06, 0.66, '1x (acqui-hire)'),
            (0.1, 0.66, 1.0, '0.1x (fire sale)'),
        ]

        results_detail = []
        all_passed = True

        for multiplier, lo, hi, label in buckets:
            # Find a seed whose first random.random() falls in [lo, hi)
            found_seed = None
            for s in range(10000):
                random.seed(s)
                r = random.random()
                if lo <= r < hi:
                    found_seed = s
                    break

            if found_seed is None:
                all_passed = False
                results_detail.append(f'{label}: NO SEED FOUND')
                continue

            random.seed(found_seed)
            co = make_company(stage='Pre-seed', valuation=15, ownership=0.1, invested=1.5)
            co.m_and_a()

            expected_val = 15 * multiplier
            ok = approx(co.valuation, expected_val) and co.state == 'Acquired'
            if not ok:
                all_passed = False
            results_detail.append(
                f'{label}: seed={found_seed}, val=${co.valuation:.1f}M (expected ${expected_val:.1f}M) {"OK" if ok else "FAIL"}'
            )

        return dict(
            id='m_and_a_outcomes',
            name='M&A Exit Outcomes',
            category='deterministic',
            description=(
                'M&A outcomes use a random draw mapped to 4 buckets: '
                '1% chance of 10x, 5% chance of 5x, 60% chance of 1x (acqui-hire), '
                '34% chance of 0.1x (fire sale). Each bucket is tested by finding a '
                'seed that produces a random value in the correct range.'
            ),
            expected='All 4 multipliers (10x, 5x, 1x, 0.1x) applied correctly to $15M valuation',
            actual='; '.join(results_detail),
            passed=all_passed,
            details='',
        )
    except Exception as e:
        return dict(id='m_and_a_outcomes', name='M&A Exit Outcomes',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_moic_calculation():
    """Verify MOIC = portfolio_value / capital_invested."""
    try:
        config = make_config(num_scenarios=1)
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        mc.simulate(seed=42)

        firm = mc.firm_scenarios[0]
        portfolio_value = firm.get_total_value_of_portfolio()
        capital_invested = firm.get_capital_invested()
        expected_moic = round(portfolio_value / capital_invested, 1)
        actual_moic = firm.get_MoM()

        passed = approx(actual_moic, expected_moic)

        return dict(
            id='moic_calculation',
            name='MOIC Calculation',
            category='deterministic',
            description=(
                'MOIC (Multiple on Invested Capital) = total portfolio value / total capital invested. '
                'Portfolio value sums (valuation × ownership) for all Alive and Acquired companies. '
                'Capital invested = primary deployed + follow-on deployed. Result is rounded to 1 decimal.'
            ),
            expected=f'MOIC = ${portfolio_value:.2f}M / ${capital_invested:.2f}M = {expected_moic}x',
            actual=f'MOIC = {actual_moic}x (portfolio=${portfolio_value:.2f}M, invested=${capital_invested:.2f}M)',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='moic_calculation', name='MOIC Calculation',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_terminal_stage():
    """Verify Series G companies are never processed and stay Alive."""
    try:
        # Create a config where all companies start at Series G (terminal)
        # Use a tiny fund so we get just 1 company
        config = make_config(
            num_scenarios=1,
            primary_investments={'Series G': 10},
            initial_investment_sizes={'Series G': 10},
            follow_on_reserve=0,
            fund_size=10,
        )
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        mc.simulate(seed=42)

        firm = mc.firm_scenarios[0]
        co = firm.portfolio[0]

        expected_val = DEFAULT_STAGE_VALUATIONS['Series G']  # 10000
        passed = (
            co.state == 'Alive'
            and approx(co.valuation, expected_val)
            and co.stage == 'Series G'
        )

        return dict(
            id='terminal_stage',
            name='Terminal Stage (Series G)',
            category='deterministic',
            description=(
                'Series G is the terminal stage (index 8 of 9 stages). The simulation loop '
                'only processes companies where stage index < 8, so Series G companies are '
                'never promoted, failed, or acquired. They remain Alive at their $10,000M valuation.'
            ),
            expected=f'state=Alive, stage=Series G, valuation=${expected_val}M',
            actual=f'state={co.state}, stage={co.stage}, valuation=${co.valuation}M',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='terminal_stage', name='Terminal Stage (Series G)',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_leftover_redeployment():
    """Verify leftover follow-on capital creates extra companies."""
    try:
        config = make_config(num_scenarios=1)
        mc = Montecarlo(config)
        mc.initialize_scenarios()

        initial_count = len(mc.firm_scenarios[0].portfolio)  # 113

        mc.simulate(seed=42)

        firm = mc.firm_scenarios[0]
        final_count = len(firm.portfolio)
        extra_count = final_count - initial_count

        # Remaining follow-on after simulation, extra = floor(remaining / 1.5)
        # We can't predict exact remaining without running, but we can verify:
        # 1. Extra companies were created (extra_count >= 0)
        # 2. All extra companies went through simulation (age > 0 or state != initial)
        extra_companies = firm.portfolio[initial_count:]
        all_simulated = all(c.age > 0 for c in extra_companies) if extra_companies else True

        passed = final_count >= initial_count and all_simulated

        return dict(
            id='leftover_redeployment',
            name='Leftover Capital Redeployment',
            category='deterministic',
            description=(
                'After the main 8-period simulation, any unused follow-on capital is '
                'converted to extra companies at the first primary stage (Pre-seed, $1.5M checks). '
                'These extra companies run through their own 8-period simulation with zero follow-on. '
                'The final portfolio should contain the original 113 + extra companies.'
            ),
            expected=f'final_count >= {initial_count}, all extra companies simulated (age > 0)',
            actual=f'initial={initial_count}, final={final_count}, extra={extra_count}, all_simulated={all_simulated}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='leftover_redeployment', name='Leftover Capital Redeployment',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_probability_distribution():
    """Verify observed transition rates match configured probabilities."""
    try:
        # Run a 1-period simulation with many scenarios to observe first-period outcomes
        config = make_config(
            num_scenarios=5000,
            lifespan_periods=1,
            # Need stages list length = lifespan_periods + 1 = 2
            # But the model validates len(stages) - 1 == lifespan_periods
            # So we use the full 9 stages with 8 periods but only look at period 1 outcomes
        )
        # Actually, validation requires lifespan_periods == len(stages) - 1
        # So we need to use 8 periods. Instead, run full sim and look at first-period snapshot.
        config = make_config(num_scenarios=5000)
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        mc.simulate(seed=12345)

        # Count first-period outcomes across all scenarios
        # Each firm starts with 113 Pre-seed companies. After period 1,
        # each company is either still Alive (promoted to Seed), Failed, or Acquired.
        total = 0
        promoted = 0
        failed = 0
        acquired = 0

        for firm in mc.firm_scenarios:
            # Look at the first period snapshot (index 1, since index 0 is initial)
            snap = firm.period_snapshots[1]
            promoted += snap.get('Seed', 0)  # promoted from Pre-seed to Seed
            failed += snap['Failed']
            acquired += snap['Acquired']

        # Initial total per firm = 113 companies, but we need to count from snapshot
        # The first snapshot (index 0) is pre-simulation
        initial_per_firm = 113
        total = initial_per_firm * 5000

        # But snapshots count ALL companies, and promoted count only shows Seed.
        # After period 1, Pre-seed companies either: stay Pre-seed (impossible since promote
        # means advancing), or become Seed (promoted), Failed, or Acquired.
        # Companies still at Pre-seed after period 1 didn't get processed? No, all are processed.
        # Actually some might still be Alive at Pre-seed if... no, all Pre-seed companies
        # are processed (stage < terminal). They either get M&A'd, fail, or promote to Seed.

        # Let's count directly from company states after period 1
        promoted = 0
        failed = 0
        acquired = 0

        # Re-run with 1-scenario approach: check each company's outcome
        # Actually let's just count from all firms' portfolios more carefully.
        # After full 8-period sim, companies have gone through multiple periods.
        # For a clean test, I'll manually run 1 period.

        config2 = make_config(num_scenarios=5000)
        mc2 = Montecarlo(config2)
        mc2.initialize_scenarios()

        # Manually run just 1 period with seed
        random.seed(12345)
        for firm in mc2.firm_scenarios:
            for company in firm.portfolio:
                if company.state == 'Alive' and company.get_numerical_stage() < len(mc2.stages) - 1:
                    rand = random.random()
                    if rand < mc2.stage_probs[company.stage][2]:
                        company.m_and_a()
                    elif rand < mc2.stage_probs[company.stage][2] + mc2.stage_probs[company.stage][1]:
                        company.fail()
                    else:
                        company.promote(
                            firm.get_remaining_follow_on_capital(),
                            mc2.firm_attributes['pro_rata_at_or_below']
                        )

        # Now count outcomes
        total = 0
        promoted = 0
        failed = 0
        acquired = 0
        for firm in mc2.firm_scenarios:
            for co in firm.portfolio:
                total += 1
                if co.state == 'Failed':
                    failed += 1
                elif co.state == 'Acquired':
                    acquired += 1
                elif co.stage == 'Seed':
                    promoted += 1

        # Expected rates for Pre-seed MARKET: [promote=0.50, fail=0.35, M&A=0.15]
        # But probability check order is: M&A first (0.15), then fail (0.35), then promote (0.50)
        promote_rate = promoted / total
        fail_rate = failed / total
        ma_rate = acquired / total
        tolerance = 0.03

        promote_ok = abs(promote_rate - 0.50) < tolerance
        fail_ok = abs(fail_rate - 0.35) < tolerance
        ma_ok = abs(ma_rate - 0.15) < tolerance
        passed = promote_ok and fail_ok and ma_ok

        return dict(
            id='probability_distribution',
            name='Stage Transition Probabilities',
            category='statistical',
            description=(
                'With 5,000 scenarios × 113 companies = 565,000 Pre-seed companies, '
                'the observed first-period transition rates should match the MARKET config: '
                'Promote ≈ 50%, Fail ≈ 35%, M&A ≈ 15% (±3% tolerance).'
            ),
            expected='promote=50.0%, fail=35.0%, M&A=15.0% (±3%)',
            actual=f'promote={promote_rate*100:.1f}%, fail={fail_rate*100:.1f}%, M&A={ma_rate*100:.1f}% (n={total:,})',
            passed=passed,
            details=f'promote {"OK" if promote_ok else "FAIL"}, fail {"OK" if fail_ok else "FAIL"}, M&A {"OK" if ma_ok else "FAIL"}',
        )
    except Exception as e:
        return dict(id='probability_distribution', name='Stage Transition Probabilities',
                    category='statistical', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_percentile_ordering():
    """Verify P25 <= P50 <= P75 <= P90."""
    try:
        config = make_config(num_scenarios=1000)
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        mc.simulate(seed=99)

        outcomes = mc.get_MoM_return_outcomes()
        p25 = np.percentile(outcomes, 25)
        p50 = np.percentile(outcomes, 50)
        p75 = np.percentile(outcomes, 75)
        p90 = np.percentile(outcomes, 90)

        passed = p25 <= p50 <= p75 <= p90

        return dict(
            id='percentile_ordering',
            name='Percentile Ordering',
            category='statistical',
            description=(
                'MOIC percentiles must be monotonically increasing: P25 ≤ P50 ≤ P75 ≤ P90. '
                'This is a fundamental property of percentile calculations on any distribution.'
            ),
            expected='P25 ≤ P50 ≤ P75 ≤ P90',
            actual=f'P25={p25:.2f}x, P50={p50:.2f}x, P75={p75:.2f}x, P90={p90:.2f}x',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='percentile_ordering', name='Percentile Ordering',
                    category='statistical', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_mean_moic_range():
    """Verify mean MOIC is within a reasonable range."""
    try:
        config = make_config(num_scenarios=1000)
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        mc.simulate(seed=77)

        outcomes = mc.get_MoM_return_outcomes()
        mean_moic = np.mean(outcomes)

        passed = 0 < mean_moic < 20

        return dict(
            id='mean_moic_range',
            name='Mean MOIC Reasonableness',
            category='statistical',
            description=(
                'For a $200M Pre-seed fund under MARKET conditions, mean MOIC should be '
                'positive (the fund returns something) and below 20x (an extreme upper bound). '
                'Typical values fall in the 1-5x range.'
            ),
            expected='0 < mean MOIC < 20',
            actual=f'mean MOIC = {mean_moic:.2f}x (n={len(outcomes)} scenarios)',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='mean_moic_range', name='Mean MOIC Reasonableness',
                    category='statistical', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_survival_rate():
    """Verify the % of alive companies matches the product of per-stage promote rates."""
    try:
        # A Pre-seed company goes through 8 periods, one stage per period:
        #   Pre-seed → Seed → A → B → C → D → E → F → (reaches G)
        # It stays alive only if it promotes at every single period.
        # P(alive) = product of effective promote rates at each stage.
        #
        # IMPORTANT: The simulation code checks M&A first, then fail, then
        # promotes via the else branch. So the effective promote rate is
        # 1 - fail_rate - m_and_a_rate, NOT the listed promote rate (which
        # may differ when the three rates don't sum to 1.0).

        stages_traversed = ['Pre-seed', 'Seed', 'Series A', 'Series B',
                            'Series C', 'Series D', 'Series E', 'Series F']
        expected_survival = 1.0
        rate_breakdown = []
        for stage in stages_traversed:
            fail_rate = MARKET[stage][1]
            ma_rate = MARKET[stage][2]
            effective_promote = 1.0 - fail_rate - ma_rate
            expected_survival *= effective_promote
            rate_breakdown.append(f'{stage}: {effective_promote:.2f}')

        # Run many scenarios to get a stable estimate
        num_scenarios = 5000
        config = make_config(num_scenarios=num_scenarios)
        mc = Montecarlo(config)
        mc.initialize_scenarios()

        # Record initial company count per firm (before extras are added)
        initial_count = len(mc.firm_scenarios[0].portfolio)

        mc.simulate(seed=54321)

        # Count alive companies from original portfolio only (not extras)
        total_original = 0
        alive_original = 0
        for firm in mc.firm_scenarios:
            for co in firm.portfolio[:initial_count]:
                total_original += 1
                if co.state == 'Alive':
                    alive_original += 1

        observed_survival = alive_original / total_original

        # With 565,000 companies and p=0.001875, expected ≈ 1059
        # std dev ≈ sqrt(n * p * (1-p)) ≈ 32.5
        # Use ±0.05% absolute tolerance (generous, ~2.5 std devs)
        tolerance = 0.0005
        passed = abs(observed_survival - expected_survival) < tolerance

        return dict(
            id='survival_rate',
            name='Survival Rate (Chained Probabilities)',
            category='statistical',
            description=(
                'A Pre-seed company must promote at every period to remain alive after 8 periods. '
                'The expected survival rate is the product of effective promote probabilities '
                '(1 - fail - M&A) across all 8 stages traversed: ' +
                ' x '.join(rate_breakdown) +
                f' = {expected_survival:.6f} ({expected_survival*100:.4f}%). '
                'This tests that the simulation correctly chains stage transition probabilities.'
            ),
            expected=f'{expected_survival*100:.4f}% survival ({expected_survival * total_original:.0f} of {total_original:,} companies)',
            actual=f'{observed_survival*100:.4f}% survival ({alive_original} of {total_original:,} companies)',
            passed=passed,
            details=f'tolerance=±{tolerance*100:.2f}%, delta={abs(observed_survival - expected_survival)*100:.4f}%',
        )
    except Exception as e:
        return dict(id='survival_rate', name='Survival Rate (Chained Probabilities)',
                    category='statistical', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


# ---------------------------------------------------------------------------
# Integration tests — exercise the API conversion layer
# ---------------------------------------------------------------------------

def _make_frontend_config(**overrides):
    """Create a SimulationConfig mimicking what the frontend sends."""
    defaults = dict(
        fund_size_m=200,
        dry_powder_reserve_for_pro_rata=15,
        check_sizes_at_entry={'Pre-seed': 1.5},
        ownership_percentages_at_entry={'Pre-seed': 0.1},
        pro_rata_max_valuation=70,
        num_iterations=1,
        num_periods=8,
    )
    defaults.update(overrides)
    return SimulationConfig(**defaults)


def test_api_unit_consistency():
    """Verify convert_frontend_config_to_backend produces consistent units."""
    try:
        frontend = _make_frontend_config()
        backend = convert_frontend_config_to_backend(frontend)

        fund_size = backend['fund_size']
        follow_on = backend['follow_on_reserve']
        primary = backend['primary_investments']
        check_sizes = backend['initial_investment_sizes']
        valuations = backend['stage_valuations']

        # All monetary values must be in the same unit system as stage_valuations.
        # stage_valuations are in millions (Pre-seed=15, Seed=30, etc.).
        # So fund_size, check_sizes, etc. must also be in millions.

        checks = []

        # Fund size should be in millions (200, not 200,000,000)
        fund_ok = fund_size == 200
        checks.append(f'fund_size={fund_size} (expect 200): {"OK" if fund_ok else "FAIL"}')

        # Check size should be in millions (1.5, not 1,500,000)
        check_val = check_sizes.get('Pre-seed', 0)
        check_ok = approx(check_val, 1.5)
        checks.append(f'check_size={check_val} (expect 1.5): {"OK" if check_ok else "FAIL"}')

        # Primary investment should be in millions
        prim_val = primary.get('Pre-seed', 0)
        prim_ok = prim_val < 1000  # should be ~170, not ~170,000,000
        checks.append(f'primary={prim_val} (expect <1000): {"OK" if prim_ok else "FAIL"}')

        # Follow-on should be in millions
        fo_ok = follow_on < 1000  # should be ~30, not ~30,000,000
        checks.append(f'follow_on={follow_on} (expect <1000): {"OK" if fo_ok else "FAIL"}')

        # Budget identity: sum(primary) + follow_on == fund_size
        total = sum(primary.values()) + follow_on
        budget_ok = approx(total, fund_size)
        checks.append(f'budget={total} == {fund_size}: {"OK" if budget_ok else "FAIL"}')

        passed = fund_ok and check_ok and prim_ok and fo_ok and budget_ok

        return dict(
            id='api_unit_consistency',
            name='API Unit Consistency',
            category='integration',
            description=(
                'The convert_frontend_config_to_backend function must produce values in the '
                'same unit system as stage_valuations (millions). Fund size, check sizes, '
                'primary investments, and follow-on reserve must all be in millions — not dollars. '
                'A mismatch causes ownership to be calculated as check_in_dollars / valuation_in_millions, '
                'producing wildly wrong values (e.g. 100,000 instead of 0.1).'
            ),
            expected='All monetary values in millions, budget sums to fund_size',
            actual='; '.join(checks),
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='api_unit_consistency', name='API Unit Consistency',
                    category='integration', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_api_ownership_sanity():
    """Verify that ownership through the API path is a valid fraction (0-1)."""
    try:
        frontend = _make_frontend_config(num_iterations=1)
        backend = convert_frontend_config_to_backend(frontend)
        backend.pop('committed_capital', None)
        mc_config = Montecarlo_Sim_Configuration(**backend)
        mc = Montecarlo(mc_config)
        mc.initialize_scenarios()

        firm = mc.firm_scenarios[0]
        ownerships = [c.firm_ownership for c in firm.portfolio]
        min_own = min(ownerships)
        max_own = max(ownerships)

        # Ownership must be a fraction between 0 and 1
        all_valid = all(0 < o <= 1 for o in ownerships)
        # For Pre-seed at $1.5M check / $15M valuation, ownership should be 0.1
        expected = 1.5 / 15  # 0.1
        all_correct = all(approx(o, expected) for o in ownerships)

        passed = all_valid and all_correct

        return dict(
            id='api_ownership_sanity',
            name='API Ownership Sanity',
            category='integration',
            description=(
                'Companies created through the full API conversion path must have '
                'ownership as a valid fraction (0 < ownership ≤ 1). '
                'For Pre-seed: ownership = $1.5M check / $15M valuation = 10%. '
                'This catches unit mismatches where ownership becomes check_in_dollars / valuation_in_millions.'
            ),
            expected=f'All ownership = {expected:.4f} (10%), range in (0, 1]',
            actual=f'min={min_own:.6f}, max={max_own:.6f}, all_valid={all_valid}, all_correct={all_correct}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='api_ownership_sanity', name='API Ownership Sanity',
                    category='integration', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_api_moic_matches_direct():
    """Verify MOIC through API path matches direct model construction."""
    try:
        # Run through API conversion path
        frontend = _make_frontend_config(
            fund_size_m=200,
            dry_powder_reserve_for_pro_rata=15,
            check_sizes_at_entry={'Pre-seed': 1.5},
            pro_rata_max_valuation=70,
            num_iterations=500,
        )
        api_backend = convert_frontend_config_to_backend(frontend)
        api_backend.pop('committed_capital', None)
        api_config = Montecarlo_Sim_Configuration(**api_backend)
        api_mc = Montecarlo(api_config)
        api_mc.initialize_scenarios()
        api_mc.simulate(seed=42)
        api_outcomes = api_mc.get_MoM_return_outcomes()
        api_mean = float(np.mean(api_outcomes))

        # Run through direct model construction (known-good path)
        direct_config = make_config(
            num_scenarios=500,
            fund_size=200,
            primary_investments={'Pre-seed': 170},
            initial_investment_sizes={'Pre-seed': 1.5},
            follow_on_reserve=30,
            pro_rata_at_or_below=70,
        )
        direct_mc = Montecarlo(direct_config)
        direct_mc.initialize_scenarios()
        direct_mc.simulate(seed=42)
        direct_outcomes = direct_mc.get_MoM_return_outcomes()
        direct_mean = float(np.mean(direct_outcomes))

        # They won't be identical (different follow-on amounts), but should be
        # in the same ballpark — within 1x of each other
        delta = abs(api_mean - direct_mean)
        passed = delta < 1.0

        return dict(
            id='api_moic_matches_direct',
            name='API MOIC vs Direct Construction',
            category='integration',
            description=(
                'MOIC computed through the full API conversion path should be in the same '
                'ballpark as MOIC from direct model construction. Large discrepancies (>1x) '
                'indicate unit mismatches or broken conversion logic. Minor differences are '
                'expected due to different follow-on reserve amounts.'
            ),
            expected=f'|api_mean - direct_mean| < 1.0x',
            actual=f'api_mean={api_mean:.2f}x, direct_mean={direct_mean:.2f}x, delta={delta:.2f}x',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='api_moic_matches_direct', name='API MOIC vs Direct Construction',
                    category='integration', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_api_pro_rata_threshold():
    """Verify pro_rata_max_valuation flows correctly through conversion."""
    try:
        frontend = _make_frontend_config(pro_rata_max_valuation=70)
        backend = convert_frontend_config_to_backend(frontend)

        threshold = backend['pro_rata_at_or_below']
        valuation_series_a = backend['stage_valuations']['Series A']  # 70

        # The threshold should be 70 (in millions), matching Series A valuation
        threshold_ok = approx(threshold, 70)
        # It should be in the same units as stage valuations
        same_units = approx(threshold, valuation_series_a)

        passed = threshold_ok and same_units

        return dict(
            id='api_pro_rata_threshold',
            name='API Pro-Rata Threshold',
            category='integration',
            description=(
                'pro_rata_max_valuation=70 should produce pro_rata_at_or_below=70, '
                'matching Series A valuation ($70M). This ensures pro-rata fires for '
                'Seed ($30M ≤ $70M) and Series A ($70M ≤ $70M) but not Series B ($200M > $70M). '
                'The threshold must be in the same units as stage valuations (millions).'
            ),
            expected=f'pro_rata_at_or_below=70, same as Series A valuation={valuation_series_a}',
            actual=f'pro_rata_at_or_below={threshold}, Series A valuation={valuation_series_a}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='api_pro_rata_threshold', name='API Pro-Rata Threshold',
                    category='integration', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_reinvest_flag_reaches_simulation():
    """Verify reinvest_unused_reserve flows through the full API→Experiment path."""
    try:
        frontend = _make_frontend_config(reinvest_unused_reserve=False, num_iterations=50)
        backend = convert_frontend_config_to_backend(frontend)

        # Flag should be in the converted dict
        flag_in_dict = backend.get('reinvest_unused_reserve') is False

        # Flag should survive Experiment.create_montecarlo_sim_configuration
        exp = Experiment()
        config = exp.create_montecarlo_sim_configuration(backend)
        flag_on_config = config.reinvest_unused_reserve is False

        # Flag should reach Montecarlo.firm_attributes
        mc = Montecarlo(config)
        flag_on_mc = mc.firm_attributes['reinvest_unused_reserve'] is False

        passed = flag_in_dict and flag_on_config and flag_on_mc

        return dict(
            id='reinvest_flag_reaches_simulation',
            name='Reinvest Flag Reaches Simulation',
            category='integration',
            description=(
                'reinvest_unused_reserve=False must flow from SimulationConfig through '
                'convert_frontend_config_to_backend, Experiment.create_montecarlo_sim_configuration, '
                'and into Montecarlo.firm_attributes without being dropped.'
            ),
            expected='Flag is False at every layer',
            actual=f'dict={flag_in_dict}, config={flag_on_config}, montecarlo={flag_on_mc}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='reinvest_flag_reaches_simulation', name='Reinvest Flag Reaches Simulation',
                    category='integration', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_reinvest_off_fewer_companies():
    """With reinvest off, higher reserve must produce fewer companies."""
    try:
        exp = Experiment()

        # 30% reserve, reinvest off
        fe_a = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=30,
            reinvest_unused_reserve=False, num_iterations=200, num_periods=8,
            check_sizes_at_entry={'Pre-seed': 1.5, 'Seed': 2.0},
        )
        d_a = convert_frontend_config_to_backend(fe_a)
        cfg_a = exp.create_montecarlo_sim_configuration(d_a)
        result_a = exp.run_montecarlo(cfg_a)
        avg_a = result_a['avg_portfolio_size']

        # 50% reserve, reinvest off
        fe_b = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=50,
            reinvest_unused_reserve=False, num_iterations=200, num_periods=8,
            check_sizes_at_entry={'Pre-seed': 1.5, 'Seed': 2.0},
        )
        d_b = convert_frontend_config_to_backend(fe_b)
        cfg_b = exp.create_montecarlo_sim_configuration(d_b)
        result_b = exp.run_montecarlo(cfg_b)
        avg_b = result_b['avg_portfolio_size']

        passed = avg_a > avg_b

        return dict(
            id='reinvest_off_fewer_companies',
            name='Reinvest Off → Fewer Companies with Higher Reserve',
            category='integration',
            description=(
                'With reinvest_unused_reserve=False, a fund with 50% reserve should have '
                'strictly fewer average companies than one with 30% reserve (same fund size), '
                'because unused reserve is NOT recycled into new primary investments.'
            ),
            expected=f'30% reserve companies > 50% reserve companies',
            actual=f'30% reserve={avg_a:.1f}, 50% reserve={avg_b:.1f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='reinvest_off_fewer_companies', name='Reinvest Off → Fewer Companies',
                    category='integration', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_moic_uses_fund_size():
    """MOIC must be calculated against full fund size, not just deployed capital."""
    try:
        config = make_config(num_scenarios=1)
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        mc.simulate(seed=99)

        firm = mc.firm_scenarios[0]
        portfolio_value = firm.get_total_value_of_portfolio()
        moic = firm.get_MoM()

        expected_moic = round(portfolio_value / firm.fund_size, 1)
        deployed_moic = round(portfolio_value / firm.get_capital_invested(), 1) if firm.get_capital_invested() > 0 else 0

        passed = moic == expected_moic

        return dict(
            id='moic_uses_fund_size',
            name='MOIC Based on Fund Size',
            category='deterministic',
            description=(
                'MOIC should equal portfolio_value / fund_size (not portfolio_value / capital_invested). '
                'This ensures that undeployed reserve still counts as a cost basis.'
            ),
            expected=f'MOIC = portfolio_value / fund_size = {expected_moic}x',
            actual=f'MOIC = {moic}x (vs capital-invested-based = {deployed_moic}x)',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='moic_uses_fund_size', name='MOIC Based on Fund Size',
                    category='deterministic', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_avg_company_counts_are_averages():
    """Alive/Failed/Acquired counts must be per-iteration averages, not totals."""
    try:
        exp = Experiment()
        fe = _make_frontend_config(num_iterations=100)
        d = convert_frontend_config_to_backend(fe)
        cfg = exp.create_montecarlo_sim_configuration(d)
        result = exp.run_montecarlo(cfg)

        alive = result['Alive Companies']
        failed = result['Failed Companies']
        acquired = result['Acquired Companies']
        avg_portfolio = result['avg_portfolio_size']

        # Each count should be a reasonable per-iteration number, not a sum across iterations.
        # With ~100 companies per iteration, no count should exceed avg_portfolio * 2
        # and the sum of alive+failed+acquired should be close to avg_portfolio.
        total = alive + failed + acquired
        ratio = total / avg_portfolio if avg_portfolio > 0 else 999

        # The sum should be roughly equal to avg portfolio size (ratio ≈ 1.0)
        passed = 0.8 < ratio < 1.5

        return dict(
            id='avg_company_counts_are_averages',
            name='Company Counts Are Per-Iteration Averages',
            category='integration',
            description=(
                'Alive/Failed/Acquired company counts must be per-iteration averages, '
                'not totals summed across all iterations. The sum of alive+failed+acquired '
                'should approximately equal avg_portfolio_size.'
            ),
            expected=f'(alive+failed+acquired) / avg_portfolio ≈ 1.0',
            actual=f'alive={alive:.1f}, failed={failed:.1f}, acquired={acquired:.1f}, total={total:.1f}, avg_portfolio={avg_portfolio:.1f}, ratio={ratio:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='avg_company_counts_are_averages', name='Company Counts Are Averages',
                    category='integration', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


# ---------------------------------------------------------------------------
# Structural fund tests — verify portfolio construction for various fund configs
# ---------------------------------------------------------------------------

def test_check_size_halves_company_count():
    """Doubling check size should halve the number of companies."""
    try:
        exp = Experiment()

        # 100% Pre-seed, $1.5M checks, $200M fund, 1% reserve
        # (0% reserve gets coerced to 30% by conversion layer, so use 1%)
        fe_small = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_small = convert_frontend_config_to_backend(fe_small)
        cfg_small = exp.create_montecarlo_sim_configuration(d_small)
        result_small = exp.run_montecarlo(cfg_small)
        avg_small = result_small['avg_portfolio_size']

        # 100% Pre-seed, $3M checks, $200M fund, 1% reserve
        fe_large = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 3.0},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_large = convert_frontend_config_to_backend(fe_large)
        cfg_large = exp.create_montecarlo_sim_configuration(d_large)
        result_large = exp.run_montecarlo(cfg_large)
        avg_large = result_large['avg_portfolio_size']

        # Expected: 198/1.5 = 132 vs 198/3 = 66 → ratio ≈ 2.0
        ratio = avg_small / avg_large if avg_large > 0 else 999
        passed = 1.8 < ratio < 2.2

        return dict(
            id='check_size_halves_count',
            name='Double Check Size → Half Companies',
            category='structural',
            description=(
                'A $200M fund with $1.5M checks should produce ~2x the companies '
                'of the same fund with $3M checks (200/1.5=133 vs 200/3=66). '
                'Both use 0% reserve and reinvest off to isolate the effect.'
            ),
            expected='ratio ≈ 2.0 (within 1.8–2.2)',
            actual=f'$1.5M checks: {avg_small:.1f} cos, $3M checks: {avg_large:.1f} cos, ratio={ratio:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='check_size_halves_count', name='Double Check Size → Half Companies',
                    category='structural', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_larger_fund_more_companies():
    """A fund twice the size should produce roughly twice the companies."""
    try:
        exp = Experiment()

        # $100M fund, 1% reserve
        fe_100 = _make_frontend_config(
            fund_size_m=100, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_100 = convert_frontend_config_to_backend(fe_100)
        cfg_100 = exp.create_montecarlo_sim_configuration(d_100)
        result_100 = exp.run_montecarlo(cfg_100)
        avg_100 = result_100['avg_portfolio_size']

        # $200M fund, 1% reserve
        fe_200 = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_200 = convert_frontend_config_to_backend(fe_200)
        cfg_200 = exp.create_montecarlo_sim_configuration(d_200)
        result_200 = exp.run_montecarlo(cfg_200)
        avg_200 = result_200['avg_portfolio_size']

        ratio = avg_200 / avg_100 if avg_100 > 0 else 999
        passed = 1.8 < ratio < 2.2

        return dict(
            id='larger_fund_more_companies',
            name='2x Fund Size → 2x Companies',
            category='structural',
            description=(
                'A $200M fund should produce ~2x the companies of a $100M fund '
                'when both use the same $1.5M check size. '
                '(200/1.5=133 vs 100/1.5=66). 0% reserve, reinvest off.'
            ),
            expected='ratio ≈ 2.0 (within 1.8–2.2)',
            actual=f'$100M fund: {avg_100:.1f} cos, $200M fund: {avg_200:.1f} cos, ratio={ratio:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='larger_fund_more_companies', name='2x Fund Size → 2x Companies',
                    category='structural', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_multi_stage_split():
    """A 50/50 Pre-seed/Seed fund should invest in both stages."""
    try:
        exp = Experiment()

        # Use 1% reserve (0% gets coerced to 30% by conversion layer)
        fe = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5, 'Seed': 3.0},
            reinvest_unused_reserve=False, num_iterations=1,
        )
        d = convert_frontend_config_to_backend(fe)
        cfg = exp.create_montecarlo_sim_configuration(d)
        mc = Montecarlo(cfg)
        mc.initialize_scenarios()

        firm = mc.firm_scenarios[0]
        stages = {}
        for co in firm.portfolio:
            stages[co.stage] = stages.get(co.stage, 0) + 1

        # $200M, 1% reserve → $198M primary, split 50/50 = $99M each
        # Pre-seed: 99/1.5 = 66, Seed: 99/3 = 33
        preseed_count = stages.get('Pre-seed', 0)
        seed_count = stages.get('Seed', 0)
        total = len(firm.portfolio)

        preseed_ok = 60 <= preseed_count <= 70
        seed_ok = 30 <= seed_count <= 35
        total_ok = 90 <= total <= 105

        passed = preseed_ok and seed_ok and total_ok

        return dict(
            id='multi_stage_split',
            name='50/50 Multi-Stage Split',
            category='structural',
            description=(
                'A $200M fund split 50/50 between Pre-seed ($1.5M checks) and Seed ($3M checks) '
                'should create ~66 Pre-seed and ~33 Seed companies. '
                '$100M/1.5=66 Pre-seed, $100M/3=33 Seed, total ~99.'
            ),
            expected='Pre-seed ≈ 66, Seed ≈ 33, total ≈ 99',
            actual=f'Pre-seed={preseed_count}, Seed={seed_count}, total={total}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='multi_stage_split', name='50/50 Multi-Stage Split',
                    category='structural', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_reserve_reduces_initial_companies():
    """Higher reserve should mean fewer initial companies (reinvest off)."""
    try:
        exp = Experiment()

        # 10% reserve
        fe_10 = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=10,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_10 = convert_frontend_config_to_backend(fe_10)
        cfg_10 = exp.create_montecarlo_sim_configuration(d_10)
        result_10 = exp.run_montecarlo(cfg_10)
        avg_10 = result_10['avg_portfolio_size']

        # 50% reserve
        fe_50 = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=50,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_50 = convert_frontend_config_to_backend(fe_50)
        cfg_50 = exp.create_montecarlo_sim_configuration(d_50)
        result_50 = exp.run_montecarlo(cfg_50)
        avg_50 = result_50['avg_portfolio_size']

        # 10% reserve: 180/1.5 = 120 companies
        # 50% reserve: 100/1.5 = 66 companies
        # Ratio should be ~1.8x
        ratio = avg_10 / avg_50 if avg_50 > 0 else 999
        passed = avg_10 > avg_50 and 1.5 < ratio < 2.2

        return dict(
            id='reserve_reduces_initial_companies',
            name='Higher Reserve → Fewer Companies (Reinvest Off)',
            category='structural',
            description=(
                'With reinvest off, a 50% reserve fund deploys only half the primary capital, '
                'so it should have fewer companies than a 10% reserve fund. '
                '10% reserve: 180/1.5=120, 50% reserve: 100/1.5=66.'
            ),
            expected=f'10% reserve > 50% reserve, ratio ≈ 1.8',
            actual=f'10% reserve={avg_10:.1f} cos, 50% reserve={avg_50:.1f} cos, ratio={ratio:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='reserve_reduces_initial_companies', name='Higher Reserve → Fewer Companies',
                    category='structural', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_seed_only_fund_structure():
    """A 100% Seed fund should produce companies at Seed stage with correct count."""
    try:
        exp = Experiment()

        # Use 1% reserve (0% gets coerced to 30%)
        fe = _make_frontend_config(
            fund_size_m=200, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Seed': 2.0},
            reinvest_unused_reserve=False, num_iterations=1,
        )
        d = convert_frontend_config_to_backend(fe)
        cfg = exp.create_montecarlo_sim_configuration(d)
        mc = Montecarlo(cfg)
        mc.initialize_scenarios()

        firm = mc.firm_scenarios[0]
        all_seed = all(co.stage == 'Seed' for co in firm.portfolio)
        count = len(firm.portfolio)
        # 1% reserve: primary = 200 * 0.99 = 198, 198/2 = 99
        expected_count = int(200 * 0.99 / 2.0)  # 99

        passed = all_seed and count == expected_count

        return dict(
            id='seed_only_fund_structure',
            name='100% Seed Fund Structure',
            category='structural',
            description=(
                'A $200M fund investing only at Seed with $2M checks and 1% reserve should create '
                'exactly 99 companies (198/2=99), all at Seed stage.'
            ),
            expected=f'{expected_count} companies, all at Seed',
            actual=f'{count} companies, all_seed={all_seed}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='seed_only_fund_structure', name='100% Seed Fund Structure',
                    category='structural', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


# ---------------------------------------------------------------------------
# Fees & recycling tests
# ---------------------------------------------------------------------------

def test_default_fees_and_recycling_cancel_out():
    """With default 2% fee x 10 yrs and 20% recycling, available capital equals committed capital."""
    try:
        frontend = _make_frontend_config(
            fund_size_m=200,
            management_fee_pct=2,
            fee_duration_years=10,
            recycled_capital_pct=20,
        )
        backend = convert_frontend_config_to_backend(frontend)

        # 2% * 10 = 20% fees, 20% recycling → net effect = 0
        # available = 200 - (200 * 0.02 * 10) + (200 * 0.20) = 200 - 40 + 40 = 200
        fund_size = backend['fund_size']
        passed = approx(fund_size, 200)

        return dict(
            id='default_fees_recycling_cancel',
            name='Default Fees & Recycling Cancel Out',
            category='fees_recycling',
            description=(
                'With default parameters (2% annual fee × 10 years = 20% total fees, '
                '20% recycled capital), the two effects cancel out. '
                'Available capital = $200M - $40M fees + $40M recycled = $200M.'
            ),
            expected='fund_size = $200M (fees and recycling cancel)',
            actual=f'fund_size = ${fund_size:.2f}M',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='default_fees_recycling_cancel', name='Default Fees & Recycling Cancel Out',
                    category='fees_recycling', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_fees_reduce_available_capital():
    """Management fees reduce the capital available for investment."""
    try:
        frontend = _make_frontend_config(
            fund_size_m=200,
            management_fee_pct=2,
            fee_duration_years=10,
            recycled_capital_pct=0,
        )
        backend = convert_frontend_config_to_backend(frontend)

        # fees = 200 * 0.02 * 10 = 40, recycled = 0
        # available = 200 - 40 + 0 = 160
        fund_size = backend['fund_size']
        expected = 160
        passed = approx(fund_size, expected)

        return dict(
            id='fees_reduce_capital',
            name='Fees Reduce Available Capital',
            category='fees_recycling',
            description=(
                'A $200M fund with 2% annual fee for 10 years and 0% recycling. '
                'Total fees = $200M × 2% × 10 = $40M. '
                'Available capital = $200M - $40M = $160M.'
            ),
            expected=f'fund_size = ${expected}M',
            actual=f'fund_size = ${fund_size:.2f}M',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='fees_reduce_capital', name='Fees Reduce Available Capital',
                    category='fees_recycling', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_recycling_increases_available_capital():
    """Recycled capital adds back to available investment capital."""
    try:
        frontend = _make_frontend_config(
            fund_size_m=200,
            management_fee_pct=0,
            fee_duration_years=10,
            recycled_capital_pct=25,
        )
        backend = convert_frontend_config_to_backend(frontend)

        # fees = 0, recycled = 200 * 0.25 = 50
        # available = 200 - 0 + 50 = 250
        fund_size = backend['fund_size']
        expected = 250
        passed = approx(fund_size, expected)

        return dict(
            id='recycling_increases_capital',
            name='Recycling Increases Available Capital',
            category='fees_recycling',
            description=(
                'A $200M fund with 0% fees and 25% recycled capital. '
                'Recycled = $200M × 25% = $50M. '
                'Available capital = $200M + $50M = $250M.'
            ),
            expected=f'fund_size = ${expected}M',
            actual=f'fund_size = ${fund_size:.2f}M',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='recycling_increases_capital', name='Recycling Increases Available Capital',
                    category='fees_recycling', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_zero_fees_zero_recycling():
    """With 0% fees and 0% recycling, available capital equals committed capital."""
    try:
        frontend = _make_frontend_config(
            fund_size_m=200,
            management_fee_pct=0,
            fee_duration_years=0,
            recycled_capital_pct=0,
        )
        backend = convert_frontend_config_to_backend(frontend)

        fund_size = backend['fund_size']
        passed = approx(fund_size, 200)

        return dict(
            id='zero_fees_zero_recycling',
            name='Zero Fees & Zero Recycling',
            category='fees_recycling',
            description=(
                'Edge case: 0% management fee, 0 years, 0% recycling. '
                'Available capital should equal committed capital ($200M).'
            ),
            expected='fund_size = $200M',
            actual=f'fund_size = ${fund_size:.2f}M',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='zero_fees_zero_recycling', name='Zero Fees & Zero Recycling',
                    category='fees_recycling', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_fees_recycling_budget_identity():
    """Budget identity holds: sum(primary) + follow_on == adjusted fund_size."""
    try:
        frontend = _make_frontend_config(
            fund_size_m=200,
            management_fee_pct=3,
            fee_duration_years=10,
            recycled_capital_pct=15,
            dry_powder_reserve_for_pro_rata=20,
            check_sizes_at_entry={'Pre-seed': 1.5, 'Seed': 3.0},
        )
        backend = convert_frontend_config_to_backend(frontend)

        fund_size = backend['fund_size']
        follow_on = backend['follow_on_reserve']
        primary_total = sum(backend['primary_investments'].values())
        budget = primary_total + follow_on

        # Expected: fees = 200 * 0.03 * 10 = 60, recycled = 200 * 0.15 = 30
        # available = 200 - 60 + 30 = 170
        expected_fund = 170
        fund_ok = approx(fund_size, expected_fund)
        budget_ok = approx(budget, fund_size)
        passed = fund_ok and budget_ok

        return dict(
            id='fees_recycling_budget_identity',
            name='Fees/Recycling Budget Identity',
            category='fees_recycling',
            description=(
                'A $200M fund with 3% fee × 10 yrs ($60M fees) and 15% recycling ($30M). '
                'Available capital = $200M - $60M + $30M = $170M. '
                'Budget identity: sum(primary_investments) + follow_on_reserve must equal $170M.'
            ),
            expected=f'fund_size = ${expected_fund}M, primary + follow_on = fund_size',
            actual=f'fund_size = ${fund_size:.2f}M, primary={primary_total:.2f} + follow_on={follow_on:.2f} = {budget:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='fees_recycling_budget_identity', name='Fees/Recycling Budget Identity',
                    category='fees_recycling', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_high_fees_reduce_company_count():
    """Higher fees produce fewer companies due to less available capital."""
    try:
        exp = Experiment()

        # No fees → $200M available
        fe_no_fees = _make_frontend_config(
            fund_size_m=200, management_fee_pct=0, fee_duration_years=10,
            recycled_capital_pct=0, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_no = convert_frontend_config_to_backend(fe_no_fees)
        cfg_no = exp.create_montecarlo_sim_configuration(d_no)
        result_no = exp.run_montecarlo(cfg_no)
        avg_no = result_no['avg_portfolio_size']

        # 3% fee × 10 yrs = 30% fees → $200M - $60M = $140M available
        fe_high_fees = _make_frontend_config(
            fund_size_m=200, management_fee_pct=3, fee_duration_years=10,
            recycled_capital_pct=0, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_high = convert_frontend_config_to_backend(fe_high_fees)
        cfg_high = exp.create_montecarlo_sim_configuration(d_high)
        result_high = exp.run_montecarlo(cfg_high)
        avg_high = result_high['avg_portfolio_size']

        # No fees: 200*0.99/1.5 ≈ 132, High fees: 140*0.99/1.5 ≈ 92
        # Ratio should be ~1.43
        ratio = avg_no / avg_high if avg_high > 0 else 999
        passed = avg_no > avg_high and ratio > 1.3

        return dict(
            id='high_fees_reduce_companies',
            name='Higher Fees → Fewer Companies',
            category='fees_recycling',
            description=(
                'A fund with 3% annual fees (30% total over 10 years) should produce '
                'significantly fewer companies than a fund with 0% fees. '
                '0% fees: $200M available, 3% fees: $140M available.'
            ),
            expected=f'0% fees companies > 3% fees companies (ratio > 1.3)',
            actual=f'0% fees={avg_no:.1f} cos, 3% fees={avg_high:.1f} cos, ratio={ratio:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='high_fees_reduce_companies', name='Higher Fees → Fewer Companies',
                    category='fees_recycling', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_high_recycling_increases_company_count():
    """Higher recycling produces more companies due to more available capital."""
    try:
        exp = Experiment()

        # 0% recycling
        fe_no_recycling = _make_frontend_config(
            fund_size_m=200, management_fee_pct=0, fee_duration_years=10,
            recycled_capital_pct=0, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_no = convert_frontend_config_to_backend(fe_no_recycling)
        cfg_no = exp.create_montecarlo_sim_configuration(d_no)
        result_no = exp.run_montecarlo(cfg_no)
        avg_no = result_no['avg_portfolio_size']

        # 30% recycling → $200M + $60M = $260M available
        fe_high_recycling = _make_frontend_config(
            fund_size_m=200, management_fee_pct=0, fee_duration_years=10,
            recycled_capital_pct=30, dry_powder_reserve_for_pro_rata=1,
            check_sizes_at_entry={'Pre-seed': 1.5},
            reinvest_unused_reserve=False, num_iterations=100,
        )
        d_high = convert_frontend_config_to_backend(fe_high_recycling)
        cfg_high = exp.create_montecarlo_sim_configuration(d_high)
        result_high = exp.run_montecarlo(cfg_high)
        avg_high = result_high['avg_portfolio_size']

        # 0% recycling: 200*0.99/1.5 ≈ 132, 30% recycling: 260*0.99/1.5 ≈ 171
        ratio = avg_high / avg_no if avg_no > 0 else 0
        passed = avg_high > avg_no and ratio > 1.2

        return dict(
            id='high_recycling_increases_companies',
            name='Higher Recycling → More Companies',
            category='fees_recycling',
            description=(
                'A fund with 30% recycled capital should produce more companies '
                'than a fund with 0% recycling. '
                '0% recycling: $200M available, 30% recycling: $260M available.'
            ),
            expected=f'30% recycling companies > 0% recycling companies (ratio > 1.2)',
            actual=f'0% recycling={avg_no:.1f} cos, 30% recycling={avg_high:.1f} cos, ratio={ratio:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='high_recycling_increases_companies', name='Higher Recycling → More Companies',
                    category='fees_recycling', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


# ---------------------------------------------------------------------------
# Market scenario & M&A outcome tests
# ---------------------------------------------------------------------------

def test_bull_market_higher_moic():
    """Bull (ABOVE_MARKET) scenario should produce higher MOIC than bear (BELOW_MARKET)."""
    try:
        exp = Experiment()
        N = 500

        fe_bull = _make_frontend_config(
            market_scenario='ABOVE_MARKET', num_iterations=N,
            fund_size_m=200, dry_powder_reserve_for_pro_rata=30,
            check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_bull = convert_frontend_config_to_backend(fe_bull)
        cfg_bull = exp.create_montecarlo_sim_configuration(d_bull)
        res_bull = exp.run_montecarlo(cfg_bull)
        mean_bull = float(np.mean(res_bull['moic_outcomes']))

        fe_bear = _make_frontend_config(
            market_scenario='BELOW_MARKET', num_iterations=N,
            fund_size_m=200, dry_powder_reserve_for_pro_rata=30,
            check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_bear = convert_frontend_config_to_backend(fe_bear)
        cfg_bear = exp.create_montecarlo_sim_configuration(d_bear)
        res_bear = exp.run_montecarlo(cfg_bear)
        mean_bear = float(np.mean(res_bear['moic_outcomes']))

        passed = mean_bull > mean_bear

        return dict(
            id='bull_market_higher_moic',
            name='Bull Market → Higher MOIC',
            category='market_scenarios',
            description=(
                'ABOVE_MARKET scenario has higher promote rates and lower fail rates, '
                'so it should produce a higher average MOIC than BELOW_MARKET.'
            ),
            expected='mean MOIC (bull) > mean MOIC (bear)',
            actual=f'bull mean={mean_bull:.2f}x, bear mean={mean_bear:.2f}x',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='bull_market_higher_moic', name='Bull Market → Higher MOIC',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_bear_market_more_failures():
    """Bear market should produce more failed companies on average."""
    try:
        exp = Experiment()
        N = 500

        fe_bull = _make_frontend_config(
            market_scenario='ABOVE_MARKET', num_iterations=N,
            fund_size_m=200, check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_bull = convert_frontend_config_to_backend(fe_bull)
        cfg_bull = exp.create_montecarlo_sim_configuration(d_bull)
        res_bull = exp.run_montecarlo(cfg_bull)
        failed_bull = res_bull['Failed Companies']

        fe_bear = _make_frontend_config(
            market_scenario='BELOW_MARKET', num_iterations=N,
            fund_size_m=200, check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_bear = convert_frontend_config_to_backend(fe_bear)
        cfg_bear = exp.create_montecarlo_sim_configuration(d_bear)
        res_bear = exp.run_montecarlo(cfg_bear)
        failed_bear = res_bear['Failed Companies']

        passed = failed_bear > failed_bull

        return dict(
            id='bear_market_more_failures',
            name='Bear Market → More Failures',
            category='market_scenarios',
            description=(
                'BELOW_MARKET has higher fail rates per stage, so the average number '
                'of failed companies should exceed the ABOVE_MARKET count.'
            ),
            expected='failed (bear) > failed (bull)',
            actual=f'bear failed={failed_bear:.1f}, bull failed={failed_bull:.1f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='bear_market_more_failures', name='Bear Market → More Failures',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_market_scenario_graduation_rates_flow():
    """Verify each market scenario name maps to correct graduation rates in the backend config."""
    try:
        scenarios = {
            'BELOW_MARKET': BELOW_MARKET,
            'MARKET': MARKET,
            'ABOVE_MARKET': ABOVE_MARKET,
        }
        results_detail = []
        all_passed = True

        for name, expected_rates in scenarios.items():
            fe = _make_frontend_config(market_scenario=name)
            backend = convert_frontend_config_to_backend(fe)
            actual_rates = backend['graduation_rates']
            match = actual_rates == expected_rates
            if not match:
                all_passed = False
            results_detail.append(f'{name}: {"OK" if match else "MISMATCH"}')

        return dict(
            id='market_scenario_rates_flow',
            name='Market Scenario → Graduation Rates',
            category='market_scenarios',
            description=(
                'Each market scenario name (BELOW_MARKET, MARKET, ABOVE_MARKET) must map to '
                'its corresponding graduation rates dict when converted to backend config.'
            ),
            expected='All 3 scenarios map correctly',
            actual='; '.join(results_detail),
            passed=all_passed,
            details='',
        )
    except Exception as e:
        return dict(id='market_scenario_rates_flow', name='Market Scenario → Graduation Rates',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_custom_graduation_rates_override():
    """Custom graduation rates passed directly should override the market scenario."""
    try:
        custom_rates = {stage: [0.33, 0.34, 0.33] for stage in DEFAULT_STAGES}
        custom_rates['Series G'] = [0.0, 0.0, 0.0]

        fe = _make_frontend_config(
            market_scenario='MARKET',
            graduation_rates=custom_rates,
        )
        backend = convert_frontend_config_to_backend(fe)
        actual_rates = backend['graduation_rates']

        # Custom rates should take precedence over MARKET defaults
        passed = actual_rates == custom_rates and actual_rates != MARKET

        return dict(
            id='custom_graduation_rates_override',
            name='Custom Graduation Rates Override',
            category='market_scenarios',
            description=(
                'When graduation_rates is explicitly provided alongside a market_scenario, '
                'the explicit rates should take precedence over the preset.'
            ),
            expected='Backend uses custom rates, not MARKET defaults',
            actual=f'custom rates used: {actual_rates == custom_rates}, differs from MARKET: {actual_rates != MARKET}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='custom_graduation_rates_override', name='Custom Graduation Rates Override',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_bull_vs_average_vs_bear_ordering():
    """MOIC ordering should be: bull > average > bear over many iterations."""
    try:
        exp = Experiment()
        N = 500
        means = {}

        for scenario in ['ABOVE_MARKET', 'MARKET', 'BELOW_MARKET']:
            fe = _make_frontend_config(
                market_scenario=scenario, num_iterations=N,
                fund_size_m=200, check_sizes_at_entry={'Pre-seed': 1.5},
            )
            d = convert_frontend_config_to_backend(fe)
            cfg = exp.create_montecarlo_sim_configuration(d)
            res = exp.run_montecarlo(cfg)
            means[scenario] = float(np.mean(res['moic_outcomes']))

        passed = means['ABOVE_MARKET'] > means['MARKET'] > means['BELOW_MARKET']

        return dict(
            id='bull_avg_bear_ordering',
            name='Bull > Average > Bear MOIC Ordering',
            category='market_scenarios',
            description=(
                'Over 500 iterations, the average MOIC should be strictly ordered: '
                'ABOVE_MARKET > MARKET > BELOW_MARKET.'
            ),
            expected='bull > average > bear',
            actual=f'bull={means["ABOVE_MARKET"]:.2f}x, avg={means["MARKET"]:.2f}x, bear={means["BELOW_MARKET"]:.2f}x',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='bull_avg_bear_ordering', name='Bull > Average > Bear MOIC Ordering',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_custom_mna_outcomes_all_10x():
    """Setting all M&A outcomes to 10x should dramatically increase MOIC."""
    try:
        exp = Experiment()
        N = 300

        # Default M&A outcomes (mixed multipliers)
        fe_default = _make_frontend_config(
            num_iterations=N, fund_size_m=200,
            check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_default = convert_frontend_config_to_backend(fe_default)
        cfg_default = exp.create_montecarlo_sim_configuration(d_default)
        res_default = exp.run_montecarlo(cfg_default)
        mean_default = float(np.mean(res_default['moic_outcomes']))

        # All M&A outcomes at 10x
        fe_10x = _make_frontend_config(
            num_iterations=N, fund_size_m=200,
            check_sizes_at_entry={'Pre-seed': 1.5},
            m_and_a_outcomes=[
                {'pct': 0.25, 'multiple': 10},
                {'pct': 0.25, 'multiple': 10},
                {'pct': 0.25, 'multiple': 10},
                {'pct': 0.25, 'multiple': 10},
            ],
        )
        d_10x = convert_frontend_config_to_backend(fe_10x)
        cfg_10x = exp.create_montecarlo_sim_configuration(d_10x)
        res_10x = exp.run_montecarlo(cfg_10x)
        mean_10x = float(np.mean(res_10x['moic_outcomes']))

        passed = mean_10x > mean_default * 1.5

        return dict(
            id='custom_mna_all_10x',
            name='All M&A 10x → Higher MOIC',
            category='mna_outcomes',
            description=(
                'When every M&A exit is 10x valuation, the average MOIC should be '
                'substantially higher than with default mixed outcomes (1%@10x, 5%@5x, 60%@1x, 34%@0.1x).'
            ),
            expected=f'mean_10x > mean_default × 1.5',
            actual=f'10x mean={mean_10x:.2f}x, default mean={mean_default:.2f}x, ratio={mean_10x/mean_default:.2f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='custom_mna_all_10x', name='All M&A 10x → Higher MOIC',
                    category='mna_outcomes', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_custom_mna_outcomes_all_fire_sale():
    """Setting all M&A to 0.1x fire sale should produce lower MOIC."""
    try:
        exp = Experiment()
        N = 300

        fe_default = _make_frontend_config(
            num_iterations=N, fund_size_m=200,
            check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_default = convert_frontend_config_to_backend(fe_default)
        cfg_default = exp.create_montecarlo_sim_configuration(d_default)
        res_default = exp.run_montecarlo(cfg_default)
        mean_default = float(np.mean(res_default['moic_outcomes']))

        # All M&A at 0.1x fire sale
        fe_fire = _make_frontend_config(
            num_iterations=N, fund_size_m=200,
            check_sizes_at_entry={'Pre-seed': 1.5},
            m_and_a_outcomes=[
                {'pct': 0.25, 'multiple': 0.1},
                {'pct': 0.25, 'multiple': 0.1},
                {'pct': 0.25, 'multiple': 0.1},
                {'pct': 0.25, 'multiple': 0.1},
            ],
        )
        d_fire = convert_frontend_config_to_backend(fe_fire)
        cfg_fire = exp.create_montecarlo_sim_configuration(d_fire)
        res_fire = exp.run_montecarlo(cfg_fire)
        mean_fire = float(np.mean(res_fire['moic_outcomes']))

        passed = mean_fire < mean_default

        return dict(
            id='custom_mna_all_fire_sale',
            name='All M&A Fire Sale → Lower MOIC',
            category='mna_outcomes',
            description=(
                'When every M&A exit is 0.1x (fire sale), the average MOIC should be '
                'lower than with default mixed outcomes.'
            ),
            expected='mean_fire_sale < mean_default',
            actual=f'fire_sale mean={mean_fire:.2f}x, default mean={mean_default:.2f}x',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='custom_mna_all_fire_sale', name='All M&A Fire Sale → Lower MOIC',
                    category='mna_outcomes', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_mna_outcomes_deterministic_unit():
    """Verify each custom M&A tier applies its multiplier correctly."""
    try:
        tiers = [
            {'pct': 1.0, 'multiple': 7.5},
            {'pct': 1.0, 'multiple': 3.0},
            {'pct': 1.0, 'multiple': 0.5},
            {'pct': 1.0, 'multiple': 0.0},
        ]

        results_detail = []
        all_passed = True

        for tier in tiers:
            outcomes = [tier]  # Single-tier: 100% chance of this multiplier
            co = make_company(stage='Pre-seed', valuation=15, ownership=0.1, invested=1.5)
            co.m_and_a(outcomes)
            expected_val = 15 * tier['multiple']
            ok = approx(co.valuation, expected_val) and co.state == 'Acquired'
            if not ok:
                all_passed = False
            results_detail.append(
                f"{tier['multiple']}x: val=${co.valuation:.1f}M (expected ${expected_val:.1f}M) {'OK' if ok else 'FAIL'}"
            )

        return dict(
            id='mna_outcomes_deterministic_unit',
            name='M&A Custom Tiers Unit Test',
            category='mna_outcomes',
            description=(
                'Test each custom M&A multiplier in isolation by setting 100% probability '
                'for a single tier. Verifies 7.5x, 3.0x, 0.5x, and 0.0x multipliers.'
            ),
            expected='All 4 custom multipliers apply correctly to $15M valuation',
            actual='; '.join(results_detail),
            passed=all_passed,
            details='',
        )
    except Exception as e:
        return dict(id='mna_outcomes_deterministic_unit', name='M&A Custom Tiers Unit Test',
                    category='mna_outcomes', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_mna_outcomes_flow_through_api():
    """Verify m_and_a_outcomes flows from frontend config through the full pipeline."""
    try:
        custom_outcomes = [
            {'pct': 0.10, 'multiple': 20},
            {'pct': 0.20, 'multiple': 5},
            {'pct': 0.40, 'multiple': 1},
            {'pct': 0.30, 'multiple': 0.1},
        ]

        fe = _make_frontend_config(m_and_a_outcomes=custom_outcomes)
        backend = convert_frontend_config_to_backend(fe)

        # Should appear in the backend dict
        in_dict = backend.get('m_and_a_outcomes') == custom_outcomes

        # Should survive Experiment.create_montecarlo_sim_configuration
        exp = Experiment()
        cfg = exp.create_montecarlo_sim_configuration(backend)
        on_config = cfg.m_and_a_outcomes == custom_outcomes

        # Should reach Montecarlo
        mc = Montecarlo(cfg)
        on_mc = mc.m_and_a_outcomes == custom_outcomes

        passed = in_dict and on_config and on_mc

        return dict(
            id='mna_outcomes_flow_through_api',
            name='M&A Outcomes Flow Through API',
            category='mna_outcomes',
            description=(
                'Custom m_and_a_outcomes must flow from SimulationConfig through '
                'convert_frontend_config_to_backend, Experiment.create_montecarlo_sim_configuration, '
                'and into Montecarlo. Verifies the full pipeline.'
            ),
            expected='Custom outcomes present at all 3 levels',
            actual=f'in_dict={in_dict}, on_config={on_config}, on_mc={on_mc}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='mna_outcomes_flow_through_api', name='M&A Outcomes Flow Through API',
                    category='mna_outcomes', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_mna_none_uses_defaults():
    """When m_and_a_outcomes is None, the default hardcoded tiers should be used."""
    try:
        # Default buckets: [0, 0.01) → 10x, [0.01, 0.06) → 5x, [0.06, 0.66) → 1x, [0.66, 1.0) → 0.1x
        # Find a seed in the 1x bucket [0.06, 0.66)
        found_seed = None
        for s in range(10000):
            random.seed(s)
            r = random.random()
            if 0.06 <= r < 0.66:
                found_seed = s
                break

        random.seed(found_seed)
        co = make_company(stage='Pre-seed', valuation=15, ownership=0.1, invested=1.5)
        co.m_and_a(None)  # Explicitly pass None

        expected_val = 15 * 1  # 1x bucket
        passed = approx(co.valuation, expected_val) and co.state == 'Acquired'

        return dict(
            id='mna_none_uses_defaults',
            name='M&A None → Default Tiers',
            category='mna_outcomes',
            description=(
                'When m_and_a_outcomes=None, the Company.m_and_a() method should fall back '
                'to the hardcoded defaults: 1%@10x, 5%@5x, 60%@1x, 34%@0.1x.'
            ),
            expected=f'seed={found_seed} in 1x bucket: val=$15M',
            actual=f'val=${co.valuation:.1f}M, state={co.state}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='mna_none_uses_defaults', name='M&A None → Default Tiers',
                    category='mna_outcomes', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_mna_probability_distribution():
    """Statistical test: verify M&A outcome distribution matches configured probabilities."""
    try:
        outcomes = [
            {'pct': 0.10, 'multiple': 10},
            {'pct': 0.30, 'multiple': 5},
            {'pct': 0.40, 'multiple': 1},
            {'pct': 0.20, 'multiple': 0.1},
        ]

        N = 10000
        counts = {10: 0, 5: 0, 1: 0, 0.1: 0}
        random.seed(12345)

        for _ in range(N):
            co = make_company(stage='Pre-seed', valuation=100, ownership=0.1, invested=1.5)
            co.m_and_a(outcomes)
            # Determine which multiplier was applied
            ratio = co.valuation / 100
            closest = min(counts.keys(), key=lambda m: abs(ratio - m))
            counts[closest] += 1

        # Check each bucket is within tolerance of expected
        results_detail = []
        all_passed = True
        for tier in outcomes:
            expected_pct = tier['pct']
            actual_pct = counts[tier['multiple']] / N
            tolerance = 0.03  # ±3%
            ok = abs(actual_pct - expected_pct) < tolerance
            if not ok:
                all_passed = False
            results_detail.append(
                f"{tier['multiple']}x: expected={expected_pct*100:.0f}%, actual={actual_pct*100:.1f}% {'OK' if ok else 'FAIL'}"
            )

        return dict(
            id='mna_probability_distribution',
            name='M&A Outcome Probability Distribution',
            category='mna_outcomes',
            description=(
                f'Run {N} M&A events with custom probabilities (10%@10x, 30%@5x, 40%@1x, 20%@0.1x) '
                'and verify the empirical distribution matches within ±3%.'
            ),
            expected='Each bucket within ±3% of configured probability',
            actual='; '.join(results_detail),
            passed=all_passed,
            details='',
        )
    except Exception as e:
        return dict(id='mna_probability_distribution', name='M&A Outcome Probability Distribution',
                    category='mna_outcomes', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_no_company_exceeds_series_g():
    """Verify no company ever ends up in a stage beyond Series G after simulation."""
    try:
        exp = Experiment()
        N = 200

        fe = _make_frontend_config(
            num_iterations=N, fund_size_m=200,
            check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d = convert_frontend_config_to_backend(fe)
        cfg = exp.create_montecarlo_sim_configuration(d)
        mc = Montecarlo(cfg)
        mc.initialize_scenarios()
        mc.simulate(seed=42)

        max_stage_idx = len(DEFAULT_STAGES) - 1  # 8 = Series G
        bad_companies = []
        for firm in mc.firm_scenarios:
            for co in firm.portfolio:
                stage_idx = co.get_numerical_stage()
                if stage_idx > max_stage_idx:
                    bad_companies.append(f'{co.name}@{co.stage}(idx={stage_idx})')

        passed = len(bad_companies) == 0
        total_companies = sum(len(f.portfolio) for f in mc.firm_scenarios)

        return dict(
            id='no_company_exceeds_series_g',
            name='No Company Beyond Series G',
            category='market_scenarios',
            description=(
                f'After running {N} iterations, verify no company has a stage index '
                'exceeding Series G (index 8). Checks all companies in all firms.'
            ),
            expected=f'0 companies beyond Series G out of ~{total_companies}',
            actual=f'{len(bad_companies)} violations' + (f': {bad_companies[:5]}' if bad_companies else ''),
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='no_company_exceeds_series_g', name='No Company Beyond Series G',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_series_f_promotes_to_g_not_beyond():
    """A Series F company promoted should become Series G, not beyond."""
    try:
        co = make_company(stage='Series F', valuation=5000, ownership=0.01, invested=1.5)
        co.promote(secondary_dry_powder=0, pro_rata_at_or_below=0)

        passed = co.stage == 'Series G' and co.get_numerical_stage() == 8

        return dict(
            id='series_f_promotes_to_g',
            name='Series F → Series G (Not Beyond)',
            category='market_scenarios',
            description=(
                'Promoting a Series F company (index 7) should land on Series G (index 8), '
                'the terminal stage. The min() bounds check prevents going to index 9.'
            ),
            expected='stage=Series G, index=8',
            actual=f'stage={co.stage}, index={co.get_numerical_stage()}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='series_f_promotes_to_g', name='Series F → Series G (Not Beyond)',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_series_g_promote_stays_at_g():
    """If promote() were called on Series G, it should stay at Series G (clamped)."""
    try:
        co = make_company(stage='Series G', valuation=10000, ownership=0.001, invested=1.5)
        co.promote(secondary_dry_powder=0, pro_rata_at_or_below=0)

        passed = co.stage == 'Series G' and co.get_numerical_stage() == 8

        return dict(
            id='series_g_promote_stays',
            name='Series G Promote → Still Series G',
            category='market_scenarios',
            description=(
                'If promote() is called on a Series G company (defensive test), '
                'the min() clamp should keep it at Series G (index 8).'
            ),
            expected='stage=Series G, index=8',
            actual=f'stage={co.stage}, index={co.get_numerical_stage()}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='series_g_promote_stays', name='Series G Promote → Still Series G',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_high_mna_rate_more_acquisitions():
    """Custom rates with very high M&A probability should yield more acquired companies."""
    try:
        exp = Experiment()
        N = 300

        # Custom rates: 80% M&A at every stage
        high_mna_rates = {}
        for stage in DEFAULT_STAGES:
            if stage == 'Series G':
                high_mna_rates[stage] = [0.0, 0.0, 0.0]
            else:
                high_mna_rates[stage] = [0.05, 0.05, 0.90]

        fe_high = _make_frontend_config(
            graduation_rates=high_mna_rates, num_iterations=N,
            fund_size_m=200, check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_high = convert_frontend_config_to_backend(fe_high)
        cfg_high = exp.create_montecarlo_sim_configuration(d_high)
        res_high = exp.run_montecarlo(cfg_high)
        acq_high = res_high['Acquired Companies']

        fe_low = _make_frontend_config(
            num_iterations=N, fund_size_m=200,
            check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_low = convert_frontend_config_to_backend(fe_low)
        cfg_low = exp.create_montecarlo_sim_configuration(d_low)
        res_low = exp.run_montecarlo(cfg_low)
        acq_low = res_low['Acquired Companies']

        passed = acq_high > acq_low

        return dict(
            id='high_mna_rate_more_acquisitions',
            name='High M&A Rate → More Acquisitions',
            category='market_scenarios',
            description=(
                'Custom graduation rates with 90% M&A probability at each stage should produce '
                'significantly more acquired companies than default MARKET rates (~15-30% M&A).'
            ),
            expected='acquired (high M&A) > acquired (default)',
            actual=f'high M&A acquired={acq_high:.1f}, default acquired={acq_low:.1f}',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='high_mna_rate_more_acquisitions', name='High M&A Rate → More Acquisitions',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_zero_mna_rate_no_acquisitions():
    """With 0% M&A at every stage, no companies should be acquired."""
    try:
        # Custom rates: 0% M&A everywhere, 70% promote, 30% fail
        zero_mna_rates = {}
        for stage in DEFAULT_STAGES:
            if stage == 'Series G':
                zero_mna_rates[stage] = [0.0, 0.0, 0.0]
            else:
                zero_mna_rates[stage] = [0.70, 0.30, 0.0]

        config = make_config(
            num_scenarios=100,
            graduation_rates=zero_mna_rates,
        )
        mc = Montecarlo(config)
        mc.initialize_scenarios()
        mc.simulate(seed=42)

        total_acquired = 0
        for firm in mc.firm_scenarios:
            for co in firm.portfolio:
                if co.state == 'Acquired':
                    total_acquired += 1

        passed = total_acquired == 0

        return dict(
            id='zero_mna_rate_no_acquisitions',
            name='Zero M&A Rate → No Acquisitions',
            category='market_scenarios',
            description=(
                'With M&A probability set to 0% at every stage, no companies should '
                'end up in the Acquired state after simulation.'
            ),
            expected='0 acquired companies',
            actual=f'{total_acquired} acquired companies across 100 iterations',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='zero_mna_rate_no_acquisitions', name='Zero M&A Rate → No Acquisitions',
                    category='market_scenarios', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


def test_mna_combined_scenario_and_outcomes():
    """Test combining bear market with favorable M&A outcomes — M&A uplift should partially offset bear drag."""
    try:
        exp = Experiment()
        N = 500

        # Pure bear market with default M&A
        fe_bear = _make_frontend_config(
            market_scenario='BELOW_MARKET', num_iterations=N,
            fund_size_m=200, check_sizes_at_entry={'Pre-seed': 1.5},
        )
        d_bear = convert_frontend_config_to_backend(fe_bear)
        cfg_bear = exp.create_montecarlo_sim_configuration(d_bear)
        res_bear = exp.run_montecarlo(cfg_bear)
        mean_bear = float(np.mean(res_bear['moic_outcomes']))

        # Bear market with very favorable M&A outcomes (all 5x)
        fe_bear_good_mna = _make_frontend_config(
            market_scenario='BELOW_MARKET', num_iterations=N,
            fund_size_m=200, check_sizes_at_entry={'Pre-seed': 1.5},
            m_and_a_outcomes=[
                {'pct': 0.25, 'multiple': 5},
                {'pct': 0.25, 'multiple': 5},
                {'pct': 0.25, 'multiple': 5},
                {'pct': 0.25, 'multiple': 5},
            ],
        )
        d_bgm = convert_frontend_config_to_backend(fe_bear_good_mna)
        cfg_bgm = exp.create_montecarlo_sim_configuration(d_bgm)
        res_bgm = exp.run_montecarlo(cfg_bgm)
        mean_bear_good_mna = float(np.mean(res_bgm['moic_outcomes']))

        # Bear + good M&A should outperform bear + default M&A
        passed = mean_bear_good_mna > mean_bear

        return dict(
            id='mna_combined_scenario_and_outcomes',
            name='Bear + Good M&A > Bear + Default M&A',
            category='mna_outcomes',
            description=(
                'A bear market combined with 100% 5x M&A outcomes should produce higher '
                'MOIC than the same bear market with default mixed M&A (which includes 34% fire sales).'
            ),
            expected='bear + 5x M&A > bear + default M&A',
            actual=f'bear+5x={mean_bear_good_mna:.2f}x, bear+default={mean_bear:.2f}x',
            passed=passed,
            details='',
        )
    except Exception as e:
        return dict(id='mna_combined_scenario_and_outcomes', name='Bear + Good M&A > Bear + Default M&A',
                    category='mna_outcomes', description='', expected='',
                    actual=str(e), passed=False, details=str(e))


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_all_tests() -> List[Dict[str, Any]]:
    """Execute all tests and return results."""
    tests = [
        test_portfolio_construction,
        test_initial_ownership,
        test_dilution_math,
        test_pro_rata_investment,
        test_pro_rata_threshold,
        test_fail_state,
        test_m_and_a_outcomes,
        test_moic_calculation,
        test_terminal_stage,
        test_leftover_redeployment,
        test_probability_distribution,
        test_survival_rate,
        test_percentile_ordering,
        test_mean_moic_range,
        test_api_unit_consistency,
        test_api_ownership_sanity,
        test_api_moic_matches_direct,
        test_api_pro_rata_threshold,
        test_reinvest_flag_reaches_simulation,
        test_reinvest_off_fewer_companies,
        test_moic_uses_fund_size,
        test_avg_company_counts_are_averages,
        test_check_size_halves_company_count,
        test_larger_fund_more_companies,
        test_multi_stage_split,
        test_reserve_reduces_initial_companies,
        test_seed_only_fund_structure,
        test_default_fees_and_recycling_cancel_out,
        test_fees_reduce_available_capital,
        test_recycling_increases_available_capital,
        test_zero_fees_zero_recycling,
        test_fees_recycling_budget_identity,
        test_high_fees_reduce_company_count,
        test_high_recycling_increases_company_count,
        # Market scenarios
        test_bull_market_higher_moic,
        test_bear_market_more_failures,
        test_market_scenario_graduation_rates_flow,
        test_custom_graduation_rates_override,
        test_bull_vs_average_vs_bear_ordering,
        # M&A outcomes
        test_custom_mna_outcomes_all_10x,
        test_custom_mna_outcomes_all_fire_sale,
        test_mna_outcomes_deterministic_unit,
        test_mna_outcomes_flow_through_api,
        test_mna_none_uses_defaults,
        test_mna_probability_distribution,
        test_mna_combined_scenario_and_outcomes,
        # Stage boundary
        test_no_company_exceeds_series_g,
        test_series_f_promotes_to_g_not_beyond,
        test_series_g_promote_stays_at_g,
        # M&A rate effects
        test_high_mna_rate_more_acquisitions,
        test_zero_mna_rate_no_acquisitions,
    ]
    results = []
    for t in tests:
        r = t()
        # Ensure all values are JSON-serializable (numpy.bool_ → bool, etc.)
        r['passed'] = bool(r['passed'])
        results.append(r)
    return results
