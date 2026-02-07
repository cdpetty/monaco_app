"""
Data models for the Monaco Monte Carlo simulation.

This module contains the core data classes:
- Company: Represents a portfolio company with its investment details
- Firm: Represents an investment firm with its portfolio of companies
- Montecarlo: Handles Monte Carlo simulation logic
- Montecarlo_Sim_Configuration: Configuration for simulation parameters
"""

import random
import time
import numpy as np
from typing import Dict, List, Tuple, Optional


class Company:
    """
    Represents a portfolio company with its investment lifecycle.

    Attributes:
        name: Company identifier
        stage: Current funding stage (Pre-seed, Seed, Series A, etc.)
        valuation: Current company valuation
        state: Company state (Alive, Failed, Acquired)
        firm_invested_capital: Total capital invested by the firm
        firm_ownership: Firm's ownership percentage
        market_constraints: Market data including stages, valuations, dilution
        age: Number of periods since investment
    """

    def __init__(self, name: str, stage: str, valuation: float, state: str,
                 firm_invested_capital: float, firm_ownership: float,
                 stages: List[str], valuations: Dict[str, float],
                 dilution: Dict[str, float]):
        self.name = name
        self.stage = stage
        self.valuation = valuation
        self.state = state
        self.firm_invested_capital = firm_invested_capital
        self.firm_ownership = firm_ownership
        self.market_constraints = {
            'stages': stages,
            'valuations': valuations,
            'dilution': dilution
        }
        self.age = 0

        # Define logging state for initial investment
        self.initial_stage = (self.stage, self.firm_ownership)
        self.did_pro_rata = 0
        self.no_pro_rata_counter = {
            'out of reserved capital': 0,
            'too late stage': 0,
            'did pro rata': 0
        }

    def promote(self, secondary_dry_powder: float, pro_rata_at_or_below: float) -> float:
        """
        Promote this company to the next stage in its lifecycle.

        Args:
            secondary_dry_powder: Available follow-on capital
            pro_rata_at_or_below: Valuation threshold for pro-rata investments

        Returns:
            Amount of pro-rata investment made
        """
        # Promote to the next stage and update states accordingly
        self.age += 1
        self.stage = self.market_constraints['stages'][min(
            self.market_constraints['stages'].index(self.stage) + 1,
            len(self.market_constraints['stages']) - 1
        )]
        self.valuation = self.market_constraints['valuations'][self.stage]

        # Determine post-dilution ownership
        dilution = self.market_constraints['dilution'][self.stage]
        post_dilution_ownership = self.firm_ownership * (1 - dilution)

        # Determine pro rata investment
        pro_rata_investment = 0
        if self.valuation <= pro_rata_at_or_below:
            available_investment = min(
                (self.firm_ownership - post_dilution_ownership) * self.valuation,
                secondary_dry_powder
            )
            if available_investment > 0:
                self.did_pro_rata = 1
                self.no_pro_rata_counter['did pro rata'] += 1
            else:
                self.no_pro_rata_counter['out of reserved capital'] += 1

            pro_rata_investment = available_investment
        else:
            self.no_pro_rata_counter['too late stage'] += 1

        self.firm_invested_capital += pro_rata_investment

        # Update firm ownership based on dilution and pro rata
        self.firm_ownership = (
            (self.firm_ownership * (1 - dilution)) +
            pro_rata_investment / self.valuation
        )

        return pro_rata_investment

    def m_and_a(self, m_and_a_outcomes=None) -> None:
        """Execute M&A exit for this company."""
        self.age += 1
        self.state = "Acquired"

        # M&A outcome probabilities and multipliers
        if m_and_a_outcomes:
            m_and_a_outcome_odds = [o['pct'] for o in m_and_a_outcomes]
            m_and_a_multipliers = [o['multiple'] for o in m_and_a_outcomes]
        else:
            m_and_a_outcome_odds = [0.01, 0.05, 0.6, 0.34]
            m_and_a_multipliers = [10, 5, 1, 0.1]

        # Generate random value which determines M&A outcomes
        rand = random.random()
        cumulative = 0.0
        for i, odds in enumerate(m_and_a_outcome_odds):
            cumulative += odds
            if rand < cumulative:
                self.valuation = m_and_a_multipliers[i] * self.valuation
                return
        # Fallback to last tier
        self.valuation = m_and_a_multipliers[-1] * self.valuation

    def fail(self) -> None:
        """Mark company as failed."""
        self.age += 1
        self.state = 'Failed'
        self.valuation = 0

    def age_company(self) -> None:
        """Increment company age (for failed/acquired companies)."""
        self.age += 1

    def get_firm_value(self) -> float:
        """Calculate the firm's value in this company."""
        return self.valuation * self.firm_ownership

    def get_numerical_stage(self) -> int:
        """Get the numerical index of the current stage."""
        return self.market_constraints['stages'].index(self.stage)

    def __str__(self) -> str:
        return (f"[{self.name}, {self.stage}, {self.valuation}, {self.state}, "
                f"{self.firm_invested_capital}, {self.firm_ownership}]")

    def __repr__(self) -> str:
        return (f"[{self.name}, {self.stage}, {self.valuation}, {self.state}, "
                f"{self.firm_ownership}, {self.get_firm_value()}]\n")


class Firm:
    """
    A firm is a collection of companies that it has invested in.

    Attributes:
        name: Firm name
        primary_investments: List of primary investment configurations
        follow_on_reserve: Amount reserved for follow-on investments
        fund_size: Total fund size
        firm_lifespan_years: Lifespan of the fund in years
        portfolio: List of Company objects
        period_snapshots: Historical snapshots of portfolio state
    """

    def __init__(self, name: str, primary_investments: List[List],
                 follow_on_reserve: float, fund_size: float,
                 firm_lifespan_years: int):
        self.name = name
        self.primary_investments = primary_investments
        self.follow_on_reserve = follow_on_reserve
        self.primary_capital_deployed = 0
        self.follow_on_capital_deployed = 0
        self.fund_size = fund_size
        self.firm_lifespan_years = firm_lifespan_years
        self.portfolio: List[Company] = []
        self.period_snapshots: List[Dict] = []

    def initialize_portfolio(self, stages: List[str], valuations: Dict[str, float],
                           dilution: Dict[str, float]) -> None:
        """
        Initialize portfolio with full set of companies and initial investments.

        Args:
            stages: List of funding stages
            valuations: Valuation by stage
            dilution: Dilution rates by stage
        """
        for primary_capital_rounds in self.primary_investments:
            stage_invested = primary_capital_rounds[0]
            capital_invested_per_company = primary_capital_rounds[1]
            capital_to_be_allocated = primary_capital_rounds[2]

            while capital_to_be_allocated > 0 and capital_to_be_allocated >= capital_invested_per_company:
                self.portfolio.append(Company(
                    f'comp_name{stage_invested[:2]}{capital_to_be_allocated}',
                    stage_invested,
                    valuations[stage_invested],
                    'Alive',
                    capital_invested_per_company,
                    capital_invested_per_company / valuations[stage_invested],
                    stages,
                    valuations,
                    dilution
                ))

                capital_to_be_allocated -= capital_invested_per_company
                self.primary_capital_deployed += capital_invested_per_company

        self.period_snapshots.append(self.get_detailed_portfolio_snapshot())

    def get_total_value_of_portfolio(self) -> float:
        """Calculate total portfolio value."""
        total_value = 0
        for portco in self.portfolio:
            if portco.state == 'Alive':
                total_value += portco.valuation * portco.firm_ownership
            elif portco.state == 'Acquired':
                total_value += portco.valuation * portco.firm_ownership
        return total_value

    def get_detailed_portfolio_snapshot(self) -> Dict:
        """Get detailed snapshot of portfolio state."""
        snapshot = {
            'Pre-seed': 0,
            'Seed': 0,
            'Series A': 0,
            'Series B': 0,
            'Series C': 0,
            'Series D': 0,
            'Series E': 0,
            'Series F': 0,
            'Series G': 0,
            'Alive': 0,
            'Acquired': 0,
            'Failed': 0,
            'MOC': self.detailed_portfolio_value()
        }
        for portco in self.portfolio:
            if portco.state == 'Alive':
                snapshot[portco.stage] += 1
                snapshot['Alive'] += 1
            elif portco.state == 'Acquired':
                snapshot['Acquired'] += 1
            elif portco.state == 'Failed':
                snapshot['Failed'] += 1
        return snapshot

    def detailed_portfolio_value(self) -> Dict[str, float]:
        """Get detailed breakdown of portfolio value by state."""
        total_value = {
            'Alive': 0,
            'Acquired': 0
        }
        for portco in self.portfolio:
            if portco.state == 'Alive':
                total_value['Alive'] += portco.valuation * portco.firm_ownership
            elif portco.state == 'Acquired':
                total_value['Acquired'] += portco.valuation * portco.firm_ownership
        return total_value

    def get_capital_invested(self) -> float:
        """Get total capital invested."""
        return self.primary_capital_deployed + self.follow_on_capital_deployed

    def get_remaining_follow_on_capital(self) -> float:
        """Get remaining follow-on capital."""
        return self.follow_on_reserve - self.follow_on_capital_deployed

    def get_MoM(self) -> float:
        """Calculate Multiple on Money (MoM) based on full fund size."""
        return round(self.get_total_value_of_portfolio() / self.fund_size, 1)

    def __repr__(self) -> str:
        return str(self.get_detailed_portfolio_snapshot())


class Montecarlo:
    """
    The Montecarlo class simulates a firm's investing lifecycle.

    Attributes:
        config: Montecarlo_Sim_Configuration object
        num_scenarios: Number of scenarios to simulate
        firm_scenarios: List of simulated Firm objects
        stages: List of funding stages
        stage_probs: Graduation probabilities by stage
        stage_valuations: Valuations by stage
        stage_dilution: Dilution rates by stage
        firm_attributes: Firm configuration parameters
    """

    def __init__(self, config):
        self.config = config
        self.num_scenarios = config.num_scenarios
        self.firm_scenarios: List[Firm] = []

        # Market variables
        self.stages = config.stages
        self.stage_probs = config.graduation_rates
        self.stage_valuations = config.stage_valuations
        self.stage_dilution = config.stage_dilution
        self.m_and_a_outcomes = getattr(config, 'm_and_a_outcomes', None)

        # Firm attributes
        self.firm_attributes = {
            'primary_investments': [],
            'follow_on_reserve': config.follow_on_reserve,
            'fund_size': config.fund_size,
            'firm_lifespan_periods': config.lifespan_periods,
            'firm_lifespan_years': config.lifespan_years,
            'pro_rata_at_or_below': config.pro_rata_at_or_below,
            'reinvest_unused_reserve': config.reinvest_unused_reserve
        }

        for stage in config.primary_investments.keys():
            self.firm_attributes['primary_investments'].append([
                stage,
                config.initial_investment_sizes[stage],
                config.primary_investments[stage]
            ])

        self.config_name = 'No Name Yet'

    def initialize_scenarios(self) -> None:
        """Initialize firm scenarios for Monte Carlo simulation."""
        for i in range(self.num_scenarios):
            new_firm = Firm(
                f'Gradient{i}',
                self.firm_attributes['primary_investments'],
                self.firm_attributes['follow_on_reserve'],
                self.firm_attributes['fund_size'],
                self.firm_attributes['firm_lifespan_years']
            )

            new_firm.initialize_portfolio(
                self.stages,
                self.stage_valuations,
                self.stage_dilution
            )
            self.firm_scenarios.append(new_firm)

    def simulate(self, seed=None) -> None:
        """
        Execute the Monte Carlo simulation.

        Core simulation logic for all scenarios.
        """
        if seed is not None:
            random.seed(seed)
        else:
            random.seed(time.time())

        for firm in self.firm_scenarios:
            # Age companies for set number of periods
            for period in range(self.firm_attributes['firm_lifespan_periods']):

                for company in firm.portfolio:

                    if company.state == 'Alive' and company.get_numerical_stage() < len(self.stages) - 1:
                        rand = random.random()
                        # Determine outcome: M&A, fail, or promote
                        if rand < self.stage_probs[company.stage][2]:
                            company.m_and_a(self.m_and_a_outcomes)
                        elif rand < self.stage_probs[company.stage][2] + self.stage_probs[company.stage][1]:
                            company.fail()
                        else:
                            secondary_capital_consumed = company.promote(
                                firm.get_remaining_follow_on_capital(),
                                self.firm_attributes['pro_rata_at_or_below']
                            )
                            firm.follow_on_capital_deployed += secondary_capital_consumed

                    elif company.state == 'Failed':
                        company.age_company()
                    elif company.state == 'Acquired':
                        company.age_company()

                # Take a snapshot
                firm.period_snapshots.append(firm.get_detailed_portfolio_snapshot())

            # Deploy remaining capital as primary investments
            if self.firm_attributes['reinvest_unused_reserve'] and firm.get_remaining_follow_on_capital() > 0:
                extra_investments = []
                extra_investment_type = self.firm_attributes['primary_investments'][0]
                num_extra_investments = int(firm.get_remaining_follow_on_capital() // extra_investment_type[1])

                for extra_investment_index in range(num_extra_investments):
                    extra_investments.append(Company(
                        f'extra{extra_investment_index}',
                        extra_investment_type[0],
                        self.stage_valuations[extra_investment_type[0]],
                        'Alive',
                        extra_investment_type[1],
                        extra_investment_type[1] / self.stage_valuations[extra_investment_type[0]],
                        self.stages,
                        self.stage_valuations,
                        self.stage_dilution
                    ))
                    firm.primary_capital_deployed += extra_investment_type[1]
                    firm.follow_on_reserve -= extra_investment_type[1]

                # Simulate extra investments
                for period in range(self.firm_attributes['firm_lifespan_periods']):
                    for company in extra_investments:
                        if company.state == 'Alive' and company.get_numerical_stage() < len(self.stages) - 1:
                            rand = random.random()
                            if rand < self.stage_probs[company.stage][2]:
                                company.m_and_a()
                            elif rand < self.stage_probs[company.stage][2] + self.stage_probs[company.stage][1]:
                                company.fail()
                            else:
                                company.promote(0, self.firm_attributes['pro_rata_at_or_below'])
                        elif company.state == 'Failed':
                            company.age_company()
                        elif company.state == 'Acquired':
                            company.age_company()

                firm.portfolio += extra_investments

    def get_MoM_return_outcomes(self) -> List[float]:
        """Get Multiple on Money outcomes for all scenarios."""
        outcomes = []
        for firm in self.firm_scenarios:
            outcomes.append(firm.get_MoM())
        return outcomes

    def get_median_return_outcome(self, type: str) -> float:
        """Get median return outcome."""
        outcomes = []
        if type == 'MoM':
            outcomes = self.get_MoM_return_outcomes()
        elif type == 'IRR':
            print('ERROR: IRR not implemented')
            return 0

        if len(outcomes) % 2 == 0:
            return (outcomes[len(outcomes) // 2] + outcomes[len(outcomes) // 2 - 1]) / 2
        else:
            return outcomes[len(outcomes) // 2]

    def get_exact_return_outcomes(self) -> List[float]:
        """Get exact portfolio value outcomes."""
        outcomes = []
        for firm in self.firm_scenarios:
            outcomes.append(firm.get_total_value_of_portfolio())
        return outcomes

    def performance_quartiles(self) -> Dict[str, List[str]]:
        """Calculate performance quartiles."""
        outcomes = self.get_MoM_return_outcomes()
        performance = {}

        performance['25'] = [str(np.percentile(outcomes, 25))]
        performance['50'] = [str(np.percentile(outcomes, 50))]
        performance['75'] = [str(np.percentile(outcomes, 75))]
        performance['90'] = [str(np.percentile(outcomes, 90))]
        performance['95'] = [str(np.percentile(outcomes, 95))]

        return performance

    def get_total_value_acquired(self) -> float:
        """Get total value from acquired companies."""
        total_value_acquired = 0
        for firm in self.firm_scenarios:
            for portco in firm.portfolio:
                if portco.state == 'Acquired':
                    total_value_acquired += portco.get_firm_value()
        return total_value_acquired

    def get_total_value_alive(self) -> float:
        """Get total value from alive companies."""
        total_value_alive = 0
        for firm in self.firm_scenarios:
            for portco in firm.portfolio:
                if portco.state == 'Alive':
                    total_value_alive += portco.get_firm_value()
        return total_value_alive

    def get_total_companies_by_stage(self) -> Dict[str, int]:
        """Get total company counts by stage."""
        stage_counter = {
            'Pre-seed': 0,
            'Seed': 0,
            'Series A': 0,
            'Series B': 0,
            'Series C': 0,
            'Series D': 0,
            'Series E': 0,
            'Series F': 0,
            'Series G': 0
        }
        for firm in self.firm_scenarios:
            for portco in firm.portfolio:
                stage_counter[portco.stage] += 1
        return stage_counter

    def get_total_companies_by_state(self) -> Dict[str, int]:
        """Get total company counts by state."""
        state_counter = {
            'Alive': 0,
            'Failed': 0,
            'Acquired': 0
        }
        for firm in self.firm_scenarios:
            for portco in firm.portfolio:
                state_counter[portco.state] += 1
        return state_counter

    def get_total_companies_pro_rata(self) -> Dict[str, int]:
        """Get counts of companies with/without pro-rata investments."""
        state_counter = {
            'Pro Rata': 0,
            'No Pro Rata': 0
        }
        for firm in self.firm_scenarios:
            for portco in firm.portfolio:
                if portco.did_pro_rata == 1:
                    state_counter['Pro Rata'] += 1
                else:
                    state_counter['No Pro Rata'] += 1
        return state_counter

    def get_no_pro_rata_outcomes(self) -> Dict[str, int]:
        """Get detailed pro-rata pass outcomes."""
        no_pro_rata_counter = {
            'out of reserved capital': 0,
            'too late stage': 0,
            'did pro rata': 0,
        }
        for firm in self.firm_scenarios:
            for portco in firm.portfolio:
                no_pro_rata_counter['out of reserved capital'] += portco.no_pro_rata_counter['out of reserved capital']
                no_pro_rata_counter['too late stage'] += portco.no_pro_rata_counter['too late stage']
                no_pro_rata_counter['did pro rata'] += portco.no_pro_rata_counter['did pro rata']
        return no_pro_rata_counter

    def get_average_number_of_companies_post_pro_rata_adjustment(self) -> float:
        """Get average portfolio size after pro-rata adjustments."""
        lengths = []
        for firm in self.firm_scenarios:
            lengths.append(len(firm.portfolio))
        return sum(lengths) / len(lengths)

    def _breakdown_for_firms(self, firms: List) -> Dict:
        """Compute portfolio breakdown for a subset of firm scenarios."""
        num = len(firms)
        if num == 0:
            return {'segments': []}

        alive_by_stage = {}
        acquired = {'count': 0, 'value': 0}
        failed = {'count': 0, 'value': 0}

        for firm in firms:
            for co in firm.portfolio:
                val = co.valuation * co.firm_ownership
                if co.state == 'Alive':
                    if co.stage not in alive_by_stage:
                        alive_by_stage[co.stage] = {'count': 0, 'value': 0}
                    alive_by_stage[co.stage]['count'] += 1
                    alive_by_stage[co.stage]['value'] += val
                elif co.state == 'Acquired':
                    acquired['count'] += 1
                    acquired['value'] += val
                elif co.state == 'Failed':
                    failed['count'] += 1
                    failed['value'] += co.firm_invested_capital

        stages_ordered = [s for s in self.stages if s in alive_by_stage]
        breakdown = []
        for stage in stages_ordered:
            d = alive_by_stage[stage]
            breakdown.append({
                'label': stage, 'type': 'alive',
                'count': round(d['count'] / num, 1),
                'value': round(d['value'] / num, 2)
            })
        breakdown.append({
            'label': 'Acquired', 'type': 'acquired',
            'count': round(acquired['count'] / num, 1),
            'value': round(acquired['value'] / num, 2)
        })
        breakdown.append({
            'label': 'Failed', 'type': 'failed',
            'count': round(failed['count'] / num, 1),
            'value': round(failed['value'] / num, 2)
        })

        return {'segments': breakdown}

    def get_portfolio_breakdown_by_bins(self, num_bins: int = 24, cap: float = 10.0) -> List:
        """Get portfolio breakdown averaged per histogram bin (by MOIC range)."""
        num = len(self.firm_scenarios)
        if num == 0:
            return [None] * num_bins

        bin_width = cap / num_bins
        buckets: List[List] = [[] for _ in range(num_bins)]

        for firm in self.firm_scenarios:
            moic = firm.get_MoM()
            idx = int(moic / bin_width)
            if idx >= num_bins:
                idx = num_bins - 1
            if idx < 0:
                idx = 0
            buckets[idx].append(firm)

        result = []
        for bucket in buckets:
            if len(bucket) == 0:
                result.append(None)
            else:
                result.append(self._breakdown_for_firms(bucket))
        return result

    def get_portfolio_breakdown_by_percentile(self) -> Dict[str, Dict]:
        """Get portfolio breakdown for scenarios near each percentile."""
        num = len(self.firm_scenarios)
        if num == 0:
            return {}

        # Sort scenarios by MOIC
        sorted_firms = sorted(self.firm_scenarios, key=lambda f: f.get_MoM())

        percentiles = {
            'p25': 0.25, 'p50': 0.50, 'p75': 0.75, 'p90': 0.90, 'p95': 0.95
        }

        # Take ~5% of scenarios around each percentile (at least 5)
        window = max(int(num * 0.05), 5)
        half = window // 2

        result = {}
        for key, pct in percentiles.items():
            idx = int(num * pct)
            lo = max(0, idx - half)
            hi = min(num, lo + window)
            lo = max(0, hi - window)
            result[key] = self._breakdown_for_firms(sorted_firms[lo:hi])

        return result

    def get_individual_montecarlo_simulation_inputs_and_outputs(self) -> List[Dict]:
        """Get detailed results for each scenario."""
        results = []
        for x, firm in enumerate(self.firm_scenarios):
            # Identify pre-seed vs. seed split
            pre_seed_investments = 0
            pre_seed_ending_value = 0
            seed_investments = 0
            seed_ending_value = 0

            for portco in firm.portfolio:
                if portco.initial_stage[0] == 'Pre-seed':
                    pre_seed_investments += 1
                    pre_seed_ending_value += portco.get_firm_value()
                elif portco.initial_stage[0] == 'Seed':
                    seed_investments += 1
                    seed_ending_value += portco.get_firm_value()

            # Identify outcomes
            alive_number = 0
            alive_value = 0
            fail_number = 0
            acquired_number = 0
            acquired_value = 0

            for portco in firm.portfolio:
                if portco.state == 'Alive':
                    alive_number += 1
                    alive_value += portco.get_firm_value()
                elif portco.state == 'Failed':
                    fail_number += 1
                elif portco.state == 'Acquired':
                    acquired_number += 1
                    acquired_value += portco.get_firm_value()

            results.append({
                'Overall': {
                    'MOIC': firm.get_MoM(),
                    'Total companies': len(firm.portfolio)
                },
                'Initial Investments & Outcomes': {
                    'Pre-seed': (pre_seed_investments, pre_seed_ending_value),
                    'Seed': (seed_investments, seed_ending_value)
                },
                'Outcomes': {
                    'Alive': (alive_number, alive_value),
                    'Failed': (fail_number, 0),
                    'Acquired': (acquired_number, acquired_value)
                }
            })
        return results


class Montecarlo_Sim_Configuration:
    """
    Configuration for Monte Carlo simulation.

    Attributes:
        stages: List of funding stages
        graduation_rates: Probability of promotion/failure/M&A by stage
        stage_dilution: Dilution rates by stage
        stage_valuations: Valuations by stage
        lifespan_periods: Number of simulation periods
        lifespan_years: Fund lifespan in years
        primary_investments: Primary investment amounts by stage
        initial_investment_sizes: Initial check sizes by stage
        follow_on_reserve: Amount reserved for follow-on
        fund_size: Total fund size
        pro_rata_at_or_below: Valuation threshold for pro-rata
        num_scenarios: Number of Monte Carlo scenarios
    """

    def __init__(self, stages: List[str], graduation_rates: Dict,
                 stage_dilution: Dict, stage_valuations: Dict,
                 lifespan_periods: int, lifespan_years: int,
                 primary_investments: Dict, initial_investment_sizes: Dict,
                 follow_on_reserve: float, fund_size: float,
                 pro_rata_at_or_below: float, num_scenarios: int,
                 reinvest_unused_reserve: bool = True,
                 m_and_a_outcomes: list = None):
        # Market variables
        self.stages = stages
        self.graduation_rates = graduation_rates.copy()
        self.stage_dilution = stage_dilution.copy()
        self.stage_valuations = stage_valuations.copy()
        self.lifespan_periods = lifespan_periods
        self.lifespan_years = lifespan_years
        self.m_and_a_outcomes = m_and_a_outcomes

        # Investment Strategy
        self.primary_investments = primary_investments.copy()
        self.initial_investment_sizes = initial_investment_sizes.copy()
        self.follow_on_reserve = follow_on_reserve
        self.fund_size = fund_size
        self.pro_rata_at_or_below = pro_rata_at_or_below
        self.reinvest_unused_reserve = reinvest_unused_reserve

        # Make minor adjustments for modeling
        self.make_minor_round_size_adjustments_for_modeling()

        # Montecarlo Simulation variables
        self.num_scenarios = num_scenarios

    def make_minor_round_size_adjustments_for_modeling(self) -> None:
        """Adjust investment sizes to ensure divisibility."""
        add_to_follow_on_reserve = 0

        for stage in self.primary_investments.keys():
            if stage not in self.initial_investment_sizes or self.initial_investment_sizes[stage] == 0:
                print(f"Error: Missing or zero initial investment size for stage {stage}")
                continue

            total_amount_to_invest = (
                (self.primary_investments[stage] // self.initial_investment_sizes[stage]) *
                self.initial_investment_sizes[stage]
            )
            remainder = self.primary_investments[stage] - total_amount_to_invest
            self.primary_investments[stage] = total_amount_to_invest
            add_to_follow_on_reserve += remainder

        self.follow_on_reserve += add_to_follow_on_reserve

        # Validate total
        total_plan_to_invest = sum(self.primary_investments.values()) + self.follow_on_reserve
        if total_plan_to_invest != self.fund_size:
            print('Error: Total primary investment plus follow-on reserve does not equal fund size')

    def __repr__(self) -> str:
        return (
            f"Montecarlo_Sim_Configuration(\n"
            f"  Fund Size: ${self.fund_size}M\n"
            f"  Primary Investments: {self.primary_investments}\n"
            f"  Initial Investment Sizes: {self.initial_investment_sizes}\n"
            f"  Follow-on Reserve: ${self.follow_on_reserve}M\n"
            f"  Pro-rata at or below: ${self.pro_rata_at_or_below}M\n"
            f"  Lifespan: {self.lifespan_years} years ({self.lifespan_periods} periods)\n"
            f"  Num Scenarios: {self.num_scenarios}\n"
            f")"
        )
