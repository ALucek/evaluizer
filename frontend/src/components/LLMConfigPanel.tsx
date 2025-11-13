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
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(true);

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

      {/* Model ID Input */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: '500',
          marginBottom: '0.5rem',
          color: '#374151',
        }}>
          Model ID
        </label>
        <input
          type="text"
          value={localConfig.model}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={isRunning}
          placeholder="e.g., gpt-4, azure/gpt-4, gemini/gemini-pro, vertex_ai/gemini-pro"
          style={{
            width: '100%',
            padding: '0.625rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '0.875rem',
            backgroundColor: isRunning ? '#f9fafb' : 'white',
            color: '#111827',
            fontFamily: 'monospace',
          }}
        />
        <p style={{
          margin: '0.5rem 0 0 0',
          fontSize: '0.75rem',
          color: '#6b7280',
        }}>
          Enter any LiteLLM-supported model ID. Examples: gpt-4, azure/your-deployment, gemini/gemini-pro
        </p>
      </div>

      {/* Advanced Configuration Section - Collapsible */}
      <div style={{
        border: '1px solid #dee2e6',
        borderRadius: '6px',
        backgroundColor: '#fff',
        overflow: 'hidden',
      }}>
        <div
          onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#f8f9fa',
            borderBottom: isAdvancedExpanded ? '1px solid #dee2e6' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e9ecef';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#495057' }}>
            Advanced Configuration
          </div>
          <span style={{ fontSize: '1rem', color: '#6c757d' }}>
            {isAdvancedExpanded ? 'v' : '>'}
          </span>
        </div>
        
        {isAdvancedExpanded && (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                paddingTop: '1rem',
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
                WARNING: Save a valid prompt template before running
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
        )}
      </div>
      </div>
    </>
  );
}

