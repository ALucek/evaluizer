import { useState, useEffect, useRef, useCallback } from 'react';
import { Prompt } from '../services/api';

export interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  concurrency: number;
}

interface PromptEditorProps {
  prompt: Prompt | null | undefined;
  groupedPrompts: Record<string, Prompt[]>;
  columns: string[];
  onSave: (prompt: string, createNewVersion: boolean, name?: string, commitMessage?: string) => Promise<void>;
  onVersionSelect: (versionId: number) => void;
  onDeletePrompt?: (promptId: number) => Promise<void>;
  onContentChange?: (content: string) => void; // Callback to notify parent of content changes
  onAutoSave?: (promptId: number, content: string) => Promise<void>; // Callback for auto-saving
  llmConfig: LLMConfig;
  onLLMConfigChange: (config: LLMConfig) => void;
  onRunAll?: () => Promise<void>;
  onCancel?: () => void;
  isRunning?: boolean;
  isRunningAll?: boolean;
  isCancelling?: boolean;
  error?: string | null;
}

export default function PromptEditor({ prompt, groupedPrompts, columns, onSave, onVersionSelect, onDeletePrompt, onContentChange, onAutoSave, llmConfig, onLLMConfigChange, onRunAll, onCancel, isRunning = false, isRunningAll = false, isCancelling = false, error }: PromptEditorProps) {
  const [value, setValue] = useState(prompt?.content || '');
  const [promptName, setPromptName] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedPromptName, setSelectedPromptName] = useState<string | null>(null);
  const [showNewPromptForm, setShowNewPromptForm] = useState(false);
  const [isVersioningExpanded, setIsVersioningExpanded] = useState(false);
  const [isLLMConfigExpanded, setIsLLMConfigExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [localLLMConfig, setLocalLLMConfig] = useState<LLMConfig>(llmConfig);

  // Flatten grouped prompts for display
  const promptGroups = Object.entries(groupedPrompts).sort(([a], [b]) => a.localeCompare(b));
  const allPromptNames = promptGroups.map(([name]) => name);

  // Set selected prompt name based on current prompt
  useEffect(() => {
    if (prompt) {
      const currentPromptName = prompt.name || 'Unnamed';
      setSelectedPromptName(currentPromptName);
      setShowNewPromptForm(false);
    } else {
      // If no prompt, select first prompt if available, or show new prompt form
      if (allPromptNames.length > 0 && !selectedPromptName && !showNewPromptForm) {
        setSelectedPromptName(allPromptNames[0]);
      } else if (allPromptNames.length === 0 && !showNewPromptForm) {
        setShowNewPromptForm(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, allPromptNames.length]);

  useEffect(() => {
    const newValue = prompt?.content || '';
    setValue(newValue);
    // Notify parent of content changes when prompt changes
    if (onContentChange) {
      onContentChange(newValue);
    }
    // Only reset prompt name if we're creating a new prompt (no prompt exists)
    if (!prompt) {
      setPromptName('');
    }
    // Clear any pending auto-save when prompt changes
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  }, [prompt, onContentChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Sync localLLMConfig when llmConfig prop changes
  useEffect(() => {
    setLocalLLMConfig(llmConfig);
  }, [llmConfig]);

  const handleModelChange = (model: string) => {
    const newConfig = { ...localLLMConfig, model };
    setLocalLLMConfig(newConfig);
    onLLMConfigChange(newConfig);
  };

  const handleTemperatureChange = (temperature: number) => {
    const newConfig = { ...localLLMConfig, temperature };
    setLocalLLMConfig(newConfig);
    onLLMConfigChange(newConfig);
  };

  const handleMaxTokensChange = (maxTokens: number) => {
    const newConfig = { ...localLLMConfig, maxTokens };
    setLocalLLMConfig(newConfig);
    onLLMConfigChange(newConfig);
  };

  const handleConcurrencyChange = (concurrency: number) => {
    const newConfig = { ...localLLMConfig, concurrency };
    setLocalLLMConfig(newConfig);
    onLLMConfigChange(newConfig);
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = prompt && value !== prompt.content;

  // Get versions for selected prompt
  const selectedPromptVersions = selectedPromptName && groupedPrompts[selectedPromptName]
    ? groupedPrompts[selectedPromptName]
    : [];

  // Validate prompt template in real-time
  const validatePrompt = () => {
    if (!value.trim()) {
      return { isValid: false, message: 'Prompt cannot be empty' };
    }

    // Extract all column names from template
    const columnMatches = value.match(/\{\{([^}]+)\}\}/g) || [];
    const columnNames = columnMatches.map(match => match.replace(/[{}]/g, '').trim());
    
    if (columnNames.length === 0) {
      return { isValid: false, message: 'Prompt must include at least one column variable (e.g., {{column_name}})' };
    }

    // Check if all referenced columns exist
    const missingColumns = columnNames.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      return { 
        isValid: false, 
        message: `Invalid columns: ${missingColumns.join(', ')}. Available: ${columns.join(', ')}` 
      };
    }

    return { isValid: true, message: null };
  };

  const validation = validatePrompt();

  // Auto-save function with debouncing
  const debouncedAutoSave = useCallback((content: string) => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only auto-save if we have a prompt (not creating new) and onAutoSave is provided
    if (prompt && onAutoSave) {
      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onAutoSave(prompt.id, content);
        } catch (err) {
          console.error('Auto-save failed:', err);
          // Don't show error to user for auto-save failures
        }
      }, 1500); // Wait 1.5 seconds after user stops typing
    }
  }, [prompt, onAutoSave]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    // Notify parent of content changes
    if (onContentChange) {
      onContentChange(newValue);
    }
    // Trigger auto-save with debouncing
    debouncedAutoSave(newValue);
  };

  const handleSave = async (createNewVersion: boolean) => {
    if (!validation.isValid) {
      return;
    }

    setIsSaving(true);
    try {
      // Check if we're creating a new prompt (new branch) vs committing to existing
      const isCreatingNewPrompt = showNewPromptForm || (!prompt && promptName.trim());
      
      // When creating a new prompt, use promptName. When updating/creating version, use commitMessage
      const name = isCreatingNewPrompt ? promptName.trim() || undefined : undefined;
      const commitMsg = !isCreatingNewPrompt && prompt ? commitMessage.trim() || undefined : undefined;
      
      // Pass a flag to indicate we're creating a new prompt (not a version)
      await onSave(value, isCreatingNewPrompt ? false : createNewVersion, name, commitMsg);
      setCommitMessage('');
      setPromptName('');
      setShowNewPromptForm(false);
    } catch (err) {
      console.error('Failed to save prompt:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const insertVariable = (columnName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const variable = `{{${columnName}}}`;
    const newValue = value.substring(0, start) + variable + value.substring(end);
    
    setValue(newValue);

    setTimeout(() => {
      if (textarea) {
        const newPos = start + variable.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 0);
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
        padding: '0.75rem 1.5rem 1.5rem 1.5rem',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Prompt Template</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
          Use <code style={{ backgroundColor: '#fff3cd', padding: '2px 4px', borderRadius: '3px' }}>{'{{column_name}}'}</code> to insert column values
        </p>
      </div>

      {columns.length > 0 && (
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#666' }}>
            Available Columns:
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}>
            {columns.map((col) => (
              <button
                key={col}
                onClick={() => insertVariable(col)}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: '#e9ecef',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: '#495057',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d0d7de';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#e9ecef';
                }}
              >
                {col}
              </button>
            ))}
          </div>
        </div>
      )}


      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder="Enter your prompt template here...&#10;Example: Analyze the following: {{question}}"
        style={{
          width: '100%',
          minHeight: '200px',
          padding: '0.75rem',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '0.9rem',
          fontFamily: 'monospace',
          lineHeight: '1.5',
          boxSizing: 'border-box',
          resize: 'vertical',
          outline: 'none',
        }}
      />

      {/* Save Button - Above Run All */}
      {(!prompt || showNewPromptForm) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Prompt Name Input - Only show when creating a new prompt */}
          {(showNewPromptForm || (!prompt && allPromptNames.length === 0)) && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#666' }}>
                Prompt Name (required):
              </label>
              <input
                type="text"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                placeholder="e.g., Main Prompt, Experiment A..."
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {showNewPromptForm && allPromptNames.length > 0 && (
              <button
                onClick={() => {
                  setShowNewPromptForm(false);
                  setSelectedPromptName(allPromptNames[0]);
                  const versions = groupedPrompts[allPromptNames[0]];
                  if (versions && versions.length > 0) {
                    onVersionSelect(versions[versions.length - 1].id);
                  }
                }}
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500',
                }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving || !validation.isValid || !promptName.trim()}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                backgroundColor: (validation.isValid && promptName.trim()) ? '#007bff' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: (isSaving || !validation.isValid || !promptName.trim()) ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
                opacity: (isSaving || !validation.isValid || !promptName.trim()) ? 0.6 : 1,
              }}
            >
              {isSaving ? 'Saving...' : 'Save Prompt'}
            </button>
          </div>
        </div>
      )}

      {/* Warning and Error Messages */}
      {((!prompt || !validation.isValid) || error) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {!validation.isValid && (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '8px',
              fontSize: '0.875rem',
              border: '1px solid #f5c6cb',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{ fontSize: '1rem' }}>✗</span>
              <span>{validation.message || 'Invalid prompt template'}</span>
            </div>
          )}
          
          {(!prompt || !validation.isValid) && (
            <div style={{
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

      {/* Run All Button / Cancel Button */}
      {onRunAll && (
        <div>
          {isRunningAll && onCancel ? (
            <button
              onClick={() => {
                if (onCancel) {
                  onCancel();
                }
              }}
              disabled={isCancelling}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: isCancelling ? '#6c757d' : '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isCancelling ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                opacity: isCancelling ? 0.8 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isCancelling) {
                  e.currentTarget.style.backgroundColor = '#c82333';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isCancelling) {
                  e.currentTarget.style.backgroundColor = '#dc3545';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                }
              }}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Running'}
            </button>
          ) : (
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
              disabled={isRunning || !validation.isValid || !prompt}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                backgroundColor: (isRunning || !validation.isValid || !prompt) ? '#d1d5db' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (isRunning || !validation.isValid || !prompt) ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.15s ease',
                boxShadow: (isRunning || !validation.isValid || !prompt) ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)',
              }}
              onMouseEnter={(e) => {
                if (!isRunning && validation.isValid && prompt) {
                  e.currentTarget.style.backgroundColor = '#059669';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRunning && validation.isValid && prompt) {
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
          )}
        </div>
      )}

      {/* LLM Configuration Section - Collapsible */}
      <div style={{
        border: '1px solid #dee2e6',
        borderRadius: '6px',
        backgroundColor: '#fff',
        overflow: 'hidden',
      }}>
        <div
          onClick={() => setIsLLMConfigExpanded(!isLLMConfigExpanded)}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#f8f9fa',
            borderBottom: isLLMConfigExpanded ? '1px solid #dee2e6' : 'none',
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
            LLM Configuration
          </div>
          <span style={{ fontSize: '1rem', color: '#6c757d' }}>
            {isLLMConfigExpanded ? '▼' : '▶'}
          </span>
        </div>
        
        {isLLMConfigExpanded && (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                value={localLLMConfig.model}
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
                  boxSizing: 'border-box',
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
                  value={localLLMConfig.temperature}
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
                value={localLLMConfig.temperature}
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
                  value={localLLMConfig.maxTokens}
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
                value={localLLMConfig.maxTokens}
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
                  value={localLLMConfig.concurrency}
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
                value={localLLMConfig.concurrency}
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
          </div>
        )}
      </div>

      {/* Prompt Versioning Section - Collapsible */}
      <div style={{
        border: '1px solid #dee2e6',
        borderRadius: '6px',
        backgroundColor: '#fff',
        overflow: 'hidden',
      }}>
        <div
          onClick={() => setIsVersioningExpanded(!isVersioningExpanded)}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#f8f9fa',
            borderBottom: isVersioningExpanded ? '1px solid #dee2e6' : 'none',
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
            Prompt Versioning
          </div>
          <span style={{ fontSize: '1rem', color: '#6c757d' }}>
            {isVersioningExpanded ? '▼' : '▶'}
          </span>
        </div>
        
        {isVersioningExpanded && (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Prompt Selector */}
            {allPromptNames.length > 0 && (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#666', marginRight: '0.25rem', flexShrink: 0 }}>
                    Prompt:
                  </label>
                  <select
                    value={selectedPromptName || ''}
                    onChange={(e) => {
                      setSelectedPromptName(e.target.value);
                      setShowNewPromptForm(false);
                      // Load the latest version of the selected prompt
                      const versions = groupedPrompts[e.target.value];
                      if (versions && versions.length > 0) {
                        const latestVersion = versions[versions.length - 1];
                        onVersionSelect(latestVersion.id);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      minWidth: '150px',
                    }}
                  >
                    {allPromptNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setShowNewPromptForm(true);
                      setSelectedPromptName(null);
                      setPromptName('');
                      setValue('');
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      minWidth: '36px',
                    }}
                    title="New Prompt"
                  >
                    +
                  </button>
                  {selectedPromptName && onDeletePrompt && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const versions = groupedPrompts[selectedPromptName];
                        if (!versions || versions.length === 0) return;
                        
                        // Delete all versions of this prompt (delete the branch)
                        const promptName = selectedPromptName;
                        if (!window.confirm(`Are you sure you want to delete the prompt "${promptName}" and all its versions? This action cannot be undone.`)) {
                          return;
                        }
                        
                        // Delete all versions
                        for (const version of versions) {
                          if (onDeletePrompt) {
                            await onDeletePrompt(version.id);
                          }
                        }
                      }}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        minWidth: '36px',
                      }}
                      title="Delete this prompt and all its versions"
                    >
                      −
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Versions List - Show only versions for selected prompt */}
            {selectedPromptName && selectedPromptVersions.length > 0 && (
              <div style={{
                padding: '0.75rem',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '6px',
              }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#495057' }}>
                  Versions:
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}>
                  {selectedPromptVersions.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: prompt?.id === v.id ? '#007bff' : 'white',
                        border: `1px solid ${prompt?.id === v.id ? '#007bff' : '#dee2e6'}`,
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => {
                        // If there are unsaved changes, warn the user
                        if (hasUnsavedChanges && prompt?.id !== v.id) {
                          if (!window.confirm('You have unsaved changes. Switching versions will discard them. Continue?')) {
                            return;
                          }
                        }
                        onVersionSelect(v.id);
                      }}
                      onMouseEnter={(e) => {
                        if (prompt?.id !== v.id) {
                          e.currentTarget.style.backgroundColor = '#f0f7ff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (prompt?.id !== v.id) {
                          e.currentTarget.style.backgroundColor = 'white';
                        }
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: prompt?.id === v.id ? '600' : '500',
                          color: prompt?.id === v.id ? 'white' : '#495057',
                          fontSize: '0.85rem',
                        }}>
                          v{v.version}
                        </div>
                        {v.commit_message && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: prompt?.id === v.id ? 'rgba(255,255,255,0.9)' : '#6c757d',
                            marginTop: '0.25rem',
                            fontStyle: 'italic',
                          }}>
                            {v.commit_message}
                          </div>
                        )}
                        {v.created_at && (
                          <div style={{
                            fontSize: '0.7rem',
                            color: prompt?.id === v.id ? 'rgba(255,255,255,0.7)' : '#adb5bd',
                            marginTop: '0.15rem',
                          }}>
                            {new Date(v.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      {onDeletePrompt && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const versionLabel = v.commit_message || `v${v.version}`;
                            if (!window.confirm(`Are you sure you want to delete version ${v.version}${v.commit_message ? ` (${v.commit_message})` : ''}? This action cannot be undone.`)) {
                              return;
                            }
                            if (onDeletePrompt) {
                              await onDeletePrompt(v.id);
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: prompt?.id === v.id ? 'rgba(255,255,255,0.2)' : 'transparent',
                            color: prompt?.id === v.id ? 'white' : '#dc3545',
                            border: `1px solid ${prompt?.id === v.id ? 'rgba(255,255,255,0.3)' : '#dc3545'}`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap',
                            opacity: 0.8,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.backgroundColor = prompt?.id === v.id ? 'rgba(255,255,255,0.3)' : '#fee';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.8';
                            e.currentTarget.style.backgroundColor = prompt?.id === v.id ? 'rgba(255,255,255,0.2)' : 'transparent';
                          }}
                          title="Delete this version"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Commit Message Input and Button - Only show when prompt exists */}
            {prompt && (
              <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#666' }}>
                    Commit Message:
                  </label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="e.g., Fixed typo, Improved clarity..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                      marginBottom: '0.5rem',
                    }}
                  />
                </div>
                <button
                  onClick={() => handleSave(true)}
                  disabled={isSaving || !validation.isValid}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    backgroundColor: validation.isValid ? '#007bff' : '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (isSaving || !validation.isValid) ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500',
                    opacity: (isSaving || !validation.isValid) ? 0.6 : 1,
                  }}
                >
                  {isSaving ? 'Committing...' : 'Commit Changes'}
                </button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
    </>
  );
}
