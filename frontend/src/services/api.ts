import axios from 'axios';
import type {
  SimulationRequest,
  SimulationResponse,
  MultipleSimulationRequest,
  MultipleSimulationResponse,
  QuickSimulationRequest,
  PresetsResponse,
} from '../types/simulation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const simulationApi = {
  /**
   * Run a single simulation with custom configuration
   */
  runSimulation: async (request: SimulationRequest): Promise<SimulationResponse> => {
    const response = await api.post<SimulationResponse>('/api/simulate', request);
    return response.data;
  },

  /**
   * Run multiple simulations to compare strategies
   */
  runMultipleSimulations: async (
    request: MultipleSimulationRequest
  ): Promise<MultipleSimulationResponse> => {
    const response = await api.post<MultipleSimulationResponse>(
      '/api/simulate/multiple',
      request
    );
    return response.data;
  },

  /**
   * Run a quick simulation with simplified parameters
   */
  runQuickSimulation: async (
    request: QuickSimulationRequest
  ): Promise<SimulationResponse> => {
    const response = await api.post<SimulationResponse>('/api/simulate/quick', request);
    return response.data;
  },

  /**
   * Get available preset configurations
   */
  getPresets: async (): Promise<PresetsResponse> => {
    const response = await api.get<PresetsResponse>('/api/presets');
    return response.data;
  },

  /**
   * Check API health
   */
  healthCheck: async (): Promise<{ status: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};

export default simulationApi;
