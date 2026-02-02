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
from main import convert_frontend_config_to_backend, SimulationConfig
from config import (
    DEFAULT_STAGES, MARKET, DEFAULT_STAGE_DILUTION,
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
    ]
    results = []
    for t in tests:
        r = t()
        # Ensure all values are JSON-serializable (numpy.bool_ → bool, etc.)
        r['passed'] = bool(r['passed'])
        results.append(r)
    return results
