import { useState, useEffect } from 'react';

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

const AVAILABLE_MODELS = [
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
];

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
    <div style={{
      padding: '1.5rem',
      border: '1px solid #ddd',
      borderRadius: '8px',
      backgroundColor: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>LLM Configuration</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
          Configure the model and parameters for running prompts
        </p>
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#666',
        }}>
          Model
        </label>
        <select
          value={localConfig.model}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={isRunning}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.9rem',
            backgroundColor: isRunning ? '#f5f5f5' : 'white',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {AVAILABLE_MODELS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#666',
        }}>
          Temperature: {localConfig.temperature.toFixed(1)}
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={localConfig.temperature}
          onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
          disabled={isRunning}
          style={{
            width: '100%',
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#999',
          marginTop: '0.25rem',
        }}>
          <span>More focused</span>
          <span>More creative</span>
        </div>
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#666',
        }}>
          Max Tokens
        </label>
        <input
          type="number"
          min="1"
          max="8000"
          value={localConfig.maxTokens}
          onChange={(e) => handleMaxTokensChange(parseInt(e.target.value) || 2000)}
          disabled={isRunning}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.9rem',
            backgroundColor: isRunning ? '#f5f5f5' : 'white',
          }}
        />
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          color: '#666',
        }}>
          Concurrency: {localConfig.concurrency}
        </label>
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
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: '#999',
          marginTop: '0.25rem',
        }}>
          <span>Sequential (1)</span>
          <span>Parallel (50)</span>
        </div>
        <p style={{
          margin: '0.25rem 0 0 0',
          fontSize: '0.75rem',
          color: '#666',
          fontStyle: 'italic',
        }}>
          Number of rows to process simultaneously
        </p>
      </div>

      {onRunAll && (
        <div style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #ddd',
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
              padding: '0.875rem 1.25rem',
              backgroundColor: (isRunning || !hasValidPrompt) ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: (isRunning || !hasValidPrompt) ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              boxShadow: (isRunning || !hasValidPrompt) ? 'none' : '0 2px 4px rgba(40, 167, 69, 0.2)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!isRunning && hasValidPrompt) {
                e.currentTarget.style.backgroundColor = '#218838';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(40, 167, 69, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isRunning && hasValidPrompt) {
                e.currentTarget.style.backgroundColor = '#28a745';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.2)';
              } else {
                e.currentTarget.style.backgroundColor = '#ccc';
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
              padding: '0.75rem 1rem',
              backgroundColor: (isRunning || !hasValidPrompt) ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isRunning || !hasValidPrompt) ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
            }}
          >
            {isRunning ? 'Running...' : `Run Selected (${selectedRowIds.length})`}
          </button>
        </div>
      )}
      
      {!hasValidPrompt && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#fff3cd',
          color: '#856404',
          borderRadius: '4px',
          fontSize: '0.85rem',
          border: '1px solid #ffeaa7',
        }}>
          ⚠️ Save a valid prompt template before running
        </div>
      )}
      
      {error && (
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#fee',
          color: '#c33',
          borderRadius: '4px',
          fontSize: '0.9rem',
          border: '1px solid #fcc',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

