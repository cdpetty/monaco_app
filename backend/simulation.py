"""
Simulation and experiment management for Monte Carlo analysis.

This module contains:
- Experiment: Main class for running and analyzing multiple simulation strategies
- Functions for generating configurations and processing results
"""

import itertools
import numpy as np
from typing import Dict, List, Optional, Any
from collections import OrderedDict

from models import Montecarlo, Montecarlo_Sim_Configuration


class Experiment:
    """
    Experiment class for running and analyzing multiple Monte Carlo simulations.

    This class handles:
    - Generating multiple simulation configurations
    - Running simulations with different strategies
    - Processing and analyzing results
    - Formatting output data
    """

    def __init__(self):
        self.output_variables = OrderedDict([
            ('fund_size', {'name': 'Fund Size', 'format': '${:,.0f}M'}),
            ('follow_on_reserve', {'name': 'Follow-on Capital Reserved', 'format': '${:,.0f}M'}),
            ('pro_rata_at_or_below', {'name': 'Pro-Rata Valuation Threshold', 'format': '${:,.0f}M'}),
            ('Pre-seed_investment_amount', {'name': 'Initial Pre-seed Check Size', 'format': '${:,.1f}M'}),
            ('Seed_investment_amount', {'name': 'Initial Seed Check Size', 'format': '${:,.1f}M'}),
            ('Pre-seed_total_invested', {'name': 'Total Pre-seed Capital Deployed', 'format': '${:,.0f}M'}),
            ('Seed_total_invested', {'name': 'Total Seed Capital Deployed', 'format': '${:,.0f}M'}),
            ('Pre-seed_avg_ownership', {'name': 'Pre-seed Avg Ownership (initial)', 'format': '{:.2f}%'}),
            ('Seed_avg_ownership', {'name': 'Seed Avg Ownership (initial)', 'format': '{:.2f}%'}),
            ('overall_avg_ownership', {'name': 'Overall Ownership (initial)', 'format': '{:.2f}%'}),
            ('avg_portfolio_size', {'name': 'Avg actual portfolio size', 'format': '{:.1f}'}),
            ('total_portfolio_companies', {'name': 'Total # of Portfolio Companies', 'format': '{:,.0f}'}),
            ('Pre-seed_avg_companies', {'name': '# of Pre-seed Companies (original)', 'format': '{:,.0f}'}),
            ('Seed_avg_companies', {'name': '# of Seed Companies (original)', 'format': '{:,.0f}'}),
            ('Pre-seed_companies', {'name': '# of Pre-seed Companies', 'format': '{:,.0f}'}),
            ('Seed_companies', {'name': '# of Seed Companies', 'format': '{:,.0f}'}),
            ('Series A_companies', {'name': '# of Series A Companies', 'format': '{:,.0f}'}),
            ('Series B_companies', {'name': '# of Series B Companies', 'format': '{:,.0f}'}),
            ('Series C_companies', {'name': '# of Series C Companies', 'format': '{:,.0f}'}),
            ('Series D_companies', {'name': '# of Series D Companies', 'format': '{:,.0f}'}),
            ('Series E_companies', {'name': '# of Series E Companies', 'format': '{:,.0f}'}),
            ('Series F_companies', {'name': '# of Series F Companies', 'format': '{:,.0f}'}),
            ('Series G_companies', {'name': '# of Series G Companies', 'format': '{:,.0f}'}),
            ('Alive Companies', {'name': '# of Alive Companies', 'format': '{:,.0f}'}),
            ('Failed Companies', {'name': '# of Failed Companies', 'format': '{:,.0f}'}),
            ('Acquired Companies', {'name': '# of Acquired Companies', 'format': '{:,.0f}'}),
            ('Pro Rata Companies', {'name': '# of Pro Rata Companies', 'format': '{:,.0f}'}),
            ('No Pro Rata Companies', {'name': '# of No Pro Rata Companies', 'format': '{:,.0f}'}),
            ('# times pro rata', {'name': '# of times pro rata', 'format': '{:,.0f}'}),
            ('# times pass on pro rata: out of reserved capital', {
                'name': '# times pass on pro rata: out of reserved capital',
                'format': '{:,.0f}'
            }),
            ('# times pass on pro rata: too late stage', {
                'name': '# times pass on pro rata: too late stage',
                'format': '{:,.0f}'
            }),
            ('total_value_acquired', {'name': 'Total Value from Acquired Companies', 'format': '${:,.0f}M'}),
            ('total_value_alive', {'name': 'Total Value from Alive Companies', 'format': '${:,.0f}M'}),
            ('25th_percentile', {'name': '25th Percentile MOIC', 'format': '{:.2f}x'}),
            ('50th_percentile', {'name': '50th Percentile MOIC', 'format': '{:.2f}x'}),
            ('75th_percentile', {'name': '75th Percentile MOIC', 'format': '{:.2f}x'}),
            ('90th_percentile', {'name': '90th Percentile MOIC', 'format': '{:.2f}x'}),
            ('total_MOIC', {'name': 'Total MOIC (mean)', 'format': '{:.2f}x'}),
        ])

    def generate_montecarlo_configurations(
        self,
        config_options: Dict[str, Any]
    ) -> List[Montecarlo_Sim_Configuration]:
        """
        Generate multiple Montecarlo_Sim_Configuration objects based on provided options.

        Args:
            config_options: Dictionary containing configuration options.
                          Each value can be a single value or an array of options.

        Returns:
            List of Montecarlo_Sim_Configuration objects.
        """
        # Separate single values and arrays, but keep 'stages' as a single value
        single_values = {
            k: v for k, v in config_options.items()
            if not isinstance(v, list) or k == 'stages'
        }
        array_options = {
            k: v for k, v in config_options.items()
            if isinstance(v, list) and k != 'stages'
        }

        # Generate all combinations of array options
        option_names = list(array_options.keys())
        option_values = list(array_options.values())
        combinations = list(itertools.product(*option_values))

        configurations = []
        for combination in combinations:
            # Create a new dictionary for each combination
            config = single_values.copy()
            config.update(dict(zip(option_names, combination)))

            # Create Montecarlo_Sim_Configuration object
            mc_config = self.create_montecarlo_sim_configuration(config)
            if mc_config:
                configurations.append(mc_config)

        return configurations

    def create_montecarlo_sim_configuration(
        self,
        config: Dict[str, Any]
    ) -> Optional[Montecarlo_Sim_Configuration]:
        """
        Create a single Montecarlo_Sim_Configuration object from a configuration dictionary.

        Args:
            config: Configuration dictionary

        Returns:
            Montecarlo_Sim_Configuration object or None if validation fails
        """
        try:
            # Ensure stages is a list
            if isinstance(config['stages'], str):
                config['stages'] = [config['stages']]

            # Calculate total primary investment
            total_primary_investment = sum(config['primary_investments'].values())

            # Validate primary investments and follow-on reserve
            if total_primary_investment + config['follow_on_reserve'] != config['fund_size']:
                print('Error: Total primary investment plus follow-on reserve does not equal fund size')
                print(f"Details: follow_on_reserve={config['follow_on_reserve']}, "
                      f"total_primary_investment={total_primary_investment}, "
                      f"fund_size={config['fund_size']}")
                return None

            # Validate that all primary investment stages are in the stages list
            if not set(config['primary_investments'].keys()).issubset(set(config['stages'])):
                print('Error: Not all primary investment stages are included in the stages list')
                print(f"Stages: {config['stages']}")
                print(f"Primary investment stages: {list(config['primary_investments'].keys())}")
                return None

            # Create and return the Montecarlo_Sim_Configuration object
            return Montecarlo_Sim_Configuration(
                stages=config['stages'],
                graduation_rates=config['graduation_rates'],
                stage_dilution=config['stage_dilution'],
                stage_valuations=config['stage_valuations'],
                lifespan_periods=config['lifespan_periods'],
                lifespan_years=config['lifespan_years'],
                primary_investments=config['primary_investments'],
                initial_investment_sizes=config['initial_investment_sizes'],
                follow_on_reserve=config['follow_on_reserve'],
                fund_size=config['fund_size'],
                pro_rata_at_or_below=config['pro_rata_at_or_below'],
                num_scenarios=config['num_scenarios']
            )
        except KeyError as e:
            print(f"Missing required configuration parameter: {e}")
            return None

    def run_montecarlo(self, config: Montecarlo_Sim_Configuration) -> Optional[Dict]:
        """
        Run a Monte Carlo simulation with the given configuration.

        Args:
            config: Montecarlo_Sim_Configuration object

        Returns:
            Dictionary of simulation results or None if validation fails
        """
        # Validate configuration
        if config.follow_on_reserve + sum(config.primary_investments.values()) != config.fund_size:
            print('Error: Fund size does not match capital allocation',
                  config.primary_investments, config.follow_on_reserve, config.fund_size)
            return None

        if (config.lifespan_periods != len(config.stages) - 1 or
            len(config.stages) != len(config.stage_valuations.keys()) or
            len(config.stages) != len(config.graduation_rates.keys())):
            print('Error: Stages do not match probabilities, valuations, or firm lifespan')
            return None

        # Run simulation
        montecarlo = Montecarlo(config)
        montecarlo.initialize_scenarios()
        montecarlo.simulate()

        return self.get_simulation_outcome(montecarlo)

    def simulate_multiple_firm_strategies(
        self,
        configs: List[Montecarlo_Sim_Configuration]
    ) -> List[Dict]:
        """
        Simulate multiple firm strategies with different configurations.

        Args:
            configs: List of Montecarlo_Sim_Configuration objects

        Returns:
            List of result dictionaries
        """
        results = []
        for i, config in enumerate(configs, 1):
            print(f"Simulating Strategy {i}")
            result = self.run_montecarlo(config)

            if result is not None:
                result['Strategy'] = f'Strategy {i}'
                results.append(result)

        return results

    def get_simulation_outcome(self, montecarlo: Montecarlo) -> Optional[Dict]:
        """
        Process and extract outcomes from a Monte Carlo simulation.

        Args:
            montecarlo: Completed Montecarlo simulation object

        Returns:
            Dictionary of simulation outcomes
        """
        if not montecarlo:
            return None

        config = montecarlo.config
        outcomes = montecarlo.get_MoM_return_outcomes()

        result = {}

        # Basic config values
        result['fund_size'] = config.fund_size
        result['follow_on_reserve'] = config.follow_on_reserve
        result['pro_rata_at_or_below'] = config.pro_rata_at_or_below

        # Investment amounts and totals
        for stage in ['Pre-seed', 'Seed']:
            result[f'{stage}_investment_amount'] = config.initial_investment_sizes.get(stage, 0)
            result[f'{stage}_total_invested'] = config.primary_investments.get(stage, 0)

        # Ownership calculations
        total_ownership = 0
        total_companies = 0
        for stage in ['Pre-seed', 'Seed']:
            if stage in config.primary_investments and stage in config.stage_valuations:
                amount = config.initial_investment_sizes[stage]
                valuation = config.stage_valuations[stage]
                ownership = (amount / valuation) * 100
                num_companies = config.primary_investments[stage] / amount
                result[f'{stage}_avg_ownership'] = ownership
                result[f'{stage}_avg_companies'] = num_companies
                total_ownership += ownership * num_companies
                total_companies += num_companies

        result['overall_avg_ownership'] = total_ownership / total_companies if total_companies > 0 else 0
        result['total_portfolio_companies'] = total_companies

        # Portfolio size
        result['avg_portfolio_size'] = montecarlo.get_average_number_of_companies_post_pro_rata_adjustment()

        # Company counts
        stage_counter = montecarlo.get_total_companies_by_stage()
        for stage in config.stages:
            result[f'{stage}_companies'] = stage_counter.get(stage, 0)

        state_counter = montecarlo.get_total_companies_by_state()
        result['Alive Companies'] = state_counter['Alive']
        result['Failed Companies'] = state_counter['Failed']
        result['Acquired Companies'] = state_counter['Acquired']

        pro_rata_counter = montecarlo.get_total_companies_pro_rata()
        result['Pro Rata Companies'] = pro_rata_counter['Pro Rata']
        result['No Pro Rata Companies'] = pro_rata_counter['No Pro Rata']

        pro_rata_pass_counter = montecarlo.get_no_pro_rata_outcomes()
        result['# times pass on pro rata: out of reserved capital'] = pro_rata_pass_counter['out of reserved capital']
        result['# times pass on pro rata: too late stage'] = pro_rata_pass_counter['too late stage']
        result['# times pro rata'] = pro_rata_pass_counter['did pro rata']

        # Value calculations
        result['total_value_acquired'] = montecarlo.get_total_value_acquired()
        result['total_value_alive'] = montecarlo.get_total_value_alive()

        # MOIC calculations
        result['25th_percentile'] = np.percentile(outcomes, 25)
        result['50th_percentile'] = np.percentile(outcomes, 50)
        result['75th_percentile'] = np.percentile(outcomes, 75)
        result['90th_percentile'] = np.percentile(outcomes, 90)
        result['total_MOIC'] = np.mean(outcomes)
        result['moic_outcomes'] = outcomes.tolist() if hasattr(outcomes, 'tolist') else list(outcomes)

        return result

    def format_results_for_output(self, results: List[Dict]) -> Dict[str, List]:
        """
        Format results for tabular output.

        Args:
            results: List of result dictionaries

        Returns:
            Dictionary with formatted data for display
        """
        table_data = {'Metric': [details['name'] for var, details in self.output_variables.items()]}

        for result in results:
            strategy_name = result.get('Strategy', f"Strategy {len(table_data)}")
            strategy_data = []

            for var, details in self.output_variables.items():
                value = result.get(var, 'N/A')
                if value != 'N/A':
                    try:
                        formatted_value = details['format'].format(value)
                    except (ValueError, TypeError):
                        formatted_value = str(value)
                else:
                    formatted_value = 'N/A'
                strategy_data.append(formatted_value)

            table_data[strategy_name] = strategy_data

        return table_data


def print_montecarlo_simulation_results_table(results: List[Dict]) -> Dict:
    """
    Process individual Monte Carlo simulation results into a summary table.

    Args:
        results: List of individual simulation result dictionaries

    Returns:
        Dictionary containing aggregated statistics
    """
    # Initialize accumulators
    total_alive = 0
    total_failed = 0
    total_acquired = 0
    total_value_alive = 0
    total_value_acquired = 0
    total_companies = 0

    summary_data = []

    # Loop through each firm result and extract data
    for index, firm_result in enumerate(results):
        if 'Overall' in firm_result:
            moic = firm_result['Overall']['MOIC']
            total_comp = firm_result['Overall']['Total companies']
            total_companies += total_comp
        else:
            moic = None
            total_comp = None

        # Pre-seed and Seed investments and values
        pre_seed_inv, pre_seed_val = firm_result['Initial Investments & Outcomes']['Pre-seed']
        seed_inv, seed_val = firm_result['Initial Investments & Outcomes']['Seed']

        # Outcome data
        alive_num, alive_val = firm_result['Outcomes']['Alive']
        fail_num, _ = firm_result['Outcomes']['Failed']
        acquired_num, acquired_val = firm_result['Outcomes']['Acquired']

        # Accumulate totals
        total_alive += alive_num
        total_value_alive += alive_val
        total_failed += fail_num
        total_acquired += acquired_num
        total_value_acquired += acquired_val

        summary_data.append({
            'Firm': f'Firm {index + 1}',
            'MOIC': moic,
            'Total Companies': total_comp,
            'Pre-seed Investments': pre_seed_inv,
            'Seed Investments': seed_inv,
            'Pre-seed Ending Value': pre_seed_val,
            'Seed Ending Value': seed_val,
            'Alive Companies': alive_num,
            'Failed Companies': fail_num,
            'Acquired Companies': acquired_num,
            'Alive Value': alive_val,
            'Acquired Value': acquired_val
        })

    # Calculate percentages
    percent_alive_companies = (total_alive / total_companies) * 100 if total_companies > 0 else 0
    percent_failed_companies = (total_failed / total_companies) * 100 if total_companies > 0 else 0
    percent_acquired_companies = (total_acquired / total_companies) * 100 if total_companies > 0 else 0

    total_value = total_value_alive + total_value_acquired
    percent_alive_value = (total_value_alive / total_value) * 100 if total_value > 0 else 0
    percent_acquired_value = (total_value_acquired / total_value) * 100 if total_value > 0 else 0

    return {
        'summary_data': summary_data,
        'percentages': {
            'companies': {
                'alive': percent_alive_companies,
                'failed': percent_failed_companies,
                'acquired': percent_acquired_companies
            },
            'value': {
                'alive': percent_alive_value,
                'acquired': percent_acquired_value
            }
        }
    }
