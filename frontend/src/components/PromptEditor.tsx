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
  onSave: (systemPrompt: string, userMessageColumn: string | null, createNewVersion: boolean, name?: string, commitMessage?: string) => Promise<void>;
  onVersionSelect: (versionId: number) => void;
  onDeletePrompt?: (promptId: number) => Promise<void>;
  onContentChange?: (systemPrompt: string, userMessageColumn: string | null) => void; // Callback to notify parent of content changes
  llmConfig: LLMConfig;
  onLLMConfigChange: (config: LLMConfig) => void;
  onRunAll?: () => Promise<void>;
  onClearAllOutputs?: () => Promise<void>;
  onCancel?: () => void;
  isRunning?: boolean;
  isRunningAll?: boolean;
  isCancelling?: boolean;
}

export default function PromptEditor({ prompt, groupedPrompts, columns, onSave, onVersionSelect, onDeletePrompt, onContentChange, llmConfig, onLLMConfigChange, onRunAll, onClearAllOutputs, onCancel, isRunning = false, isRunningAll = false, isCancelling = false }: PromptEditorProps) {
  const [systemPrompt, setSystemPrompt] = useState(prompt?.system_prompt || '');
  const [userMessageColumn, setUserMessageColumn] = useState<string | null>(prompt?.user_message_column || null);
  const [promptName, setPromptName] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedPromptName, setSelectedPromptName] = useState<string | null>(null);
  const [showNewPromptForm, setShowNewPromptForm] = useState(false);
  const [isVersioningExpanded, setIsVersioningExpanded] = useState(false);
  const [isLLMConfigExpanded, setIsLLMConfigExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localLLMConfig, setLocalLLMConfig] = useState<LLMConfig>(llmConfig);
  // Local string states for number inputs to allow empty during editing
  const [tempTemperature, setTempTemperature] = useState<string>('');
  const [tempMaxTokens, setTempMaxTokens] = useState<string>('');
  const [tempConcurrency, setTempConcurrency] = useState<string>('');

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
    // Don't overwrite fields if we're in "new prompt" mode - let user type fresh content
    if (showNewPromptForm) {
      return;
    }
    
    const newSystemPrompt = prompt?.system_prompt || '';
    const newUserMessageColumn = prompt?.user_message_column || null;
    setSystemPrompt(newSystemPrompt);
    setUserMessageColumn(newUserMessageColumn);
    // Notify parent of content changes when prompt changes
    if (onContentChange) {
      onContentChange(newSystemPrompt, newUserMessageColumn);
    }
    // Only reset prompt name if we're creating a new prompt (no prompt exists)
    if (!prompt) {
      setPromptName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, showNewPromptForm]); // Only depend on prompt and showNewPromptForm, not onContentChange to avoid resetting on every render

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
  const currentSystemPrompt = prompt?.system_prompt || '';
  const currentUserMessageColumn = prompt?.user_message_column || null;
  const hasPromptContentChanges = prompt && (systemPrompt !== currentSystemPrompt || userMessageColumn !== currentUserMessageColumn);
  
  // Check if LLM config has changed
  const hasLLMConfigChanges = prompt && (
    localLLMConfig.model !== (prompt.model || llmConfig.model) ||
    localLLMConfig.temperature !== (prompt.temperature ?? llmConfig.temperature) ||
    localLLMConfig.maxTokens !== (prompt.max_tokens ?? llmConfig.maxTokens) ||
    localLLMConfig.concurrency !== (prompt.concurrency ?? llmConfig.concurrency)
  );
  
  const hasUnsavedChanges = hasPromptContentChanges || hasLLMConfigChanges;

  // Get versions for selected prompt
  const selectedPromptVersions = selectedPromptName && groupedPrompts[selectedPromptName]
    ? groupedPrompts[selectedPromptName]
    : [];

  // Validate prompt template in real-time
  const validatePrompt = () => {
    if (!systemPrompt.trim()) {
      return { isValid: false, message: 'System prompt cannot be empty' };
    }

    // Extract all column names from system prompt template (optional - columns can be used but not required)
    const columnMatches = systemPrompt.match(/\{\{([^}]+)\}\}/g) || [];
    const columnNames = columnMatches.map(match => match.replace(/[{}]/g, '').trim());

    // Check if all referenced columns exist (if any are used)
    const missingColumns = columnNames.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      return { 
        isValid: false, 
        message: `Invalid columns in system prompt: ${missingColumns.join(', ')}. Available: ${columns.join(', ')}` 
      };
    }

    // User message column is required
    if (!userMessageColumn || userMessageColumn.trim() === '') {
      return { isValid: false, message: 'User message column must be selected' };
    }

    // Check if user message column exists
    if (!columns.includes(userMessageColumn)) {
      return { 
        isValid: false, 
        message: `User message column '${userMessageColumn}' not found. Available: ${columns.join(', ')}` 
      };
    }

    return { isValid: true, message: null };
  };

  const validation = validatePrompt();

  const handleSystemPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setSystemPrompt(newValue);
    // Notify parent of content changes
    if (onContentChange) {
      onContentChange(newValue, userMessageColumn);
    }
  };

  const handleUserMessageColumnChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value === '' ? null : e.target.value;
    setUserMessageColumn(newValue);
    // Notify parent of content changes
    if (onContentChange) {
      onContentChange(systemPrompt, newValue);
    }
  };

  const handleDiscardChanges = () => {
    if (!prompt) return;
    
    if (hasUnsavedChanges) {
      if (!window.confirm('Are you sure you want to discard all unsaved changes?')) {
        return;
      }
    }
    
    // Revert to saved prompt state
    const savedSystemPrompt = prompt.system_prompt || '';
    const savedUserMessageColumn = prompt.user_message_column || null;
    setSystemPrompt(savedSystemPrompt);
    setUserMessageColumn(savedUserMessageColumn);
    setCommitMessage('');
    
    // Notify parent of content changes
    if (onContentChange) {
      onContentChange(savedSystemPrompt, savedUserMessageColumn);
    }
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
      await onSave(systemPrompt, userMessageColumn, isCreatingNewPrompt ? false : createNewVersion, name, commitMsg);
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
    const newValue = systemPrompt.substring(0, start) + variable + systemPrompt.substring(end);
    
    setSystemPrompt(newValue);
    // Notify parent of content changes
    if (onContentChange) {
      onContentChange(newValue, userMessageColumn);
    }

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
        padding: '1rem 1.5rem',
        border: '1px solid var(--border-primary)',
        borderRadius: '0',
        backgroundColor: 'var(--bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SYSTEM PROMPT</h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          USE <code style={{ backgroundColor: 'var(--bg-tertiary)', padding: '2px 4px', borderRadius: '0', color: 'var(--accent-primary)', fontFamily: 'monospace', fontWeight: '700' }}>{'{{COLUMN_NAME}}'}</code> TO INSERT COLUMN VALUES (OPTIONAL)
        </p>
      </div>

      {columns.length > 0 && (
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
                disabled={isRunning}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  color: isRunning ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  transition: 'none',
                  textTransform: 'uppercase',
                  opacity: isRunning ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.outline = 'none';
                  }
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
        value={systemPrompt}
        onChange={handleSystemPromptChange}
        disabled={isRunning}
        placeholder="ENTER YOUR SYSTEM PROMPT HERE...&#10;EXAMPLE: You are a helpful assistant. Use the following context: {{CONTEXT}}"
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
          backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontWeight: '500',
          transition: 'none',
          cursor: isRunning ? 'not-allowed' : 'text',
          opacity: isRunning ? 0.6 : 1,
        }}
        onFocus={(e) => {
          if (!isRunning) {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-primary)';
        }}
      />

      {/* User Message Column Selector */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          USER MESSAGE COLUMN:
        </div>
        <select
          value={userMessageColumn || ''}
          onChange={handleUserMessageColumnChange}
          disabled={isRunning || columns.length === 0}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--border-primary)',
            borderRadius: '0',
            fontSize: '0.8125rem',
            backgroundColor: (isRunning || columns.length === 0) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontFamily: 'monospace',
            fontWeight: '600',
            cursor: (isRunning || columns.length === 0) ? 'not-allowed' : 'pointer',
            boxSizing: 'border-box',
            transition: 'none',
          }}
          onFocus={(e) => {
            if (!isRunning && columns.length > 0) {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-primary)';
          }}
        >
          <option value="">-- SELECT COLUMN --</option>
          {columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
      </div>

      {/* Save Button - Above Run All */}
      {(!prompt || showNewPromptForm) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Prompt Name Input - Only show when creating a new prompt */}
          {(showNewPromptForm || (!prompt && allPromptNames.length === 0)) && (
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                Prompt Name (required):
              </label>
              <input
                type="text"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                disabled={isRunning}
                placeholder="E.G., MAIN PROMPT, EXPERIMENT A..."
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  fontSize: '0.8125rem',
                  boxSizing: 'border-box',
                  backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  transition: 'none',
                  cursor: isRunning ? 'not-allowed' : 'text',
                  opacity: isRunning ? 0.6 : 1,
                }}
                onFocus={(e) => {
                  if (!isRunning) {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
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
                  padding: '0.5rem 1rem',
                  backgroundColor: 'transparent',
                  color: 'var(--accent-danger)',
                  border: '2px solid var(--accent-danger)',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  transition: 'none',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-danger)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--accent-danger)';
                }}
              >
                CANCEL
              </button>
            )}
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving || !validation.isValid || !promptName.trim() || isRunning}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: (validation.isValid && promptName.trim() && !isRunning) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: 'white',
                border: 'none',
                borderRadius: '0',
                cursor: (isSaving || !validation.isValid || !promptName.trim() || isRunning) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                opacity: (isSaving || !validation.isValid || !promptName.trim() || isRunning) ? 0.4 : 1,
                transition: 'none',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                if (!isSaving && validation.isValid && promptName.trim() && !isRunning) {
                  e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving && validation.isValid && promptName.trim() && !isRunning) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              {isSaving ? 'SAVING...' : 'SAVE PROMPT'}
            </button>
          </div>
        </div>
      )}

      {/* Warning and Error Messages */}
      {(!prompt || !validation.isValid) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {!validation.isValid && (
            <div style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--accent-danger)',
              borderRadius: '0',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'monospace',
              border: '1px solid var(--accent-danger)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textTransform: 'uppercase',
            }}>
              <span>ERROR: {validation.message || 'INVALID PROMPT TEMPLATE'}</span>
            </div>
          )}
          
          {(!prompt || !validation.isValid) && (
            <div style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--accent-warning)',
              borderRadius: '0',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'monospace',
              border: '1px solid var(--accent-warning)',
              textTransform: 'uppercase',
            }}>
              WARNING: SAVE A VALID PROMPT TEMPLATE BEFORE RUNNING
            </div>
          )}
        </div>
      )}

      {/* Run All / Clear All Buttons / Cancel Button - Only show when a prompt exists and not creating a new one */}
      {prompt && !showNewPromptForm && (
        <>
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
                padding: '0.5rem 1rem',
                backgroundColor: isCancelling ? 'var(--bg-tertiary)' : 'var(--accent-danger)',
                color: 'white',
                border: 'none',
                borderRadius: '0',
                cursor: isCancelling ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                transition: 'none',
                opacity: isCancelling ? 0.5 : 1,
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                if (!isCancelling) {
                  e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (!isCancelling) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              {isCancelling ? 'CANCELLING...' : 'CANCEL RUNNING'}
            </button>
          ) : (onRunAll || onClearAllOutputs) && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onRunAll && (
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
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                color: (isRunning || !validation.isValid || !prompt) ? 'var(--text-tertiary)' : 'var(--accent-success)',
                border: `1px solid ${(isRunning || !validation.isValid || !prompt) ? 'var(--border-primary)' : 'var(--accent-success)'}`,
                borderRadius: '0',
                cursor: (isRunning || !validation.isValid || !prompt) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                transition: 'none',
                opacity: (isRunning || !validation.isValid || !prompt) ? 0.4 : 1,
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                if (!isRunning && validation.isValid && prompt) {
                  e.currentTarget.style.outline = '2px solid var(--accent-success)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRunning && validation.isValid && prompt) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              {isRunning ? 'RUNNING...' : 'RUN ALL ROWS'}
            </button>
          )}
          {onClearAllOutputs && (
            <button
              onClick={async () => {
                if (window.confirm(`Are you sure you want to clear ALL outputs for ALL rows? This action cannot be undone.`)) {
                  if (onClearAllOutputs) {
                    try {
                      await onClearAllOutputs();
                    } catch (err) {
                      // Error handling is done in parent component
                    }
                  }
                }
              }}
              disabled={isRunning}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                color: isRunning ? 'var(--text-tertiary)' : 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                transition: 'none',
                textTransform: 'uppercase',
                opacity: isRunning ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isRunning) {
                  e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRunning) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              CLEAR ALL
            </button>
          )}
        </div>
          )}
        </>
      )}

      {/* LLM Configuration Section - Collapsible */}
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
                disabled={isRunning}
                placeholder="E.G., GPT-4, AZURE/GPT-4, GEMINI/GEMINI-PRO, VERTEX_AI/GEMINI-PRO"
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  fontSize: '0.8125rem',
                  backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  boxSizing: 'border-box',
                  transition: 'none',
                }}
                onFocus={(e) => {
                  if (!isRunning) {
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
                  value={tempTemperature !== '' ? tempTemperature : localLLMConfig.temperature}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTempTemperature(val);
                    const numVal = parseFloat(val);
                    if (val !== '' && !isNaN(numVal) && numVal >= 0 && numVal <= 1) {
                      handleTemperatureChange(numVal);
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value === '' ? localLLMConfig.temperature.toString() : e.target.value;
                    const numVal = parseFloat(val);
                    if (isNaN(numVal) || numVal < 0 || numVal > 1) {
                      setTempTemperature('');
                    } else {
                      setTempTemperature('');
                      handleTemperatureChange(numVal);
                    }
                  }}
                  onFocus={() => setTempTemperature(localLLMConfig.temperature.toString())}
                  disabled={isRunning}
                  style={{
                    width: '90px',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0',
                    fontSize: '0.8125rem',
                    backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
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
                disabled={isRunning}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '0',
                  background: 'var(--bg-tertiary)',
                  outline: 'none',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
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
                  value={tempMaxTokens !== '' ? tempMaxTokens : localLLMConfig.maxTokens}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTempMaxTokens(val);
                    const numVal = parseInt(val);
                    if (val !== '' && !isNaN(numVal) && numVal >= 1 && numVal <= 16384) {
                      handleMaxTokensChange(numVal);
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value === '' ? localLLMConfig.maxTokens.toString() : e.target.value;
                    const numVal = parseInt(val);
                    if (isNaN(numVal) || numVal < 1 || numVal > 16384) {
                      setTempMaxTokens('');
                    } else {
                      setTempMaxTokens('');
                      handleMaxTokensChange(numVal);
                    }
                  }}
                  onFocus={() => setTempMaxTokens(localLLMConfig.maxTokens.toString())}
                  disabled={isRunning}
                  style={{
                    width: '90px',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0',
                    fontSize: '0.8125rem',
                    backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
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
                disabled={isRunning}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '0',
                  background: 'var(--bg-tertiary)',
                  outline: 'none',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
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
                  color: 'var(--text-secondary)',
                }}>
                  Concurrency
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={tempConcurrency !== '' ? tempConcurrency : localLLMConfig.concurrency}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTempConcurrency(val);
                    const numVal = parseInt(val);
                    if (val !== '' && !isNaN(numVal) && numVal >= 1 && numVal <= 50) {
                      handleConcurrencyChange(numVal);
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value === '' ? localLLMConfig.concurrency.toString() : e.target.value;
                    const numVal = parseInt(val);
                    if (isNaN(numVal) || numVal < 1 || numVal > 50) {
                      setTempConcurrency('');
                    } else {
                      setTempConcurrency('');
                      handleConcurrencyChange(numVal);
                    }
                  }}
                  onFocus={() => setTempConcurrency(localLLMConfig.concurrency.toString())}
                  disabled={isRunning}
                  style={{
                    width: '90px',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '0',
                    fontSize: '0.8125rem',
                    backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
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
                value={localLLMConfig.concurrency}
                onChange={(e) => handleConcurrencyChange(parseInt(e.target.value) || 10)}
                disabled={isRunning}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '0',
                  background: 'var(--bg-tertiary)',
                  outline: 'none',
                  cursor: isRunning ? 'not-allowed' : 'pointer',
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

      {/* Prompt Versioning Section - Collapsible (Hidden when creating new prompt) */}
      {!showNewPromptForm && (
        <div style={{
          backgroundColor: 'var(--bg-elevated)',
          overflow: 'hidden',
        }}>
        <div
          onClick={() => setIsVersioningExpanded(!isVersioningExpanded)}
          style={{
            paddingTop: '0.5rem',
            paddingBottom: '0.5rem',
            paddingLeft: '1rem',
            paddingRight: '1rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderBottom: isVersioningExpanded ? '1px solid var(--border-primary)' : 'none',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PROMPT VERSIONING
            </div>
            {hasUnsavedChanges && (
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--accent-warning)', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                (UNSAVED)
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '700' }}>
            {isVersioningExpanded ? 'v' : '>'}
          </span>
        </div>
        
        {isVersioningExpanded && (
          <div style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1rem', paddingRight: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box' }}>
            {/* Prompt Selector */}
            {allPromptNames.length > 0 && (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-tertiary)', marginRight: '0.25rem', flexShrink: 0, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    PROMPT:
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
                    disabled={isRunning}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '0',
                      fontSize: '0.8125rem',
                      backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontWeight: '600',
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                      minWidth: '150px',
                      opacity: isRunning ? 0.6 : 1,
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
                      // Clear the editor fields to make it clear we're creating a new prompt
                      setSystemPrompt('');
                      setUserMessageColumn(null);
                      setShowNewPromptForm(true);
                      setSelectedPromptName(null);
                      setPromptName('');
                      setCommitMessage('');
                      // Notify parent that content has changed
                      if (onContentChange) {
                        onContentChange('', null);
                      }
                    }}
                    disabled={isRunning}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--accent-success)',
                      color: isRunning ? 'var(--text-tertiary)' : '#000000',
                      border: 'none',
                      borderRadius: '0',
                      cursor: isRunning ? 'not-allowed' : 'pointer',
                      fontSize: '1rem',
                      fontWeight: '700',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      minWidth: '36px',
                      transition: 'none',
                      opacity: isRunning ? 0.6 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isRunning) {
                        e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isRunning) {
                        e.currentTarget.style.outline = 'none';
                      }
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
                      disabled={isRunning}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--accent-danger)',
                        color: isRunning ? 'var(--text-tertiary)' : 'white',
                        border: 'none',
                        borderRadius: '0',
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        minWidth: '36px',
                        transition: 'none',
                        opacity: isRunning ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isRunning) {
                          e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                          e.currentTarget.style.outlineOffset = '-2px';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isRunning) {
                          e.currentTarget.style.outline = 'none';
                        }
                      }}
                      title="Delete this prompt and all its versions"
                    >
                      X
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Versions List - Show only versions for selected prompt */}
            {selectedPromptName && selectedPromptVersions.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  VERSIONS:
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
                  {selectedPromptVersions.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: prompt?.id === v.id ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                        border: `1px solid ${prompt?.id === v.id ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                        borderRadius: '0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                        transition: 'none',
                        opacity: isRunning ? 0.6 : 1,
                      }}
                      onClick={(e) => {
                        if (isRunning) return;
                        // Clear outline on click
                        e.currentTarget.style.outline = 'none';
                        // If there are unsaved changes, warn the user
                        if (hasUnsavedChanges && prompt?.id !== v.id) {
                          if (!window.confirm('You have unsaved changes. Switching versions will discard them. Continue?')) {
                            return;
                          }
                        }
                        onVersionSelect(v.id);
                      }}
                      onMouseEnter={(e) => {
                        if (prompt?.id !== v.id && !isRunning) {
                          e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                          e.currentTarget.style.outlineOffset = '-2px';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.outline = 'none';
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: prompt?.id === v.id ? '700' : '600',
                          color: prompt?.id === v.id ? 'white' : 'var(--text-primary)',
                          fontSize: '0.8125rem',
                          fontFamily: 'monospace',
                        }}>
                          V{v.version}
                        </div>
                        {v.commit_message && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: prompt?.id === v.id ? 'rgba(255,255,255,0.9)' : 'var(--text-tertiary)',
                            marginTop: '0.25rem',
                            fontStyle: 'italic',
                          }}>
                            {v.commit_message}
                          </div>
                        )}
                        {v.created_at && (
                          <div style={{
                            fontSize: '0.7rem',
                            color: prompt?.id === v.id ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)',
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
                          disabled={isRunning}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: isRunning ? 'var(--bg-tertiary)' : (prompt?.id === v.id ? 'rgba(255,255,255,0.2)' : 'transparent'),
                            color: isRunning ? 'var(--text-tertiary)' : (prompt?.id === v.id ? 'white' : 'var(--accent-danger)'),
                            border: `1px solid ${isRunning ? 'var(--border-primary)' : (prompt?.id === v.id ? 'rgba(255,255,255,0.3)' : 'var(--accent-danger)')}`,
                            borderRadius: '0',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            fontSize: '0.6875rem',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            opacity: isRunning ? 0.4 : 0.8,
                            transition: 'none',
                            textTransform: 'uppercase',
                          }}
                          onMouseEnter={(e) => {
                            if (!isRunning) {
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.outline = prompt?.id === v.id 
                                ? '2px solid rgba(255, 255, 255, 0.8)' 
                                : '2px solid var(--accent-danger)';
                              e.currentTarget.style.outlineOffset = '-2px';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isRunning) {
                              e.currentTarget.style.opacity = '0.8';
                              e.currentTarget.style.outline = 'none';
                            }
                          }}
                          title="Delete this version"
                        >
                          DELETE
                        </button>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            )}

            {/* Commit Message Input and Button - Only show when prompt exists */}
            {prompt && (
              <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.375rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    COMMIT MESSAGE:
                  </label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    disabled={isRunning}
                    placeholder="E.G., FIXED TYPO, IMPROVED CLARITY..."
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '0',
                      fontSize: '0.8125rem',
                      boxSizing: 'border-box',
                      marginBottom: '0.5rem',
                      backgroundColor: isRunning ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontWeight: '600',
                      transition: 'none',
                      cursor: isRunning ? 'not-allowed' : 'text',
                      opacity: isRunning ? 0.6 : 1,
                    }}
                    onFocus={(e) => {
                      if (!isRunning) {
                        e.currentTarget.style.borderColor = 'var(--accent-primary)';
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-primary)';
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleDiscardChanges}
                    disabled={isSaving || !hasUnsavedChanges || isRunning}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: (hasUnsavedChanges && !isRunning) ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                      color: (hasUnsavedChanges && !isRunning) ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '0',
                      cursor: (isSaving || !hasUnsavedChanges || isRunning) ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      fontFamily: 'monospace',
                      opacity: (isSaving || !hasUnsavedChanges || isRunning) ? 0.4 : 1,
                      transition: 'none',
                      textTransform: 'uppercase',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSaving && hasUnsavedChanges && !isRunning) {
                        e.currentTarget.style.outline = '2px solid var(--accent-danger)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSaving && hasUnsavedChanges && !isRunning) {
                        e.currentTarget.style.outline = 'none';
                      }
                    }}
                  >
                    DISCARD CHANGES
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={isSaving || !validation.isValid || isRunning}
                    style={{
                      flex: 1,
                      padding: '0.5rem 1rem',
                      backgroundColor: (validation.isValid && !isRunning) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0',
                      cursor: (isSaving || !validation.isValid || isRunning) ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      fontFamily: 'monospace',
                      opacity: (isSaving || !validation.isValid || isRunning) ? 0.4 : 1,
                      transition: 'none',
                      textTransform: 'uppercase',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSaving && validation.isValid && !isRunning) {
                        e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSaving && validation.isValid && !isRunning) {
                        e.currentTarget.style.outline = 'none';
                      }
                    }}
                  >
                    {isSaving ? 'COMMITTING...' : 'COMMIT CHANGES'}
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
        </div>
      )}
    </div>
    </>
  );
}

