import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { JudgeConfig, FunctionEvalConfig, listFunctionEvaluations, FunctionEvaluationInfo } from '../services/api';
import { LLMConfig } from './PromptEditor';

interface CombinedEvaluationsPanelProps {
  csvFileId: number | null;
  judgeConfigs: JudgeConfig[];
  functionEvalConfigs: FunctionEvalConfig[];
  onJudgeConfigsChange: (configs: JudgeConfig[]) => void;
  onFunctionEvalConfigsChange: (configs: FunctionEvalConfig[]) => void;
  columns: string[];
  // Judge callbacks
  onRunJudgeForAllRows?: (configId: number, concurrency?: number) => Promise<void>;
  onClearJudgeForAllRows?: (configId: number) => Promise<void>;
  onCreateJudgeConfig?: (name: string, prompt: string, llmConfig: LLMConfig) => Promise<JudgeConfig>;
  onUpdateJudgeConfig?: (id: number, partial: { name?: string; prompt?: string; model?: string; temperature?: number; maxTokens?: number }) => Promise<void>;
  onDeleteJudgeConfig?: (id: number) => Promise<void>;
  isRunningJudge?: boolean;
  runningJudgeConfigId?: number | null;
  onCancelJudge?: () => void;
  isCancellingJudge?: boolean;
  // Function callbacks
  onCreateFunctionEvalConfig?: (functionName: string, config?: Record<string, any>) => Promise<FunctionEvalConfig>;
  onUpdateFunctionEvalConfig?: (id: number, partial: { name?: string; config?: Record<string, any> }) => Promise<void>;
  onDeleteFunctionEvalConfig?: (id: number) => Promise<void>;
  onRunFunctionEvalForAllRows?: (configId: number, concurrency?: number) => Promise<void>;
  onClearFunctionEvalForAllRows?: (configId: number) => Promise<void>;
}

type SelectedEvaluation = 
  | { type: 'judge'; id: number }
  | { type: 'function'; id: number }
  | null;

export default function CombinedEvaluationsPanel({
  csvFileId,
  judgeConfigs,
  functionEvalConfigs,
  onJudgeConfigsChange: _onJudgeConfigsChange,
  onFunctionEvalConfigsChange: _onFunctionEvalConfigsChange,
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
  onCreateFunctionEvalConfig,
  onUpdateFunctionEvalConfig: _onUpdateFunctionEvalConfig,
  onDeleteFunctionEvalConfig,
  onRunFunctionEvalForAllRows,
  onClearFunctionEvalForAllRows,
}: CombinedEvaluationsPanelProps) {
  // Judge state
  const [judgePrompt, setJudgePrompt] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [showNewJudgeForm, setShowNewJudgeForm] = useState(false);
  const [isLLMConfigExpanded, setIsLLMConfigExpanded] = useState(false);
  const [isConcurrencyExpanded, setIsConcurrencyExpanded] = useState(false);
  const [localLLMConfig, setLocalLLMConfig] = useState<LLMConfig>({
    model: 'gpt-5-mini',
    temperature: 1,
    maxTokens: 500,
    concurrency: 10,
  });
  const [judgeConcurrency, setJudgeConcurrency] = useState<number>(10);
  const judgeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const judgeEditorRef = useRef<HTMLDivElement>(null);
  const functionEditorRef = useRef<HTMLDivElement>(null);
  const [isSavingJudge, setIsSavingJudge] = useState(false);
  const judgeAutoSaveTimeoutRef = useRef<number | null>(null);
  const previousJudgeConfigIdRef = useRef<number | null>(null);
  const previousShowNewJudgeFormRef = useRef<boolean>(false);
  // Local string states for number inputs to allow empty during editing
  const [tempTemperature, setTempTemperature] = useState<string>('');
  const [tempMaxTokens, setTempMaxTokens] = useState<string>('');
  const [tempConcurrency, setTempConcurrency] = useState<string>('');

  // Function state
  const [availableFunctions, setAvailableFunctions] = useState<FunctionEvaluationInfo[]>([]);
  const [showNewFunctionForm, setShowNewFunctionForm] = useState(false);
  const [selectedFunctionName, setSelectedFunctionName] = useState<string>('');
  const [isSavingFunction, setIsSavingFunction] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Combined selection state
  const [selectedEvaluation, setSelectedEvaluation] = useState<SelectedEvaluation>(null);

  // Get selected configs
  const selectedJudgeConfig = selectedEvaluation?.type === 'judge' 
    ? judgeConfigs.find(c => c.id === selectedEvaluation.id) 
    : null;

  // Load available functions
  useEffect(() => {
    const loadAvailableFunctions = async () => {
      try {
        const functions = await listFunctionEvaluations();
        setAvailableFunctions(functions);
      } catch (err) {
        console.error('Failed to load function evaluations:', err);
      }
    };
    loadAvailableFunctions();
  }, []);

  // Filter out already selected function evaluations
  const availableFunctionsToShow = useMemo(() => {
    const selectedFunctionNames = new Set(functionEvalConfigs.map(config => config.function_name));
    return availableFunctions.filter(func => !selectedFunctionNames.has(func.name));
  }, [availableFunctions, functionEvalConfigs]);

  // Load selected judge config when selection changes
  useEffect(() => {
    const currentConfigId = selectedJudgeConfig?.id ?? null;
    const previousConfigId = previousJudgeConfigIdRef.current;
    const previousShowNewForm = previousShowNewJudgeFormRef.current;
    
    const configIdChanged = currentConfigId !== previousConfigId;
    const showNewFormChanged = showNewJudgeForm !== previousShowNewForm;
    
    if (configIdChanged || showNewFormChanged) {
      if (selectedJudgeConfig && !showNewJudgeForm) {
        setJudgePrompt(selectedJudgeConfig.prompt);
        setJudgeName(selectedJudgeConfig.name);
        setLocalLLMConfig({
          model: selectedJudgeConfig.model,
          temperature: selectedJudgeConfig.temperature,
          maxTokens: selectedJudgeConfig.max_tokens,
          concurrency: 10,
        });
      } else if (showNewJudgeForm) {
        setJudgePrompt('');
        setJudgeName('');
        setLocalLLMConfig({
          model: 'gpt-5-mini',
          temperature: 1,
          maxTokens: 500,
          concurrency: 10,
        });
      }
      previousJudgeConfigIdRef.current = currentConfigId;
      previousShowNewJudgeFormRef.current = showNewJudgeForm;
    }
  }, [selectedJudgeConfig?.id, showNewJudgeForm]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (judgeAutoSaveTimeoutRef.current) {
        clearTimeout(judgeAutoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to judge editor when form is shown
  useEffect(() => {
    if (showNewJudgeForm && judgeEditorRef.current) {
      setTimeout(() => {
        judgeEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showNewJudgeForm]);

  // Auto-scroll to function editor when form is shown
  useEffect(() => {
    if (showNewFunctionForm && functionEditorRef.current) {
      setTimeout(() => {
        functionEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showNewFunctionForm]);

  // Judge handlers
  const handleModelChange = (model: string) => {
    const newConfig = { ...localLLMConfig, model };
    setLocalLLMConfig(newConfig);
    if (judgeAutoSaveTimeoutRef.current) {
      clearTimeout(judgeAutoSaveTimeoutRef.current);
    }
    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      judgeAutoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt,
            model: newConfig.model,
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
    if (judgeAutoSaveTimeoutRef.current) {
      clearTimeout(judgeAutoSaveTimeoutRef.current);
    }
    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      judgeAutoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt,
            model: newConfig.model,
            temperature: newConfig.temperature,
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
    if (judgeAutoSaveTimeoutRef.current) {
      clearTimeout(judgeAutoSaveTimeoutRef.current);
    }
    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      judgeAutoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt,
            model: newConfig.model,
            temperature: newConfig.temperature,
            maxTokens: newConfig.maxTokens,
          });
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 1500);
    }
  };

  const debouncedAutoSave = useCallback(() => {
    if (judgeAutoSaveTimeoutRef.current) {
      clearTimeout(judgeAutoSaveTimeoutRef.current);
    }
    if (selectedJudgeConfig && onUpdateJudgeConfig) {
      judgeAutoSaveTimeoutRef.current = setTimeout(async () => {
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
    const textarea = judgeTextareaRef.current;
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

  const handleJudgeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setJudgePrompt(newValue);
    debouncedAutoSave();
  };

  const handleSaveJudge = async () => {
    if (!judgeName.trim() || !judgePrompt.trim() || !csvFileId) return;
    setIsSavingJudge(true);
    try {
      if (selectedJudgeConfig) {
        if (onUpdateJudgeConfig) {
          await onUpdateJudgeConfig(selectedJudgeConfig.id, {
            name: judgeName.trim(),
            prompt: judgePrompt.trim(),
            model: localLLMConfig.model,
            temperature: localLLMConfig.temperature,
            maxTokens: localLLMConfig.maxTokens,
          });
        }
        setSelectedEvaluation(null);
        setShowNewJudgeForm(false);
        setIsLLMConfigExpanded(false);
      } else if (onCreateJudgeConfig) {
        await onCreateJudgeConfig(judgeName.trim(), judgePrompt.trim(), localLLMConfig);
        setShowNewJudgeForm(false);
        setJudgeName('');
        setJudgePrompt('');
        setIsLLMConfigExpanded(false);
      }
    } catch (err) {
      console.error('Failed to save judge config:', err);
    } finally {
      setIsSavingJudge(false);
    }
  };

  const handleCancelJudge = () => {
    setShowNewJudgeForm(false);
    setJudgeName('');
    setJudgePrompt('');
    setIsLLMConfigExpanded(false);
    setSelectedEvaluation(null);
  };

  // Function handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const functions = await listFunctionEvaluations();
      setAvailableFunctions(functions);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateFunction = async () => {
    if (!selectedFunctionName || !csvFileId || !onCreateFunctionEvalConfig) return;
    setIsSavingFunction(true);
    try {
      await onCreateFunctionEvalConfig(selectedFunctionName);
      setShowNewFunctionForm(false);
      setSelectedFunctionName('');
    } catch (err) {
      console.error('Failed to create function eval config:', err);
    } finally {
      setIsSavingFunction(false);
    }
  };

  const handleDeleteFunction = async (configId: number) => {
    if (!onDeleteFunctionEvalConfig) return;
    if (window.confirm(`Are you sure you want to delete this function evaluation? This will also delete all its results.`)) {
      try {
        await onDeleteFunctionEvalConfig(configId);
        if (selectedEvaluation?.type === 'function' && selectedEvaluation.id === configId) {
          setSelectedEvaluation(null);
        }
      } catch (err) {
        console.error('Failed to delete function eval config:', err);
      }
    }
  };

  // Combined list of all evaluations
  type CombinedEvaluation = 
    | { type: 'judge'; config: JudgeConfig }
    | { type: 'function'; config: FunctionEvalConfig };

  const allEvaluations: CombinedEvaluation[] = useMemo(() => {
    const judges: CombinedEvaluation[] = judgeConfigs.map(c => ({ type: 'judge' as const, config: c }));
    const functions: CombinedEvaluation[] = functionEvalConfigs.map(c => ({ type: 'function' as const, config: c }));
    return [...judges, ...functions].sort((a, b) => {
      const dateA = a.config.created_at ? new Date(a.config.created_at).getTime() : 0;
      const dateB = b.config.created_at ? new Date(b.config.created_at).getTime() : 0;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return a.config.name.localeCompare(b.config.name);
    });
  }, [judgeConfigs, functionEvalConfigs]);

  const handleEvaluationClick = (evaluation: CombinedEvaluation) => {
    if (selectedEvaluation?.type === evaluation.type && selectedEvaluation.id === evaluation.config.id) {
      // Toggle: deselect if already selected
      setSelectedEvaluation(null);
      setShowNewJudgeForm(false);
      setShowNewFunctionForm(false);
      setIsLLMConfigExpanded(false);
    } else {
      // Select this evaluation
      setSelectedEvaluation({ type: evaluation.type, id: evaluation.config.id });
      setShowNewJudgeForm(false);
      setShowNewFunctionForm(false);
      setIsLLMConfigExpanded(false);
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
          EVALUATIONS
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          CREATE AND MANAGE LLM-AS-A-JUDGE AND FUNCTION-BASED EVALUATIONS
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
            {allEvaluations.map((evaluation) => {
              const isSelected = selectedEvaluation?.type === evaluation.type && selectedEvaluation.id === evaluation.config.id;
              const isJudge = evaluation.type === 'judge';
              const isFunction = evaluation.type === 'function';
              const judgeConfig = isJudge ? evaluation.config : null;
              const functionConfig = isFunction ? evaluation.config : null;
              const functionInfo = isFunction ? availableFunctions.find(f => f.name === functionConfig!.function_name) : null;

              return (
                <div
                  key={`${evaluation.type}-${evaluation.config.id}`}
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
                  onClick={() => handleEvaluationClick(evaluation)}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                      e.currentTarget.style.outlineOffset = '-2px';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.outline = 'none';
                    }
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                    }}>
                      <div style={{
                        fontWeight: isSelected ? '700' : '600',
                        color: 'var(--text-primary)',
                        fontSize: '0.8125rem',
                        fontFamily: 'monospace',
                      }}>
                        {evaluation.config.name}
                      </div>
                      <div style={{
                        padding: '0.125rem 0.375rem',
                        backgroundColor: isJudge ? 'var(--accent-primary)' : 'var(--accent-success)',
                        color: '#000000',
                        fontSize: '0.625rem',
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        borderRadius: '0',
                      }}>
                        {isJudge ? 'LLM JUDGE' : 'FUNCTION'}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}>
                      {isJudge && judgeConfig && (
                        <>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            {judgeConfig.model}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            Temp: {judgeConfig.temperature}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            Max Tokens: {judgeConfig.max_tokens}
                          </div>
                        </>
                      )}
                      {isFunction && functionInfo?.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          {functionInfo.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'stretch' }}>
                    {isJudge && onRunJudgeForAllRows && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRunJudgeForAllRows && judgeConfig) {
                            onRunJudgeForAllRows(judgeConfig.id, judgeConcurrency);
                          }
                        }}
                        disabled={isRunningJudge && runningJudgeConfigId === judgeConfig?.id}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'transparent',
                          color: (isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'var(--text-tertiary)' : 'var(--accent-success)',
                          border: `1px solid ${(isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'var(--border-primary)' : 'var(--accent-success)'}`,
                          borderRadius: '0',
                          cursor: (isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'not-allowed' : 'pointer',
                          fontSize: '0.6875rem',
                          fontWeight: '700',
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                          opacity: (isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 0.4 : 1,
                          transition: 'none',
                          textTransform: 'uppercase',
                          width: '100%',
                        }}
                        onMouseEnter={(e) => {
                          if (!(isRunningJudge && runningJudgeConfigId === judgeConfig?.id)) {
                            e.currentTarget.style.outline = '2px solid var(--accent-success)';
                            e.currentTarget.style.outlineOffset = '-2px';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.outline = 'none';
                        }}
                        title="Run this evaluation for all rows"
                      >
                        {(isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'RUNNING...' : 'RUN ALL'}
                      </button>
                    )}
                    {isFunction && onRunFunctionEvalForAllRows && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRunFunctionEvalForAllRows && functionConfig) {
                            onRunFunctionEvalForAllRows(functionConfig.id, judgeConcurrency);
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'transparent',
                          color: 'var(--accent-success)',
                          border: '1px solid var(--accent-success)',
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
                          e.currentTarget.style.outline = '2px solid var(--accent-success)';
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
                    {(isJudge ? onClearJudgeForAllRows : onClearFunctionEvalForAllRows) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const configName = evaluation.config.name;
                          if (window.confirm(`Are you sure you want to clear all scores for "${configName}"?`)) {
                            if (isJudge && onClearJudgeForAllRows && judgeConfig) {
                              onClearJudgeForAllRows(judgeConfig.id);
                            } else if (isFunction && onClearFunctionEvalForAllRows && functionConfig) {
                              onClearFunctionEvalForAllRows(functionConfig.id);
                            }
                          }
                        }}
                        disabled={isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                          color: (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '0',
                          cursor: (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'not-allowed' : 'pointer',
                          fontSize: '0.6875rem',
                          fontWeight: '700',
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                          opacity: (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 0.4 : 1,
                          transition: 'none',
                          textTransform: 'uppercase',
                          width: '100%',
                        }}
                        onMouseEnter={(e) => {
                          if (!(isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id)) {
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
                    {(isJudge ? onDeleteJudgeConfig : onDeleteFunctionEvalConfig) && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) {
                            return;
                          }
                          const configName = evaluation.config.name;
                          if (window.confirm(`Are you sure you want to delete "${configName}" and all its scores? This action cannot be undone.`)) {
                            if (isJudge && onDeleteJudgeConfig && judgeConfig) {
                              await onDeleteJudgeConfig(judgeConfig.id);
                              if (selectedEvaluation?.type === 'judge' && selectedEvaluation.id === judgeConfig.id) {
                                setSelectedEvaluation(null);
                              }
                            } else if (isFunction && onDeleteFunctionEvalConfig && functionConfig) {
                              await handleDeleteFunction(functionConfig.id);
                            }
                          }
                        }}
                        disabled={isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'transparent',
                          color: (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'var(--text-tertiary)' : 'var(--accent-danger)',
                          border: `1px solid ${(isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'var(--border-primary)' : 'var(--accent-danger)'}`,
                          borderRadius: '0',
                          cursor: (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 'not-allowed' : 'pointer',
                          fontSize: '0.6875rem',
                          fontWeight: '700',
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                          transition: 'none',
                          textTransform: 'uppercase',
                          width: '100%',
                          opacity: (isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? 0.4 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!(isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id)) {
                            e.currentTarget.style.outline = '2px solid var(--accent-danger)';
                            e.currentTarget.style.outlineOffset = '-2px';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.outline = 'none';
                        }}
                        title={(isJudge && isRunningJudge && runningJudgeConfigId === judgeConfig?.id) ? "Cannot delete evaluation while it's running" : "Delete this evaluation and all its scores"}
                      >
                        DELETE
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add Evaluation Buttons */}
            {!selectedEvaluation && !showNewJudgeForm && !showNewFunctionForm && !isRunningJudge && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setShowNewJudgeForm(true);
                    setShowNewFunctionForm(false);
                    setJudgeName('');
                    setJudgePrompt('');
                    setIsLLMConfigExpanded(false);
                  }}
                  disabled={!csvFileId}
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: 'transparent',
                    color: csvFileId ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                    border: `1px solid ${csvFileId ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    borderRadius: '0',
                    cursor: csvFileId ? 'pointer' : 'not-allowed',
                    fontSize: '0.6875rem',
                    fontWeight: '700',
                    fontFamily: 'monospace',
                    transition: 'none',
                    textTransform: 'uppercase',
                    opacity: csvFileId ? 1 : 0.4,
                  }}
                  onMouseEnter={(e) => {
                    if (csvFileId) {
                      e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                      e.currentTarget.style.outlineOffset = '-2px';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (csvFileId) {
                      e.currentTarget.style.outline = 'none';
                    }
                  }}
                >
                  + ADD LLM JUDGE
                </button>
                <button
                  onClick={() => {
                    setShowNewFunctionForm(true);
                    setShowNewJudgeForm(false);
                    setSelectedFunctionName('');
                  }}
                  disabled={!csvFileId}
                  style={{
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
                  + ADD FUNCTION
                </button>
                {showNewFunctionForm && (
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: 'transparent',
                      color: isRefreshing ? 'var(--text-tertiary)' : 'var(--accent-primary)',
                      border: `1px solid ${isRefreshing ? 'var(--border-primary)' : 'var(--accent-primary)'}`,
                      borderRadius: '0',
                      cursor: isRefreshing ? 'not-allowed' : 'pointer',
                      fontSize: '0.6875rem',
                      fontWeight: '700',
                      fontFamily: 'monospace',
                      transition: 'none',
                      textTransform: 'uppercase',
                      opacity: isRefreshing ? 0.4 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isRefreshing) {
                        e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                        e.currentTarget.style.outlineOffset = '-2px';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isRefreshing) {
                        e.currentTarget.style.outline = 'none';
                      }
                    }}
                    title="Refresh available function evaluations"
                  >
                    {isRefreshing ? 'REFRESHING...' : 'REFRESH'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Judge Editor */}
      {(selectedJudgeConfig || showNewJudgeForm) && (
        <div ref={judgeEditorRef}>
          {/* Evaluation Name Input */}
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Evaluation Name {showNewJudgeForm && '(required)'}:
            </label>
            <input
              type="text"
              value={judgeName}
              onChange={(e) => setJudgeName(e.target.value)}
              placeholder="E.G., QUALITY_SCORE, ACCURACY..."
              disabled={!showNewJudgeForm}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                fontSize: '0.8125rem',
                boxSizing: 'border-box',
                backgroundColor: !showNewJudgeForm ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                color: !showNewJudgeForm ? 'var(--text-tertiary)' : 'var(--text-primary)',
                fontFamily: 'monospace',
                fontWeight: '600',
                transition: 'none',
              }}
              onFocus={(e) => {
                if (showNewJudgeForm) {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
              }}
            />
          </div>

          {/* Columns */}
          {columns.length > 0 && (
            <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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

          {/* Judge Prompt Textarea */}
          <textarea
            ref={judgeTextareaRef}
            value={judgePrompt}
            onChange={handleJudgeChange}
            placeholder="ENTER YOUR EVALUATION CRITERIA AND INSTRUCTIONS Reference other columns with {{column_name}} if needed."
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

          {/* LLM Configuration Section */}
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

          {/* Save and Close Editor Buttons */}
          {selectedJudgeConfig && !showNewJudgeForm && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleSaveJudge}
                disabled={isSavingJudge || !judgeName.trim() || !judgePrompt.trim()}
                style={{
                  flex: 1,
                  padding: '0.5rem 1rem',
                  backgroundColor: (judgeName.trim() && judgePrompt.trim()) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0',
                  cursor: (isSavingJudge || !judgeName.trim() || !judgePrompt.trim()) ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  opacity: (isSavingJudge || !judgeName.trim() || !judgePrompt.trim()) ? 0.4 : 1,
                  transition: 'none',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => {
                  if (!isSavingJudge && judgeName.trim() && judgePrompt.trim()) {
                    e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSavingJudge && judgeName.trim() && judgePrompt.trim()) {
                    e.currentTarget.style.outline = 'none';
                  }
                }}
              >
                {isSavingJudge ? 'SAVING...' : 'SAVE CHANGES'}
              </button>
              <button
                onClick={handleCancelJudge}
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

          {/* Save and Cancel Buttons for New Judge */}
          {showNewJudgeForm && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleSaveJudge}
                disabled={isSavingJudge || !judgeName.trim() || !judgePrompt.trim()}
                style={{
                  flex: 1,
                  padding: '0.5rem 1rem',
                  backgroundColor: (judgeName.trim() && judgePrompt.trim()) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0',
                  cursor: (isSavingJudge || !judgeName.trim() || !judgePrompt.trim()) ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  opacity: (isSavingJudge || !judgeName.trim() || !judgePrompt.trim()) ? 0.4 : 1,
                  transition: 'none',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => {
                  if (!isSavingJudge && judgeName.trim() && judgePrompt.trim()) {
                    e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSavingJudge && judgeName.trim() && judgePrompt.trim()) {
                    e.currentTarget.style.outline = 'none';
                  }
                }}
              >
                {isSavingJudge ? 'SAVING...' : 'SAVE EVALUATION'}
              </button>
              <button
                onClick={handleCancelJudge}
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
        </div>
      )}

      {/* Function Editor */}
      {showNewFunctionForm && (
        <div ref={functionEditorRef} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              {availableFunctionsToShow.map((func) => (
                <option key={func.name} value={func.name}>
                  {func.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleCreateFunction}
              disabled={isSavingFunction || !selectedFunctionName}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: selectedFunctionName ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                color: 'white',
                border: 'none',
                borderRadius: '0',
                cursor: (isSavingFunction || !selectedFunctionName) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                opacity: (isSavingFunction || !selectedFunctionName) ? 0.4 : 1,
                transition: 'none',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                if (!isSavingFunction && selectedFunctionName) {
                  e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSavingFunction && selectedFunctionName) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
            >
              {isSavingFunction ? 'SAVING...' : 'SAVE EVALUATION'}
            </button>
            <button
              onClick={() => {
                setShowNewFunctionForm(false);
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

      {/* Run All Evals and Clear All Buttons */}
      {(judgeConfigs.length > 0 || functionEvalConfigs.length > 0) && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(onRunJudgeForAllRows || onRunFunctionEvalForAllRows) && (
            <button
              onClick={async () => {
                // Run all judge evaluations first, then function evaluations
                if (onRunJudgeForAllRows && judgeConfigs.length > 0) {
                  const sortedJudgeConfigs = [...judgeConfigs].sort((a, b) => {
                    if (a.created_at && b.created_at) {
                      const dateA = new Date(a.created_at).getTime();
                      const dateB = new Date(b.created_at).getTime();
                      if (dateA !== dateB) {
                        return dateA - dateB;
                      }
                    }
                    return a.name.localeCompare(b.name);
                  });
                  for (const config of sortedJudgeConfigs) {
                    await onRunJudgeForAllRows(config.id, judgeConcurrency);
                  }
                }
                if (onRunFunctionEvalForAllRows && functionEvalConfigs.length > 0) {
                  const sortedFunctionConfigs = [...functionEvalConfigs].sort((a, b) => {
                    if (a.created_at && b.created_at) {
                      const dateA = new Date(a.created_at).getTime();
                      const dateB = new Date(b.created_at).getTime();
                      if (dateA !== dateB) {
                        return dateA - dateB;
                      }
                    }
                    return a.name.localeCompare(b.name);
                  });
                  for (const config of sortedFunctionConfigs) {
                    await onRunFunctionEvalForAllRows(config.id, judgeConcurrency);
                  }
                }
              }}
              disabled={!csvFileId || isRunningJudge}
              style={{
                flex: 1,
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                color: (!csvFileId || isRunningJudge) ? 'var(--text-tertiary)' : 'var(--accent-success)',
                border: `1px solid ${(!csvFileId || isRunningJudge) ? 'var(--border-primary)' : 'var(--accent-success)'}`,
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
                  e.currentTarget.style.outline = '2px solid var(--accent-success)';
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
          {(onClearJudgeForAllRows || onClearFunctionEvalForAllRows) && (
            <button
              onClick={async () => {
                if (window.confirm(`Are you sure you want to clear ALL scores for ALL evaluations? This action cannot be undone.`)) {
                  // Clear all judge evaluations
                  if (onClearJudgeForAllRows && judgeConfigs.length > 0) {
                    const sortedJudgeConfigs = [...judgeConfigs].sort((a, b) => {
                      if (a.created_at && b.created_at) {
                        const dateA = new Date(a.created_at).getTime();
                        const dateB = new Date(b.created_at).getTime();
                        if (dateA !== dateB) {
                          return dateA - dateB;
                        }
                      }
                      return a.name.localeCompare(b.name);
                    });
                    for (const config of sortedJudgeConfigs) {
                      await onClearJudgeForAllRows(config.id);
                    }
                  }
                  // Clear all function evaluations
                  if (onClearFunctionEvalForAllRows && functionEvalConfigs.length > 0) {
                    const sortedFunctionConfigs = [...functionEvalConfigs].sort((a, b) => {
                      if (a.created_at && b.created_at) {
                        const dateA = new Date(a.created_at).getTime();
                        const dateB = new Date(b.created_at).getTime();
                        if (dateA !== dateB) {
                          return dateA - dateB;
                        }
                      }
                      return a.name.localeCompare(b.name);
                    });
                    for (const config of sortedFunctionConfigs) {
                      await onClearFunctionEvalForAllRows(config.id);
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

      {/* Cancel Button for Running Judge Evaluations */}
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

      {/* Concurrency Configuration Section */}
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
                  value={tempConcurrency !== '' ? tempConcurrency : judgeConcurrency}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTempConcurrency(val);
                    const numVal = parseInt(val);
                    if (val !== '' && !isNaN(numVal) && numVal >= 1 && numVal <= 50) {
                      setJudgeConcurrency(numVal);
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value === '' ? judgeConcurrency.toString() : e.target.value;
                    const numVal = parseInt(val);
                    if (isNaN(numVal) || numVal < 1 || numVal > 50) {
                      setTempConcurrency('');
                    } else {
                      setTempConcurrency('');
                      setJudgeConcurrency(numVal);
                    }
                  }}
                  onFocus={() => setTempConcurrency(judgeConcurrency.toString())}
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
                onChange={(e) => setJudgeConcurrency(parseInt(e.target.value) || 10)}
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

