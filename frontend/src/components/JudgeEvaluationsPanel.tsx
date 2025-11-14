import { useState, useEffect, useRef, useCallback } from 'react';
import { JudgeConfig, LLMConfig } from '../services/api';

interface JudgeEvaluationsPanelProps {
  csvFileId: number | null;
  judgeConfigs: JudgeConfig[];
  onConfigsChange: (configs: JudgeConfig[]) => void;
  columns: string[];
  onRunJudgeForAllRows?: (configId: number, concurrency?: number) => Promise<void>;
  onClearJudgeForAllRows?: (configId: number) => Promise<void>;
  onCreateJudgeConfig?: (name: string, prompt: string, llmConfig: LLMConfig) => Promise<JudgeConfig>;
  onUpdateJudgeConfig?: (id: number, partial: { name?: string; prompt?: string; model?: string; temperature?: number; maxTokens?: number }) => Promise<void>;
  onDeleteJudgeConfig?: (id: number) => Promise<void>;
  isRunningJudge?: boolean;
  runningJudgeConfigId?: number | null;
  onCancelJudge?: () => void;
  isCancellingJudge?: boolean;
}

export default function JudgeEvaluationsPanel({
  csvFileId,
  judgeConfigs,
  onConfigsChange,
  columns,
  onRunJudgeForAllRows,
  onClearJudgeForAllRows,
  onCreateJudgeConfig,
  onUpdateJudgeConfig,
  onDeleteJudgeConfig,
  isRunningJudge = false,
  runningJudgeConfigId = null,
  onCancelJudge,
  isCancellingJudge = false,
}: JudgeEvaluationsPanelProps) {
  const [judgePrompt, setJudgePrompt] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [selectedJudgeName, setSelectedJudgeName] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [isLLMConfigExpanded, setIsLLMConfigExpanded] = useState(false);
  const [isConcurrencyExpanded, setIsConcurrencyExpanded] = useState(false);
  const [localLLMConfig, setLocalLLMConfig] = useState<LLMConfig>({
    model: 'gpt-5',
    temperature: 0.0,
    maxTokens: 500,
    concurrency: 10,
  });
  const [judgeConcurrency, setJudgeConcurrency] = useState<number>(10);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousConfigIdRef = useRef<number | null>(null);
  const previousShowNewFormRef = useRef<boolean>(false);

  // Get unique judge names (grouped by name)
  const judgeNames = Array.from(new Set(judgeConfigs.map(c => c.name))).sort();
  const selectedJudgeConfig = selectedJudgeName ? judgeConfigs.find(c => c.name === selectedJudgeName) : null;

  // Set selected judge name based on available configs - but don't auto-select
  // User should explicitly select or create new

  // Load selected config when selection changes (only when config ID changes, not when object reference changes)
  useEffect(() => {
    const currentConfigId = selectedJudgeConfig?.id ?? null;
    const previousConfigId = previousConfigIdRef.current;
    const previousShowNewForm = previousShowNewFormRef.current;
    
    // Reset if:
    // 1. Config ID changed (user selected a different config)
    // 2. Switching to/from new form mode
    const configIdChanged = currentConfigId !== previousConfigId;
    const showNewFormChanged = showNewForm !== previousShowNewForm;
    
    if (configIdChanged || showNewFormChanged) {
      if (selectedJudgeConfig && !showNewForm) {
        setJudgePrompt(selectedJudgeConfig.prompt);
        setJudgeName(selectedJudgeConfig.name);
        setLocalLLMConfig({
          model: selectedJudgeConfig.model,
          temperature: selectedJudgeConfig.temperature,
          maxTokens: selectedJudgeConfig.max_tokens,
          concurrency: 10,
        });
      } else if (showNewForm) {
        // Start with empty prompt - Output is automatically included
        setJudgePrompt('');
        setJudgeName('');
        setLocalLLMConfig({
          model: 'gpt-5',
          temperature: 0.0,
          maxTokens: 500,
          concurrency: 10,
        });
      }
      previousConfigIdRef.current = currentConfigId;
      previousShowNewFormRef.current = showNewForm;
    }
  }, [selectedJudgeConfig?.id, showNewForm]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleModelChange = (model: string) => {
    const newConfig = { ...localLLMConfig, model };
    setLocalLLMConfig(newConfig);
    // Trigger auto-save with the new model value
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt,
            model: newConfig.model, // Use the new model value directly
            temperature: newConfig.temperature,
            maxTokens: newConfig.maxTokens,
          });
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 1500);
    }
  };

  const handleTemperatureChange = (temperature: number) => {
    const newConfig = { ...localLLMConfig, temperature };
    setLocalLLMConfig(newConfig);
    // Trigger auto-save with the new temperature value
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt,
            model: newConfig.model,
            temperature: newConfig.temperature, // Use the new temperature value directly
            maxTokens: newConfig.maxTokens,
          });
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 1500);
    }
  };

  const handleMaxTokensChange = (maxTokens: number) => {
    const newConfig = { ...localLLMConfig, maxTokens };
    setLocalLLMConfig(newConfig);
    // Trigger auto-save with the new maxTokens value
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt,
            model: newConfig.model,
            temperature: newConfig.temperature,
            maxTokens: newConfig.maxTokens, // Use the new maxTokens value directly
          });
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 1500);
    }
  };

  const handleJudgeConcurrencyChange = (concurrency: number) => {
    setJudgeConcurrency(concurrency);
  };

  // Auto-save function with debouncing
  const debouncedAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt,
            model: localLLMConfig.model,
            temperature: localLLMConfig.temperature,
            maxTokens: localLLMConfig.maxTokens,
          });
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 1500);
    }
  }, [selectedJudgeConfig, judgeName, judgePrompt, localLLMConfig, onUpdateJudgeConfig]);

  const insertVariable = (columnName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const variable = `{{${columnName}}}`;
    const newValue = judgePrompt.substring(0, start) + variable + judgePrompt.substring(end);
    
    setJudgePrompt(newValue);
    debouncedAutoSave();

    setTimeout(() => {
      if (textarea) {
        const newPos = start + variable.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setJudgePrompt(newValue);
    debouncedAutoSave();
  };

  const handleSave = async () => {
    if (!judgeName.trim() || !judgePrompt.trim() || !csvFileId) return;

    setIsSaving(true);
    try {
      if (selectedJudgeConfig) {
        // Updating existing config
        if (onUpdateJudgeConfig) {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt.trim(),
            model: localLLMConfig.model,
            temperature: localLLMConfig.temperature,
            maxTokens: localLLMConfig.maxTokens,
          });
        }
        // Close the editor after saving
        setSelectedJudgeName(null);
        setShowNewForm(false);
        setIsLLMConfigExpanded(false);
      } else if (onCreateJudgeConfig) {
        // Creating new config
        await onCreateJudgeConfig(judgeName.trim(), judgePrompt.trim(), localLLMConfig);
        setShowNewForm(false);
        setJudgeName('');
        setJudgePrompt('');
        setIsLLMConfigExpanded(false);
        // Don't auto-select - let user choose to edit it or add another
      }
    } catch (err) {
      console.error('Failed to save judge config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setShowNewForm(false);
    setJudgeName('');
    setJudgePrompt('');
    setIsLLMConfigExpanded(false);
    // Close the editor by clearing selection
    setSelectedJudgeName(null);
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = selectedJudgeConfig && (
    judgeName.trim() !== selectedJudgeConfig.name ||
    judgePrompt !== selectedJudgeConfig.prompt ||
    localLLMConfig.model !== selectedJudgeConfig.model ||
    localLLMConfig.temperature !== selectedJudgeConfig.temperature ||
    localLLMConfig.maxTokens !== selectedJudgeConfig.max_tokens
  );

  return (
    <div style={{
      padding: '1rem 1.5rem',
      border: '1px solid var(--border-primary)',
      borderRadius: '0',
      backgroundColor: 'var(--bg-elevated)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          LLM-AS-A-JUDGE EVALUATIONS
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          ENTER YOUR EVALUATION CRITERIA BELOW. THE OUTPUT COLUMN IS AUTOMATICALLY INCLUDED FOR EVALUATION. USE <code style={{ backgroundColor: 'var(--bg-tertiary)', padding: '2px 4px', borderRadius: '0', color: 'var(--accent-primary)', fontFamily: 'monospace', fontWeight: '700' }}>{'{{COLUMN_NAME}}'}</code> TO REFERENCE OTHER COLUMNS FOR CONTEXT.
        </p>
      </div>

      {/* Evaluations List - Similar to Prompt Versions */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          EVALUATIONS:
        </div>
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '0',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            {[...judgeConfigs].sort((a, b) => {
              // Sort by created_at ascending (oldest first), then by name - so newest appear at bottom
              if (a.created_at && b.created_at) {
                const dateA = new Date(a.created_at).getTime();
                const dateB = new Date(b.created_at).getTime();
                if (dateA !== dateB) {
                  return dateA - dateB;
                }
              }
              return a.name.localeCompare(b.name);
            }).map((config) => {
                const isSelected = selectedJudgeConfig?.id === config.id;
                return (
                  <div
                    key={config.id}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'var(--bg-elevated)',
                      border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      borderRadius: '0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      transition: 'none',
                      outline: isSelected ? '2px solid var(--accent-primary)' : 'none',
                      outlineOffset: isSelected ? '-2px' : '0',
                    }}
                    onClick={() => {
                      // Toggle: if already selected, deselect it (close editor)
                      if (isSelected) {
                        setSelectedJudgeName(null);
                        setShowNewForm(false);
                        setIsLLMConfigExpanded(false);
                      } else {
                        setSelectedJudgeName(config.name);
                        setShowNewForm(false);
                        setIsLLMConfigExpanded(false);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.outline = 'none';
                        e.currentTarget.style.outlineOffset = '0';
                      }
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: isSelected ? '700' : '600',
                        color: 'var(--text-primary)',
                        fontSize: '0.8125rem',
                        fontFamily: 'monospace',
                        marginBottom: '0.5rem',
                      }}>
                        {config.name}
                      </div>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}>
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary)',
                        }}>
                          {config.model}
                        </div>
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary)',
                        }}>
                          Temp: {config.temperature}
                        </div>
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary)',
                        }}>
                          Max Tokens: {config.max_tokens}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'stretch' }}>
                      {onRunJudgeForAllRows && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onRunJudgeForAllRows) {
                              onRunJudgeForAllRows(config.id, judgeConcurrency);
                            }
                          }}
                          disabled={isRunningJudge && runningJudgeConfigId === config.id}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: (isRunningJudge && runningJudgeConfigId === config.id) ? 'var(--bg-tertiary)' : 'var(--accent-success)',
                            color: (isRunningJudge && runningJudgeConfigId === config.id) ? 'var(--text-tertiary)' : '#000000',
                            border: 'none',
                            borderRadius: '0',
                            cursor: (isRunningJudge && runningJudgeConfigId === config.id) ? 'not-allowed' : 'pointer',
                            fontSize: '0.6875rem',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            opacity: (isRunningJudge && runningJudgeConfigId === config.id) ? 0.4 : 1,
                            transition: 'none',
                            textTransform: 'uppercase',
                            width: '100%',
                          }}
                          onMouseEnter={(e) => {
                            if (!(isRunningJudge && runningJudgeConfigId === config.id)) {
                              e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                              e.currentTarget.style.outlineOffset = '-2px';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.outline = 'none';
                          }}
                          title="Run this evaluation for all rows"
                        >
                          {(isRunningJudge && runningJudgeConfigId === config.id) ? 'RUNNING...' : 'RUN ALL'}
                        </button>
                      )}
                      {onClearJudgeForAllRows && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to clear all scores for the evaluation "${config.name}"? This action cannot be undone.`)) {
                              if (onClearJudgeForAllRows) {
                                onClearJudgeForAllRows(config.id);
                              }
                            }
                          }}
                          disabled={isRunningJudge && runningJudgeConfigId === config.id}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: (isRunningJudge && runningJudgeConfigId === config.id) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                            color: (isRunningJudge && runningJudgeConfigId === config.id) ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '0',
                            cursor: (isRunningJudge && runningJudgeConfigId === config.id) ? 'not-allowed' : 'pointer',
                            fontSize: '0.6875rem',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            opacity: (isRunningJudge && runningJudgeConfigId === config.id) ? 0.4 : 1,
                            transition: 'none',
                            textTransform: 'uppercase',
                            width: '100%',
                          }}
                          onMouseEnter={(e) => {
                            if (!(isRunningJudge && runningJudgeConfigId === config.id)) {
                              e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                              e.currentTarget.style.outlineOffset = '-2px';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.outline = 'none';
                          }}
                          title="Clear all scores for this evaluation"
                        >
                          CLEAR
                        </button>
                      )}
                      {onDeleteJudgeConfig && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (isRunningJudge && runningJudgeConfigId === config.id) {
                              return;
                            }
                            if (window.confirm(`Are you sure you want to delete the evaluation "${config.name}" and all its scores? This action cannot be undone.`)) {
                              if (onDeleteJudgeConfig) {
                                await onDeleteJudgeConfig(config.id);
                                // Clear selection when deleting - don't auto-select next
                                setSelectedJudgeName(null);
                                setShowNewForm(false);
                                setIsLLMConfigExpanded(false);
                              }
                            }
                          }}
                          disabled={isRunningJudge && runningJudgeConfigId === config.id}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: 'transparent',
                            color: (isRunningJudge && runningJudgeConfigId === config.id) ? 'var(--text-tertiary)' : 'var(--accent-danger)',
                            border: `1px solid ${(isRunningJudge && runningJudgeConfigId === config.id) ? 'var(--border-primary)' : 'var(--accent-danger)'}`,
                            borderRadius: '0',
                            cursor: (isRunningJudge && runningJudgeConfigId === config.id) ? 'not-allowed' : 'pointer',
                            fontSize: '0.6875rem',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            transition: 'none',
                            textTransform: 'uppercase',
                            width: '100%',
                            opacity: (isRunningJudge && runningJudgeConfigId === config.id) ? 0.4 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (!(isRunningJudge && runningJudgeConfigId === config.id)) {
                              e.currentTarget.style.outline = '2px solid var(--accent-danger)';
                              e.currentTarget.style.outlineOffset = '-2px';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.outline = 'none';
                          }}
                          title={(isRunningJudge && runningJudgeConfigId === config.id) ? "Cannot delete evaluation while it's running" : "Delete this evaluation and all its scores"}
                        >
                          DELETE
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            
            {/* Add Evaluation Button - Inside the evaluations box */}
            {!selectedJudgeConfig && !showNewForm && !isRunningJudge && (
              <button
                onClick={() => {
                  setShowNewForm(true);
                  setJudgeName('');
                  setJudgePrompt('');
                  setIsLLMConfigExpanded(false);
                }}
                disabled={!csvFileId}
                style={{
                  width: 'fit-content',
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'transparent',
                  color: csvFileId ? 'var(--accent-success)' : 'var(--text-tertiary)',
                  border: `1px solid ${csvFileId ? 'var(--accent-success)' : 'var(--border-primary)'}`,
                  borderRadius: '0',
                  cursor: csvFileId ? 'pointer' : 'not-allowed',
                  fontSize: '0.6875rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  transition: 'none',
                  textTransform: 'uppercase',
                  opacity: csvFileId ? 1 : 0.4,
                  marginTop: '0.375rem',
                  alignSelf: 'flex-start',
                }}
                onMouseEnter={(e) => {
                  if (csvFileId) {
                    e.currentTarget.style.outline = '2px solid var(--accent-success)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (csvFileId) {
                    e.currentTarget.style.outline = 'none';
                  }
                }}
              >
                + ADD EVALUATION
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Evaluation Name Input - Show when creating new or editing */}
      {(showNewForm || selectedJudgeConfig) && (
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
            Evaluation Name {showNewForm && '(required)'}:
          </label>
          <input
            type="text"
            value={judgeName}
            onChange={(e) => setJudgeName(e.target.value)}
            placeholder="E.G., QUALITY_SCORE, ACCURACY..."
            disabled={!showNewForm}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid var(--border-primary)',
              borderRadius: '0',
              fontSize: '0.8125rem',
              boxSizing: 'border-box',
              backgroundColor: !showNewForm ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
              color: !showNewForm ? 'var(--text-tertiary)' : 'var(--text-primary)',
              fontFamily: 'monospace',
              fontWeight: '600',
              transition: 'none',
            }}
            onFocus={(e) => {
              if (showNewForm) {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-primary)';
            }}
          />
        </div>
      )}

      {/* Columns */}
      {(selectedJudgeConfig || showNewForm) && columns.length > 0 && (
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AVAILABLE COLUMNS:
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.375rem',
          }}>
            {columns.map((col) => (
              <button
                key={col}
                onClick={() => insertVariable(col)}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  transition: 'none',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.outline = 'none';
                }}
              >
                {col}
              </button>
            ))}
            {/* Add Output column button */}
            <button
              onClick={() => insertVariable('Output')}
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: 'var(--text-primary)',
                fontWeight: '700',
                fontFamily: 'monospace',
                transition: 'none',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                e.currentTarget.style.outlineOffset = '-2px';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.outline = 'none';
              }}
              title="Insert Output column reference (optional - Output is automatically included)"
            >
              Output
            </button>
          </div>
        </div>
      )}

      {/* Judge Prompt Textarea - Always visible when config selected or creating new */}
      {(selectedJudgeConfig || showNewForm) && (
        <textarea
          ref={textareaRef}
          value={judgePrompt}
          onChange={handleChange}
          placeholder="ENTER YOUR EVALUATION CRITERIA...&#10;EXAMPLE: Score 0-5 based on accuracy and clarity.&#10;Reference other columns with {{column_name}} if needed."
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '0.75rem',
            border: '1px solid var(--border-primary)',
            borderRadius: '0',
            fontSize: '0.8125rem',
            fontFamily: 'monospace',
            lineHeight: '1.4',
            boxSizing: 'border-box',
            resize: 'vertical',
            outline: 'none',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontWeight: '500',
            transition: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-primary)';
          }}
        />
      )}



      {/* LLM Configuration Section - Collapsible - Only show when config selected or creating new */}
      {(selectedJudgeConfig || showNewForm) && (
        <div style={{
          borderRadius: '0',
          paddingRight: '-5px',
          backgroundColor: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}>
          <div
            onClick={() => setIsLLMConfigExpanded(!isLLMConfigExpanded)}
            style={{
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem',
              paddingLeft: '1rem',
              paddingRight: '1rem',
              backgroundColor: 'var(--bg-tertiary)',
              borderBottom: isLLMConfigExpanded ? '1px solid var(--border-primary)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.outline = '2px solid var(--accent-primary)';
              e.currentTarget.style.outlineOffset = '-2px';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              LLM CONFIGURATION
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700' }}>
              {isLLMConfigExpanded ? 'v' : '>'}
            </span>
          </div>
          
          {isLLMConfigExpanded && (
          <div style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1rem', paddingRight: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box' }}>
            {/* Model ID Input */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: '700',
                marginBottom: '0.375rem',
                color: 'var(--text-tertiary)',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                MODEL ID
              </label>
              <input
                type="text"
                value={localLLMConfig.model}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={isRunningJudge}
                placeholder="E.G., GPT-4, AZURE/GPT-4, GEMINI/GEMINI-PRO, VERTEX_AI/GEMINI-PRO"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  fontSize: '0.8125rem',
                  backgroundColor: isRunningJudge ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  boxSizing: 'border-box',
                  transition: 'none',
                }}
                onFocus={(e) => {
                  if (!isRunningJudge) {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                }}
              />
              <p style={{
                margin: '0.375rem 0 0 0',
                fontSize: '0.6875rem',
                color: 'var(--text-tertiary)',
                fontFamily: 'monospace',
              }}>
                ENTER ANY LITELLM-SUPPORTED MODEL ID. EXAMPLES: GPT-4, AZURE/YOUR-DEPLOYMENT, GEMINI/GEMINI-PRO
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
                  color: 'var(--text-secondary)',
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
                  disabled={isRunningJudge}
                  style={{
                    width: '90px',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0',
                    fontSize: '0.8125rem',
                    backgroundColor: isRunningJudge ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                    textAlign: 'center',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: '600',
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
                disabled={isRunningJudge}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '0',
                  background: 'var(--bg-tertiary)',
                  outline: 'none',
                  cursor: isRunningJudge ? 'not-allowed' : 'pointer',
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
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
                  color: 'var(--text-secondary)',
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
                  disabled={isRunningJudge}
                  style={{
                    width: '90px',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0',
                    fontSize: '0.8125rem',
                    backgroundColor: isRunningJudge ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                    textAlign: 'center',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: '600',
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
                disabled={isRunningJudge}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '0',
                  background: 'var(--bg-tertiary)',
                  outline: 'none',
                  cursor: isRunningJudge ? 'not-allowed' : 'pointer',
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
                marginTop: '0.375rem',
              }}>
                <span>1</span>
                <span>16384</span>
              </div>
            </div>

          </div>
        )}
        </div>
      )}

      {/* Save and Close Editor Buttons - Show when editing existing evaluation, at the bottom */}
      {selectedJudgeConfig && !showNewForm && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleSave}
            disabled={isSaving || !judgeName.trim() || !judgePrompt.trim()}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              backgroundColor: (judgeName.trim() && judgePrompt.trim()) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: 'white',
              border: 'none',
              borderRadius: '0',
              cursor: (isSaving || !judgeName.trim() || !judgePrompt.trim()) ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'monospace',
              opacity: (isSaving || !judgeName.trim() || !judgePrompt.trim()) ? 0.4 : 1,
              transition: 'none',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => {
              if (!isSaving && judgeName.trim() && judgePrompt.trim()) {
                e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.outlineOffset = '-2px';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving && judgeName.trim() && judgePrompt.trim()) {
                e.currentTarget.style.outline = 'none';
              }
            }}
          >
            {isSaving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '0',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'monospace',
              transition: 'none',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.outline = '2px solid var(--accent-primary)';
              e.currentTarget.style.outlineOffset = '-2px';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            CLOSE EDITOR
          </button>
        </div>
      )}

      {/* Save and Cancel Buttons - Only show when creating new, at the bottom */}
      {showNewForm && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleSave}
            disabled={isSaving || !judgeName.trim() || !judgePrompt.trim()}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              backgroundColor: (judgeName.trim() && judgePrompt.trim()) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
              color: 'white',
              border: 'none',
              borderRadius: '0',
              cursor: (isSaving || !judgeName.trim() || !judgePrompt.trim()) ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'monospace',
              opacity: (isSaving || !judgeName.trim() || !judgePrompt.trim()) ? 0.4 : 1,
              transition: 'none',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => {
              if (!isSaving && judgeName.trim() && judgePrompt.trim()) {
                e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                e.currentTarget.style.outlineOffset = '-2px';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving && judgeName.trim() && judgePrompt.trim()) {
                e.currentTarget.style.outline = 'none';
              }
            }}
          >
            {isSaving ? 'SAVING...' : 'SAVE EVALUATION'}
          </button>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '0',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'monospace',
              transition: 'none',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.outline = '2px solid var(--accent-primary)';
              e.currentTarget.style.outlineOffset = '-2px';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
          >
            CANCEL
          </button>
        </div>
      )}

      {/* Run All Evals and Clear All Buttons - Always at the bottom */}
      {judgeConfigs.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onRunJudgeForAllRows && (
            <button
              onClick={async () => {
                // Run all evaluations sequentially from top to bottom (oldest to newest)
                // Use the same sort order as the display
                const sortedConfigs = [...judgeConfigs].sort((a, b) => {
                  // Sort by created_at ascending (oldest first), then by name - so newest appear at bottom
                  if (a.created_at && b.created_at) {
                    const dateA = new Date(a.created_at).getTime();
                    const dateB = new Date(b.created_at).getTime();
                    if (dateA !== dateB) {
                      return dateA - dateB;
                    }
                  }
                  return a.name.localeCompare(b.name);
                });
                
                for (const config of sortedConfigs) {
                  if (onRunJudgeForAllRows) {
                    await onRunJudgeForAllRows(config.id, judgeConcurrency);
                  }
                }
              }}
              disabled={!csvFileId || isRunningJudge}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: (!csvFileId || isRunningJudge) ? 'var(--bg-tertiary)' : 'var(--accent-success)',
                color: (!csvFileId || isRunningJudge) ? 'var(--text-tertiary)' : '#000000',
                border: 'none',
                borderRadius: '0',
                cursor: (!csvFileId || isRunningJudge) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                transition: 'none',
                textTransform: 'uppercase',
                opacity: (!csvFileId || isRunningJudge) ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (csvFileId && !isRunningJudge) {
                  e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (csvFileId && !isRunningJudge) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              {isRunningJudge ? 'RUNNING...' : 'RUN ALL EVALS'}
            </button>
          )}
          {onClearJudgeForAllRows && (
            <button
              onClick={async () => {
                if (window.confirm(`Are you sure you want to clear ALL scores for ALL evaluations? This action cannot be undone.`)) {
                  // Clear all evaluations sequentially
                  const sortedConfigs = [...judgeConfigs].sort((a, b) => {
                    if (a.created_at && b.created_at) {
                      const dateA = new Date(a.created_at).getTime();
                      const dateB = new Date(b.created_at).getTime();
                      if (dateA !== dateB) {
                        return dateA - dateB;
                      }
                    }
                    return a.name.localeCompare(b.name);
                  });
                  
                  for (const config of sortedConfigs) {
                    if (onClearJudgeForAllRows) {
                      await onClearJudgeForAllRows(config.id);
                    }
                  }
                }
              }}
              disabled={!csvFileId || isRunningJudge}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: (!csvFileId || isRunningJudge) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                color: (!csvFileId || isRunningJudge) ? 'var(--text-tertiary)' : 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                cursor: (!csvFileId || isRunningJudge) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                transition: 'none',
                textTransform: 'uppercase',
                opacity: (!csvFileId || isRunningJudge) ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (csvFileId && !isRunningJudge) {
                  e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (csvFileId && !isRunningJudge) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              CLEAR ALL
            </button>
          )}
        </div>
      )}

      {/* Cancel Button - Show when running judge evaluations, right below RUN ALL EVALS */}
      {isRunningJudge && onCancelJudge && (
        <button
          onClick={() => {
            if (onCancelJudge) {
              onCancelJudge();
            }
          }}
          disabled={isCancellingJudge}
          style={{
            width: '100%',
            padding: '0.5rem 1rem',
            backgroundColor: isCancellingJudge ? 'var(--bg-tertiary)' : 'var(--accent-danger)',
            color: 'white',
            border: 'none',
            borderRadius: '0',
            cursor: isCancellingJudge ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem',
            fontWeight: '700',
            fontFamily: 'monospace',
            transition: 'none',
            opacity: isCancellingJudge ? 0.5 : 1,
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => {
            if (!isCancellingJudge) {
              e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
              e.currentTarget.style.outlineOffset = '-2px';
            }
          }}
          onMouseLeave={(e) => {
            if (!isCancellingJudge) {
              e.currentTarget.style.outline = 'none';
            }
          }}
        >
          {isCancellingJudge ? 'CANCELLING...' : 'CANCEL RUNNING'}
        </button>
      )}

      {/* Concurrency Configuration Section - Collapsible - At the very bottom */}
      <div style={{
        borderRadius: '0',
        paddingRight: '-5px',
        backgroundColor: 'var(--bg-elevated)',
        overflow: 'hidden',
      }}>
        <div
          onClick={() => setIsConcurrencyExpanded(!isConcurrencyExpanded)}
          style={{
            paddingTop: '0.5rem',
            paddingBottom: '0.5rem',
            paddingLeft: '1rem',
            paddingRight: '1rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderBottom: isConcurrencyExpanded ? '1px solid var(--border-primary)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            userSelect: 'none',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.outline = '2px solid var(--accent-primary)';
            e.currentTarget.style.outlineOffset = '-2px';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            CONCURRENCY
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700' }}>
            {isConcurrencyExpanded ? 'v' : '>'}
          </span>
        </div>
        
        {isConcurrencyExpanded && (
          <div style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1rem', paddingRight: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box' }}>
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
                  color: 'var(--text-secondary)',
                }}>
                  Concurrent Evaluations
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={judgeConcurrency}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= 50) {
                      handleJudgeConcurrencyChange(val);
                    }
                  }}
                  disabled={isRunningJudge}
                  style={{
                    width: '90px',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0',
                    fontSize: '0.8125rem',
                    backgroundColor: isRunningJudge ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                    textAlign: 'center',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: '600',
                  }}
                />
              </div>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={judgeConcurrency}
                onChange={(e) => handleJudgeConcurrencyChange(parseInt(e.target.value) || 10)}
                disabled={isRunningJudge}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '0',
                  background: 'var(--bg-tertiary)',
                  outline: 'none',
                  cursor: isRunningJudge ? 'not-allowed' : 'pointer',
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
                marginTop: '0.375rem',
              }}>
                <span>Sequential (1)</span>
                <span>Parallel (50)</span>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
