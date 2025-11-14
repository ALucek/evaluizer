import { useState, useEffect } from 'react';
import { FunctionEvalConfig, listFunctionEvaluations, FunctionEvaluationInfo } from '../services/api';

interface FunctionEvaluationsPanelProps {
  csvFileId: number | null;
  functionEvalConfigs: FunctionEvalConfig[];
  onConfigsChange: (configs: FunctionEvalConfig[]) => void;
  onCreateFunctionEvalConfig?: (functionName: string, config?: Record<string, any>) => Promise<FunctionEvalConfig>;
  onUpdateFunctionEvalConfig?: (id: number, partial: { name?: string; config?: Record<string, any> }) => Promise<void>;
  onDeleteFunctionEvalConfig?: (id: number) => Promise<void>;
  onRunFunctionEvalForAllRows?: (configId: number) => Promise<void>;
  onClearFunctionEvalForAllRows?: (configId: number) => Promise<void>;
}

export default function FunctionEvaluationsPanel({
  csvFileId,
  functionEvalConfigs,
  onConfigsChange,
  onCreateFunctionEvalConfig,
  onUpdateFunctionEvalConfig,
  onDeleteFunctionEvalConfig,
  onRunFunctionEvalForAllRows,
  onClearFunctionEvalForAllRows,
}: FunctionEvaluationsPanelProps) {
  // Phase 2: Basic implementation complete
  // Phase 3+ Future Enhancements (not implemented yet):
  // - Advanced config editing UI: structured config editing (per-plugin config schema) instead of raw JSON
  // - Per-evaluation tooltips/descriptions surfaced in the table
  // - Robust concurrency controls and progress indicators for "Run All" across large datasets
  // - Bulk selection of multiple function evaluations to run in sequence
  // - Collapsible/accordion-style sections for config editing (similar to JudgeEvaluationsPanel)
  // - Inline result details (hover or expand to see details JSON)
  // - Caching/computing function evaluations only when underlying row or output changes
  const [availableFunctions, setAvailableFunctions] = useState<FunctionEvaluationInfo[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedFunctionName, setSelectedFunctionName] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load available function evaluations
    listFunctionEvaluations()
      .then(setAvailableFunctions)
      .catch(err => console.error('Failed to load function evaluations:', err));
  }, []);

  const handleCreate = async () => {
    if (!selectedFunctionName || !csvFileId || !onCreateFunctionEvalConfig) return;

    setIsSaving(true);
    try {
      await onCreateFunctionEvalConfig(selectedFunctionName);
      setShowNewForm(false);
      setSelectedFunctionName('');
    } catch (err) {
      console.error('Failed to create function eval config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (configId: number) => {
    if (!onDeleteFunctionEvalConfig) return;
    if (window.confirm(`Are you sure you want to delete this function evaluation? This will also delete all its results.`)) {
      try {
        await onDeleteFunctionEvalConfig(configId);
      } catch (err) {
        console.error('Failed to delete function eval config:', err);
      }
    }
  };

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
          FUNCTION EVALUATIONS
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          CREATE FUNCTION-BASED EVALUATIONS TO SCORE OUTPUTS USING DETERMINISTIC FUNCTIONS.
        </p>
      </div>

      {/* Evaluations List */}
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
            {[...functionEvalConfigs].sort((a, b) => {
              if (a.created_at && b.created_at) {
                const dateA = new Date(a.created_at).getTime();
                const dateB = new Date(b.created_at).getTime();
                if (dateA !== dateB) {
                  return dateA - dateB;
                }
              }
              return a.name.localeCompare(b.name);
            }).map((config) => {
              const functionInfo = availableFunctions.find(f => f.name === config.function_name);
              return (
              <div
                key={config.id}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: '600',
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
                    {functionInfo?.description && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-tertiary)',
                      }}>
                        {functionInfo.description}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'stretch' }}>
                  {onRunFunctionEvalForAllRows && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunFunctionEvalForAllRows(config.id);
                      }}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'var(--accent-success)',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '0',
                        cursor: 'pointer',
                        fontSize: '0.6875rem',
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        transition: 'none',
                        textTransform: 'uppercase',
                        width: '100%',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.outline = 'none';
                      }}
                      title="Run this evaluation for all rows"
                    >
                      RUN ALL
                    </button>
                  )}
                  {onClearFunctionEvalForAllRows && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Are you sure you want to clear all scores for "${config.name}"?`)) {
                          onClearFunctionEvalForAllRows(config.id);
                        }
                      }}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0',
                        cursor: 'pointer',
                        fontSize: '0.6875rem',
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        transition: 'none',
                        textTransform: 'uppercase',
                        width: '100%',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.outline = 'none';
                      }}
                      title="Clear all scores for this evaluation"
                    >
                      CLEAR
                    </button>
                  )}
                  {onDeleteFunctionEvalConfig && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(config.id);
                      }}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: 'transparent',
                        color: 'var(--accent-danger)',
                        border: '1px solid var(--accent-danger)',
                        borderRadius: '0',
                        cursor: 'pointer',
                        fontSize: '0.6875rem',
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        transition: 'none',
                        textTransform: 'uppercase',
                        width: '100%',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.outline = '2px solid var(--accent-danger)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.outline = 'none';
                      }}
                      title="Delete this evaluation and all its scores"
                    >
                      DELETE
                    </button>
                  )}
                </div>
              </div>
            );
            })}

            {/* Add Evaluation Button */}
            {!showNewForm && (
              <button
                onClick={() => {
                  setShowNewForm(true);
                  setSelectedFunctionName('');
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

      {/* New Evaluation Form */}
      {showNewForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Function Evaluation (required):
            </label>
            <select
              value={selectedFunctionName}
              onChange={(e) => setSelectedFunctionName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                fontSize: '0.8125rem',
                boxSizing: 'border-box',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontFamily: 'monospace',
                fontWeight: '600',
                transition: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
              }}
            >
              <option value="">Select a function...</option>
              {availableFunctions.map((func) => (
                <option key={func.name} value={func.name}>
                  {func.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleCreate}
              disabled={isSaving || !selectedFunctionName}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: selectedFunctionName ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: 'white',
                border: 'none',
                borderRadius: '0',
                cursor: (isSaving || !selectedFunctionName) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                opacity: (isSaving || !selectedFunctionName) ? 0.4 : 1,
                transition: 'none',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                if (!isSaving && selectedFunctionName) {
                  e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving && selectedFunctionName) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              {isSaving ? 'SAVING...' : 'SAVE EVALUATION'}
            </button>
            <button
              onClick={() => {
                setShowNewForm(false);
                setSelectedFunctionName('');
              }}
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
        </div>
      )}
    </div>
  );
}
