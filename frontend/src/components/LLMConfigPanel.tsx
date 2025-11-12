import { useState, useEffect } from 'react';
import { getAvailableModels, getDefaultModelId, ModelInfo } from '../services/api';

export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  concurrency: number;
}

interface LLMConfigPanelProps {
  config: LLMConfig;
  onConfigChange: (config: LLMConfig) => void;
  onRunAll?: () => Promise<void>;
  onRunSelected?: (rowIds: number[]) => Promise<void>;
  isRunning?: boolean;
  selectedRowIds?: number[];
  error?: string | null;
  hasValidPrompt?: boolean;
}

export default function LLMConfigPanel({
  config,
  onConfigChange,
  onRunAll,
  onRunSelected,
  isRunning = false,
  selectedRowIds = [],
  error,
  hasValidPrompt = false,
}: LLMConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<LLMConfig>(config);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Fetch available models from backend
  useEffect(() => {
    async function loadModels() {
      try {
        setModelsLoading(true);
        setModelsError(null);
        const models = await getAvailableModels();
        setAvailableModels(models);
        
        // If current model is not in the list, set to default
        const modelIds = models.map(m => m.id);
        if (!modelIds.includes(config.model)) {
          try {
            const defaultModelId = await getDefaultModelId();
            if (modelIds.includes(defaultModelId)) {
              const defaultModel = models.find(m => m.id === defaultModelId);
              const newConfig = {
                ...config,
                model: defaultModelId,
                temperature: defaultModel?.default_temperature ?? config.temperature,
                maxTokens: defaultModel?.default_max_tokens ?? config.maxTokens,
              };
              setLocalConfig(newConfig);
              onConfigChange(newConfig);
            }
          } catch (err) {
            // If we can't get default, just use first model
            if (models.length > 0) {
              const newConfig = {
                ...config,
                model: models[0].id,
                temperature: models[0].default_temperature,
                maxTokens: models[0].default_max_tokens,
              };
              setLocalConfig(newConfig);
              onConfigChange(newConfig);
            }
          }
        }
      } catch (err) {
        setModelsError(err instanceof Error ? err.message : 'Failed to load models');
        console.error('Error loading models:', err);
      } finally {
        setModelsLoading(false);
      }
    }
    
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Sync localConfig when config prop changes
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const handleModelChange = (model: string) => {
    const newConfig = { ...localConfig, model };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const handleTemperatureChange = (temperature: number) => {
    const newConfig = { ...localConfig, temperature };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const handleMaxTokensChange = (maxTokens: number) => {
    const newConfig = { ...localConfig, maxTokens };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  const handleConcurrencyChange = (concurrency: number) => {
    const newConfig = { ...localConfig, concurrency };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  return (
    <>
      <style>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
      <div style={{
        padding: '1.5rem',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: '0.25rem', fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
          LLM Configuration
        </h2>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
          Configure the model and parameters for running prompts
        </p>
      </div>

      {/* Model Selection */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: '500',
          marginBottom: '0.5rem',
          color: '#374151',
        }}>
          Model
        </label>
        <select
          value={localConfig.model}
          onChange={(e) => {
            const selectedModel = availableModels.find(m => m.id === e.target.value);
            if (selectedModel) {
              // Update config with model defaults when switching models
              const newConfig = {
                ...localConfig,
                model: selectedModel.id,
                temperature: selectedModel.default_temperature,
                maxTokens: selectedModel.default_max_tokens,
              };
              setLocalConfig(newConfig);
              onConfigChange(newConfig);
            } else {
              handleModelChange(e.target.value);
            }
          }}
          disabled={isRunning || modelsLoading}
          style={{
            width: '100%',
            padding: '0.625rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '0.875rem',
            backgroundColor: (isRunning || modelsLoading) ? '#f9fafb' : 'white',
            cursor: (isRunning || modelsLoading) ? 'not-allowed' : 'pointer',
            color: '#111827',
          }}
        >
          {modelsLoading ? (
            <option value="">Loading models...</option>
          ) : availableModels.length === 0 ? (
            <option value="">No models available</option>
          ) : (
            availableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} {model.provider !== 'openai' ? `(${model.provider})` : ''}
              </option>
            ))
          )}
        </select>
        {modelsError && (
          <p style={{
            margin: '0.5rem 0 0 0',
            fontSize: '0.75rem',
            color: '#dc2626',
          }}>
            ⚠️ {modelsError}
          </p>
        )}
      </div>

      {/* Temperature */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}>
          <label style={{
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#374151',
          }}>
            Temperature
          </label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={localConfig.temperature}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val >= 0 && val <= 1) {
                handleTemperatureChange(val);
              }
            }}
            disabled={isRunning}
            style={{
              width: '90px',
              padding: '0.375rem 0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              backgroundColor: isRunning ? '#f9fafb' : 'white',
              textAlign: 'center',
              color: '#111827',
            }}
          />
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={localConfig.temperature}
          onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
          disabled={isRunning}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '3px',
            background: '#e5e7eb',
            outline: 'none',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#9ca3af',
          marginTop: '0.375rem',
        }}>
          <span>More focused</span>
          <span>More creative</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}>
          <label style={{
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#374151',
          }}>
            Max Tokens
          </label>
          <input
            type="number"
            min="1"
            max="16384"
            value={localConfig.maxTokens}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 1 && val <= 16384) {
                handleMaxTokensChange(val);
              }
            }}
            disabled={isRunning}
            style={{
              width: '90px',
              padding: '0.375rem 0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              backgroundColor: isRunning ? '#f9fafb' : 'white',
              textAlign: 'center',
              color: '#111827',
            }}
          />
        </div>
        <input
          type="range"
          min="1"
          max="16384"
          step="1"
          value={localConfig.maxTokens}
          onChange={(e) => handleMaxTokensChange(parseInt(e.target.value))}
          disabled={isRunning}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '3px',
            background: '#e5e7eb',
            outline: 'none',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#9ca3af',
          marginTop: '0.375rem',
        }}>
          <span>1</span>
          <span>16384</span>
        </div>
      </div>

      {/* Concurrency */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}>
          <label style={{
            fontSize: '0.875rem',
            fontWeight: '500',
            color: '#374151',
          }}>
            Concurrency
          </label>
          <input
            type="number"
            min="1"
            max="50"
            step="1"
            value={localConfig.concurrency}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 1 && val <= 50) {
                handleConcurrencyChange(val);
              }
            }}
            disabled={isRunning}
            style={{
              width: '90px',
              padding: '0.375rem 0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              backgroundColor: isRunning ? '#f9fafb' : 'white',
              textAlign: 'center',
              color: '#111827',
            }}
          />
        </div>
        <input
          type="range"
          min="1"
          max="50"
          step="1"
          value={localConfig.concurrency}
          onChange={(e) => handleConcurrencyChange(parseInt(e.target.value) || 10)}
          disabled={isRunning}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '3px',
            background: '#e5e7eb',
            outline: 'none',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#9ca3af',
          marginTop: '0.375rem',
        }}>
          <span>Sequential (1)</span>
          <span>Parallel (50)</span>
        </div>
      </div>

      {onRunAll && (
        <div style={{
          marginTop: '0.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb',
        }}>
          <button
            onClick={async () => {
              if (onRunAll) {
                try {
                  await onRunAll();
                } catch (err) {
                  // Error handling is done in parent component
                }
              }
            }}
            disabled={isRunning || !hasValidPrompt}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              backgroundColor: (isRunning || !hasValidPrompt) ? '#d1d5db' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: (isRunning || !hasValidPrompt) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.15s ease',
              boxShadow: (isRunning || !hasValidPrompt) ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)',
            }}
            onMouseEnter={(e) => {
              if (!isRunning && hasValidPrompt) {
                e.currentTarget.style.backgroundColor = '#059669';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isRunning && hasValidPrompt) {
                e.currentTarget.style.backgroundColor = '#10b981';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
              } else {
                e.currentTarget.style.backgroundColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {isRunning ? 'Running...' : 'Run All Rows'}
          </button>
        </div>
      )}
      {onRunSelected && selectedRowIds.length > 0 && (
        <div style={{
          marginTop: '0.5rem',
        }}>
          <button
            onClick={async () => {
              if (onRunSelected) {
                try {
                  await onRunSelected(selectedRowIds);
                } catch (err) {
                  // Error handling is done in parent component
                }
              }
            }}
            disabled={isRunning || !hasValidPrompt}
            style={{
              width: '100%',
              padding: '0.625rem 1rem',
              backgroundColor: (isRunning || !hasValidPrompt) ? '#d1d5db' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: (isRunning || !hasValidPrompt) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.15s ease',
              boxShadow: (isRunning || !hasValidPrompt) ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)',
            }}
            onMouseEnter={(e) => {
              if (!isRunning && hasValidPrompt) {
                e.currentTarget.style.backgroundColor = '#2563eb';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isRunning && hasValidPrompt) {
                e.currentTarget.style.backgroundColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
              } else {
                e.currentTarget.style.backgroundColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {isRunning ? 'Running...' : `Run Selected (${selectedRowIds.length})`}
          </button>
        </div>
      )}
      
      {!hasValidPrompt && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.75rem',
          backgroundColor: '#fef3c7',
          color: '#92400e',
          borderRadius: '8px',
          fontSize: '0.875rem',
          border: '1px solid #fde68a',
        }}>
          ⚠️ Save a valid prompt template before running
        </div>
      )}
      
      {error && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.75rem',
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: '8px',
          fontSize: '0.875rem',
          border: '1px solid #fecaca',
        }}>
          {error}
        </div>
      )}
      </div>
    </>
  );
}

