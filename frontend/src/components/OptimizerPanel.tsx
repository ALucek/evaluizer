import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Evaluation, JudgeResult, FunctionEvalResult, JudgeConfig, FunctionEvalConfig, Metric, listMetrics, createOrUpdateMetric, deleteMetric, GepaConfig, listGepaConfigs, createGepaConfig, deleteGepaConfig, runGepa, Prompt } from '../services/api';

interface OptimizerPanelProps {
  csvFileId: number | null;
  evaluations: Evaluation[];
  judgeResults: JudgeResult[];
  judgeConfigs: JudgeConfig[];
  functionEvalResults: FunctionEvalResult[];
  functionEvalConfigs: FunctionEvalConfig[];
  latestEvaluation?: Evaluation | null;
  latestJudgeResult?: JudgeResult | null;
  latestFunctionEvalResult?: FunctionEvalResult | null;
  prompts?: Prompt[];
  onGepaRunComplete?: (newPromptId: number) => void;
}

export default function OptimizerPanel({
  csvFileId,
  evaluations,
  judgeResults,
  judgeConfigs,
  functionEvalResults,
  functionEvalConfigs,
  latestEvaluation,
  latestJudgeResult,
  latestFunctionEvalResult,
  prompts = [],
  onGepaRunComplete,
}: OptimizerPanelProps) {
  // State for thresholds (loaded from backend)
  const [humanAnnotationThreshold, setHumanAnnotationThreshold] = useState<number | null>(null);
  const [judgeThresholds, setJudgeThresholds] = useState<Record<number, number | null>>({});
  const [functionEvalThresholds, setFunctionEvalThresholds] = useState<Record<number, number | null>>({});
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const saveTimeoutRefs = useRef<Record<string, number>>({});
  
  // GEPA state
  const [gepaConfigs, setGepaConfigs] = useState<GepaConfig[]>([]);
  const [isLoadingGepaConfigs, setIsLoadingGepaConfigs] = useState(false);
  const [isRunningGepa, setIsRunningGepa] = useState<number | null>(null); // config ID that's running
  const [showGepaForm, setShowGepaForm] = useState(false);
  const [gepaFormData, setGepaFormData] = useState({
    name: '',
    base_prompt_id: null as number | null,
    judge_config_ids: [] as number[],
    function_eval_config_ids: [] as number[],
    reflection_model: 'gpt-5',
    generator_model: 'gpt-5',
    max_metric_calls: 10,
  });
  const [isSavingGepaConfig, setIsSavingGepaConfig] = useState(false);

  // Load GEPA configs
  useEffect(() => {
    if (!csvFileId) {
      setGepaConfigs([]);
      return;
    }

    const loadGepaConfigs = async () => {
      setIsLoadingGepaConfigs(true);
      try {
        const configs = await listGepaConfigs(csvFileId);
        setGepaConfigs(configs);
      } catch (err) {
        console.error('Failed to load GEPA configs:', err);
      } finally {
        setIsLoadingGepaConfigs(false);
      }
    };

    loadGepaConfigs();
  }, [csvFileId]);

  // Load metrics from backend when csvFileId changes
  useEffect(() => {
    if (!csvFileId) {
      setHumanAnnotationThreshold(null);
      setJudgeThresholds({});
      setFunctionEvalThresholds({});
      setMetrics([]);
      return;
    }

    const loadMetrics = async () => {
      setIsLoadingMetrics(true);
      try {
        const loadedMetrics = await listMetrics(csvFileId);
        setMetrics(loadedMetrics);
        
        // Populate threshold state from loaded metrics
        const humanAnnotationMetric = loadedMetrics.find(m => m.metric_type === 'human_annotation');
        setHumanAnnotationThreshold(humanAnnotationMetric?.threshold ?? null);
        
        const judgeMetricsMap: Record<number, number> = {};
        loadedMetrics
          .filter(m => m.metric_type === 'judge' && m.config_id !== null)
          .forEach(m => {
            judgeMetricsMap[m.config_id!] = m.threshold;
          });
        setJudgeThresholds(judgeMetricsMap);
        
        const functionEvalMetricsMap: Record<number, number> = {};
        loadedMetrics
          .filter(m => m.metric_type === 'function_eval' && m.config_id !== null)
          .forEach(m => {
            functionEvalMetricsMap[m.config_id!] = m.threshold;
          });
        setFunctionEvalThresholds(functionEvalMetricsMap);
      } catch (err) {
        console.error('Failed to load metrics:', err);
      } finally {
        setIsLoadingMetrics(false);
      }
    };

    loadMetrics();
  }, [csvFileId]);

  // Save metric to backend (debounced)
  const saveMetric = useCallback(async (
    metricType: 'human_annotation' | 'judge' | 'function_eval',
    threshold: number | null,
    configId?: number | null
  ) => {
    if (!csvFileId) return;
    
    if (threshold === null || threshold === undefined) {
      // Delete metric if threshold is cleared
      const existingMetric = metrics.find(m => 
        m.metric_type === metricType && 
        m.config_id === (configId ?? null)
      );
      if (existingMetric) {
        try {
          await deleteMetric(existingMetric.id);
          setMetrics(prev => prev.filter(m => m.id !== existingMetric.id));
        } catch (err) {
          console.error('Failed to delete metric:', err);
        }
      }
      return;
    }

    try {
      const savedMetric = await createOrUpdateMetric(csvFileId, metricType, threshold, configId);
      setMetrics(prev => {
        const existing = prev.find(m => m.id === savedMetric.id);
        if (existing) {
          return prev.map(m => m.id === savedMetric.id ? savedMetric : m);
        }
        return [...prev, savedMetric];
      });
    } catch (err) {
      console.error('Failed to save metric:', err);
    }
  }, [csvFileId, metrics]);

  // Calculate averages per config, including latest results if they exist
  const averages = useMemo(() => {
    // Human annotations (1 for thumbs up, 0 for thumbs down)
    // Include latestEvaluation if it exists and has an annotation
    // Use a Map to deduplicate by csv_row_id, keeping the most recent
    const evaluationsMap = new Map<number, Evaluation>();
    evaluations.forEach(e => {
      evaluationsMap.set(e.csv_row_id, e);
    });
    if (latestEvaluation) {
      evaluationsMap.set(latestEvaluation.csv_row_id, latestEvaluation);
    }
    const allEvaluations = Array.from(evaluationsMap.values());
    const annotationsWithValues = allEvaluations.filter(e => e.annotation !== null && e.annotation !== undefined);
    const humanAnnotationAvg = annotationsWithValues.length > 0
      ? annotationsWithValues.reduce((sum, e) => sum + (e.annotation ?? 0), 0) / annotationsWithValues.length
      : null;

    // Judge results - group by config_id and calculate average per config
    const allJudgeResults = [...judgeResults];
    if (latestJudgeResult) {
      const index = allJudgeResults.findIndex(r => r.id === latestJudgeResult.id);
      if (index >= 0) {
        allJudgeResults[index] = latestJudgeResult;
      } else {
        allJudgeResults.push(latestJudgeResult);
      }
    }
    
    const judgeAveragesByConfig: Array<{ config: JudgeConfig; average: number | null; count: number }> = [];
    judgeConfigs.forEach(config => {
      const configResults = allJudgeResults.filter(r => r.config_id === config.id);
      if (configResults.length > 0) {
        const avg = configResults.reduce((sum, r) => sum + r.score, 0) / configResults.length;
        judgeAveragesByConfig.push({ config, average: avg, count: configResults.length });
      } else {
        judgeAveragesByConfig.push({ config, average: null, count: 0 });
      }
    });

    // Function eval results - group by config_id and calculate average per config
    const allFunctionEvalResults = [...functionEvalResults];
    if (latestFunctionEvalResult) {
      const index = allFunctionEvalResults.findIndex(r => r.id === latestFunctionEvalResult.id);
      if (index >= 0) {
        allFunctionEvalResults[index] = latestFunctionEvalResult;
      } else {
        allFunctionEvalResults.push(latestFunctionEvalResult);
      }
    }
    
    const functionEvalAveragesByConfig: Array<{ config: FunctionEvalConfig; average: number | null; count: number }> = [];
    functionEvalConfigs.forEach(config => {
      const configResults = allFunctionEvalResults.filter(r => r.config_id === config.id);
      if (configResults.length > 0) {
        const avg = configResults.reduce((sum, r) => sum + r.score, 0) / configResults.length;
        functionEvalAveragesByConfig.push({ config, average: avg, count: configResults.length });
      } else {
        functionEvalAveragesByConfig.push({ config, average: null, count: 0 });
      }
    });

    return {
      humanAnnotation: humanAnnotationAvg,
      humanAnnotationCount: annotationsWithValues.length,
      judgeAveragesByConfig,
      functionEvalAveragesByConfig,
    };
  }, [evaluations, judgeResults, judgeConfigs, functionEvalResults, functionEvalConfigs, latestEvaluation, latestJudgeResult, latestFunctionEvalResult]);

  // GEPA handlers
  const handleRunGepa = useCallback(async (configId: number) => {
    if (!csvFileId) return;
    
    setIsRunningGepa(configId);
    try {
      const result = await runGepa(configId);
      // Reload configs
      const configs = await listGepaConfigs(csvFileId);
      setGepaConfigs(configs);
      
      // Notify parent to refresh prompts
      if (onGepaRunComplete) {
        onGepaRunComplete(result.new_prompt_id);
      }
    } catch (err) {
      console.error('Failed to run GEPA:', err);
    } finally {
      setIsRunningGepa(null);
    }
  }, [csvFileId, onGepaRunComplete]);

  const handleDeleteGepaConfig = useCallback(async (configId: number) => {
    if (!csvFileId) return;
    
    try {
      await deleteGepaConfig(configId);
      const configs = await listGepaConfigs(csvFileId);
      setGepaConfigs(configs);
    } catch (err) {
      console.error('Failed to delete GEPA config:', err);
    }
  }, [csvFileId]);

  const handleCreateGepaConfig = useCallback(async () => {
    if (!csvFileId) return;
    
    if (!gepaFormData.name.trim()) {
      alert('Please enter a name for the GEPA config');
      return;
    }
    
    if (!gepaFormData.base_prompt_id) {
      alert('Please select a base prompt to optimize');
      return;
    }
    
    if (gepaFormData.judge_config_ids.length === 0 && gepaFormData.function_eval_config_ids.length === 0) {
      alert('Please select at least one judge config or function eval config');
      return;
    }
    
    setIsSavingGepaConfig(true);
    try {
      await createGepaConfig({
        csv_file_id: csvFileId,
        name: gepaFormData.name.trim(),
        base_prompt_id: gepaFormData.base_prompt_id!,
        judge_config_ids: gepaFormData.judge_config_ids.length > 0 ? gepaFormData.judge_config_ids : null,
        function_eval_config_ids: gepaFormData.function_eval_config_ids.length > 0 ? gepaFormData.function_eval_config_ids : null,
        reflection_model: gepaFormData.reflection_model,
        generator_model: gepaFormData.generator_model,
        max_metric_calls: gepaFormData.max_metric_calls,
      });
      
      // Reload configs
      const configs = await listGepaConfigs(csvFileId);
      setGepaConfigs(configs);
      
      // Reset form
      setGepaFormData({
        name: '',
        base_prompt_id: null,
        judge_config_ids: [],
        function_eval_config_ids: [],
        reflection_model: 'gpt-5',
        generator_model: 'gpt-5',
        max_metric_calls: 10,
      });
      setShowGepaForm(false);
    } catch (err) {
      console.error('Failed to create GEPA config:', err);
      alert(`Failed to create GEPA config: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSavingGepaConfig(false);
    }
  }, [csvFileId, gepaFormData]);

  return (
    <div style={{
      padding: '0.75rem 1rem',
      border: '1px solid var(--border-primary)',
      borderRadius: '0',
      backgroundColor: 'var(--bg-elevated)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      <div>
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '0.5rem', 
          color: 'var(--text-primary)', 
          fontWeight: '700', 
          fontFamily: 'monospace', 
          fontSize: '0.875rem', 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em' 
        }}>
          OPTIMIZER
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          MONITOR EVALUATION SCORES AND SET THRESHOLDS TO TRACK PERFORMANCE ACROSS ALL EVALUATION TYPES.
        </p>
      </div>
      
      {!csvFileId ? (
        <div style={{
          padding: '1rem',
          border: '1px dashed var(--border-secondary)',
          borderRadius: '0',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          fontSize: '0.625rem',
          fontFamily: 'monospace',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          SELECT A CSV FILE
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          {/* Headers */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '0.25rem',
          }}>
            <div style={{
              flex: 1,
              fontSize: '0.75rem',
              fontWeight: '700',
              color: 'var(--text-tertiary)',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              textAlign: 'left',
            }}>
              EVALUATION:
            </div>
            <div style={{
              width: '90px',
              fontSize: '0.75rem',
              fontWeight: '700',
              color: 'var(--text-tertiary)',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              textAlign: 'right',
              flexShrink: 0,
            }}>
              THRESHOLD:
            </div>
          </div>
          
          {/* Always show Human Annotation */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'stretch',
          }}>
            <div style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              border: '1px solid var(--border-primary)',
              borderRadius: '0',
              backgroundColor: 'var(--bg-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{
                fontSize: '0.625rem',
                color: 'var(--text-tertiary)',
                fontFamily: 'monospace',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                HUMAN ANNOTATION
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                minWidth: '80px',
              }}>
                <div style={{
                  fontSize: '1rem',
                  color: averages.humanAnnotation !== null ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontFamily: 'monospace',
                  fontWeight: '700',
                  textAlign: 'right',
                  minWidth: '3ch',
                }}>
                  {averages.humanAnnotation !== null ? averages.humanAnnotation.toFixed(2) : '-'}
                </div>
                <div style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'monospace',
                  fontWeight: '400',
                  textAlign: 'right',
                  minWidth: '4ch',
                }}>
                  ({averages.humanAnnotationCount})
                </div>
              </div>
            </div>
            <input
              type="number"
              step="0.01"
              value={humanAnnotationThreshold ?? ''}
              onChange={(e) => {
                const value = e.target.value === '' ? null : parseFloat(e.target.value);
                const numValue = isNaN(value as number) ? null : value;
                setHumanAnnotationThreshold(numValue);
                // Save to backend with debounce
                const key = 'human_annotation';
                if (saveTimeoutRefs.current[key]) {
                  clearTimeout(saveTimeoutRefs.current[key]);
                }
                saveTimeoutRefs.current[key] = setTimeout(() => {
                  saveMetric('human_annotation', numValue);
                  delete saveTimeoutRefs.current[key];
                }, 500);
              }}
              placeholder="-"
              disabled={isLoadingMetrics}
              style={{
                width: '90px',
                padding: '0.5rem 0.5rem',
                border: (humanAnnotationThreshold === null || humanAnnotationThreshold === undefined)
                  ? '1px solid var(--border-primary)'
                  : averages.humanAnnotation !== null && averages.humanAnnotation !== undefined
                    ? `2px solid ${averages.humanAnnotation >= humanAnnotationThreshold ? '#22c55e' : '#ef4444'}`
                    : '1px solid var(--border-primary)',
                borderRadius: '0',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.8125rem',
                fontFamily: 'monospace',
                fontWeight: '600',
                textAlign: 'right',
                flexShrink: 0,
              }}
            />
          </div>
          
          {/* Always show all Judge Configs */}
          {averages.judgeAveragesByConfig.map(({ config, average, count }) => (
            <div key={config.id} style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'stretch',
            }}>
              <div style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                backgroundColor: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'monospace',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {config.name}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                  justifyContent: 'flex-end',
                  minWidth: '80px',
                }}>
                  <div style={{
                    fontSize: '1rem',
                    color: average !== null ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    textAlign: 'right',
                    minWidth: '3ch',
                  }}>
                    {average !== null ? average.toFixed(2) : '-'}
                  </div>
                  <div style={{
                    fontSize: '0.625rem',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'monospace',
                    fontWeight: '400',
                    textAlign: 'right',
                    minWidth: '4ch',
                  }}>
                    ({count})
                  </div>
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                value={judgeThresholds[config.id] ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : parseFloat(e.target.value);
                  const numValue = isNaN(value as number) ? null : value;
                  setJudgeThresholds(prev => ({
                    ...prev,
                    [config.id]: numValue,
                  }));
                  // Save to backend with debounce
                  const key = `judge_${config.id}`;
                  if (saveTimeoutRefs.current[key]) {
                    clearTimeout(saveTimeoutRefs.current[key]);
                  }
                  saveTimeoutRefs.current[key] = setTimeout(() => {
                    saveMetric('judge', numValue, config.id);
                    delete saveTimeoutRefs.current[key];
                  }, 500);
                }}
                placeholder="-"
                disabled={isLoadingMetrics}
                style={{
                  width: '90px',
                  padding: '0.5rem 0.5rem',
                  border: (judgeThresholds[config.id] === null || judgeThresholds[config.id] === undefined)
                    ? '1px solid var(--border-primary)'
                    : average !== null && average !== undefined
                      ? `2px solid ${average >= judgeThresholds[config.id]! ? '#22c55e' : '#ef4444'}`
                      : '1px solid var(--border-primary)',
                  borderRadius: '0',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8125rem',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
          
          {/* Always show all Function Eval Configs */}
          {averages.functionEvalAveragesByConfig.map(({ config, average, count }) => (
            <div key={config.id} style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'stretch',
            }}>
              <div style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                backgroundColor: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{
                  fontSize: '0.625rem',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'monospace',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {config.name}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                  justifyContent: 'flex-end',
                  minWidth: '80px',
                }}>
                  <div style={{
                    fontSize: '1rem',
                    color: average !== null ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    textAlign: 'right',
                    minWidth: '3ch',
                  }}>
                    {average !== null ? average.toFixed(2) : '-'}
                  </div>
                  <div style={{
                    fontSize: '0.625rem',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'monospace',
                    fontWeight: '400',
                    textAlign: 'right',
                    minWidth: '4ch',
                  }}>
                    ({count})
                  </div>
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                value={functionEvalThresholds[config.id] ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : parseFloat(e.target.value);
                  const numValue = isNaN(value as number) ? null : value;
                  setFunctionEvalThresholds(prev => ({
                    ...prev,
                    [config.id]: numValue,
                  }));
                  // Save to backend with debounce
                  const key = `function_eval_${config.id}`;
                  if (saveTimeoutRefs.current[key]) {
                    clearTimeout(saveTimeoutRefs.current[key]);
                  }
                  saveTimeoutRefs.current[key] = setTimeout(() => {
                    saveMetric('function_eval', numValue, config.id);
                    delete saveTimeoutRefs.current[key];
                  }, 500);
                }}
                placeholder="-"
                disabled={isLoadingMetrics}
                style={{
                  width: '90px',
                  padding: '0.5rem 0.5rem',
                  border: (functionEvalThresholds[config.id] === null || functionEvalThresholds[config.id] === undefined)
                    ? '1px solid var(--border-primary)'
                    : average !== null && average !== undefined
                      ? `2px solid ${average >= functionEvalThresholds[config.id]! ? '#22c55e' : '#ef4444'}`
                      : '1px solid var(--border-primary)',
                  borderRadius: '0',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8125rem',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
          
          {/* GEPA Optimizer Section */}
          <div style={{
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-primary)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '0.75rem',
                fontWeight: '700',
                color: 'var(--text-tertiary)',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                GEPA OPTIMIZER
              </h3>
              <button
                onClick={() => {
                  setShowGepaForm(true);
                }}
                disabled={!csvFileId || isRunningGepa !== null}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  cursor: (!csvFileId || isRunningGepa !== null) ? 'not-allowed' : 'pointer',
                  fontSize: '0.625rem',
                  color: (!csvFileId || isRunningGepa !== null) ? 'var(--text-tertiary)' : 'var(--text-primary)',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  opacity: (!csvFileId || isRunningGepa !== null) ? 0.5 : 1,
                }}
              >
                + CREATE
              </button>
            </div>
            
            {isLoadingGepaConfigs ? (
              <div style={{
                padding: '0.5rem',
                fontSize: '0.625rem',
                color: 'var(--text-tertiary)',
                fontFamily: 'monospace',
              }}>
                LOADING...
              </div>
            ) : gepaConfigs.length === 0 ? (
              <div style={{
                padding: '0.5rem',
                fontSize: '0.625rem',
                color: 'var(--text-tertiary)',
                fontFamily: 'monospace',
                fontStyle: 'italic',
              }}>
                NO GEPA CONFIGS. CLICK CREATE TO ADD ONE.
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}>
                {gepaConfigs.map((config) => {
                  const basePrompt = prompts.find(p => p.id === config.base_prompt_id);
                  const basePromptName = basePrompt 
                    ? `${basePrompt.name || 'Unnamed'} (v${basePrompt.version})`
                    : `Prompt #${config.base_prompt_id}`;
                  const isRunning = isRunningGepa === config.id;
                  
                  return (
                    <div
                      key={config.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0',
                        backgroundColor: 'var(--bg-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.625rem',
                          color: 'var(--text-primary)',
                          fontFamily: 'monospace',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          marginBottom: '0.25rem',
                        }}>
                          {config.name}
                        </div>
                        <div style={{
                          fontSize: '0.5rem',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                        }}>
                          Base: {basePromptName} | Max calls: {config.max_metric_calls}
                        </div>
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: '0.25rem',
                      }}>
                        <button
                          onClick={() => handleRunGepa(config.id)}
                          disabled={isRunning || isRunningGepa !== null}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: isRunning ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '0',
                            cursor: (isRunning || isRunningGepa !== null) ? 'not-allowed' : 'pointer',
                            fontSize: '0.625rem',
                            color: isRunning ? 'white' : 'var(--text-primary)',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            textTransform: 'uppercase',
                            opacity: (isRunning || isRunningGepa !== null) && !isRunning ? 0.5 : 1,
                          }}
                        >
                          {isRunning ? 'RUNNING...' : 'RUN'}
                        </button>
                        <button
                          onClick={() => handleDeleteGepaConfig(config.id)}
                          disabled={isRunning || isRunningGepa !== null}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '0',
                            cursor: (isRunning || isRunningGepa !== null) ? 'not-allowed' : 'pointer',
                            fontSize: '0.625rem',
                            color: 'var(--text-primary)',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            textTransform: 'uppercase',
                            opacity: (isRunning || isRunningGepa !== null) ? 0.5 : 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* GEPA Config Creation Form Modal */}
          {showGepaForm && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }} onClick={() => setShowGepaForm(false)}>
              <div style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                padding: '1.5rem',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '90vh',
                overflowY: 'auto',
              }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    CREATE GEPA CONFIG
                  </h3>
                  <button
                    onClick={() => setShowGepaForm(false)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.25rem',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'monospace',
                      fontWeight: '700',
                    }}
                  >
                    ×
                  </button>
                </div>
                
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}>
                  {/* Name */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem',
                    }}>
                      NAME *
                    </label>
                    <input
                      type="text"
                      value={gepaFormData.name}
                      onChange={(e) => setGepaFormData({ ...gepaFormData, name: e.target.value })}
                      placeholder="E.G., MAIN OPTIMIZER"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0',
                        fontSize: '0.8125rem',
                        fontFamily: 'monospace',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  
                  {/* Base Prompt */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem',
                    }}>
                      BASE PROMPT *
                    </label>
                    <select
                      value={gepaFormData.base_prompt_id || ''}
                      onChange={(e) => setGepaFormData({ ...gepaFormData, base_prompt_id: e.target.value ? parseInt(e.target.value) : null })}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0',
                        fontSize: '0.8125rem',
                        fontFamily: 'monospace',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="">-- SELECT PROMPT --</option>
                      {prompts.map((prompt) => (
                        <option key={prompt.id} value={prompt.id}>
                          {prompt.name || 'Unnamed'} (v{prompt.version})
                        </option>
                      ))}
                    </select>
                    {prompts.length === 0 && (
                      <div style={{
                        fontSize: '0.625rem',
                        color: 'var(--text-tertiary)',
                        fontFamily: 'monospace',
                        marginTop: '0.25rem',
                        fontStyle: 'italic',
                      }}>
                        NO PROMPTS AVAILABLE. CREATE A PROMPT FIRST.
                      </div>
                    )}
                  </div>
                  
                  {/* Judge Configs */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem',
                    }}>
                      JUDGE CONFIGS *
                    </label>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      maxHeight: '150px',
                      overflowY: 'auto',
                      padding: '0.5rem',
                      border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                    }}>
                      {judgeConfigs.length === 0 ? (
                        <div style={{
                          fontSize: '0.625rem',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                          fontStyle: 'italic',
                        }}>
                          NO JUDGE CONFIGS AVAILABLE
                        </div>
                      ) : (
                        judgeConfigs.map((config) => (
                          <label key={config.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            color: 'var(--text-primary)',
                          }}>
                            <input
                              type="checkbox"
                              checked={gepaFormData.judge_config_ids.includes(config.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGepaFormData({
                                    ...gepaFormData,
                                    judge_config_ids: [...gepaFormData.judge_config_ids, config.id]
                                  });
                                } else {
                                  setGepaFormData({
                                    ...gepaFormData,
                                    judge_config_ids: gepaFormData.judge_config_ids.filter(id => id !== config.id)
                                  });
                                }
                              }}
                              style={{
                                cursor: 'pointer',
                              }}
                            />
                            {config.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Function Eval Configs */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem',
                    }}>
                      FUNCTION EVAL CONFIGS *
                    </label>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      maxHeight: '150px',
                      overflowY: 'auto',
                      padding: '0.5rem',
                      border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                    }}>
                      {functionEvalConfigs.length === 0 ? (
                        <div style={{
                          fontSize: '0.625rem',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                          fontStyle: 'italic',
                        }}>
                          NO FUNCTION EVAL CONFIGS AVAILABLE
                        </div>
                      ) : (
                        functionEvalConfigs.map((config) => (
                          <label key={config.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            color: 'var(--text-primary)',
                          }}>
                            <input
                              type="checkbox"
                              checked={gepaFormData.function_eval_config_ids.includes(config.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setGepaFormData({
                                    ...gepaFormData,
                                    function_eval_config_ids: [...gepaFormData.function_eval_config_ids, config.id]
                                  });
                                } else {
                                  setGepaFormData({
                                    ...gepaFormData,
                                    function_eval_config_ids: gepaFormData.function_eval_config_ids.filter(id => id !== config.id)
                                  });
                                }
                              }}
                              style={{
                                cursor: 'pointer',
                              }}
                            />
                            {config.name}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Models */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                  }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: 'var(--text-secondary)',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        marginBottom: '0.5rem',
                      }}>
                        REFLECTION MODEL
                      </label>
                      <input
                        type="text"
                        value={gepaFormData.reflection_model}
                        onChange={(e) => setGepaFormData({ ...gepaFormData, reflection_model: e.target.value })}
                        placeholder="gpt-5"
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '0',
                          fontSize: '0.8125rem',
                          fontFamily: 'monospace',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: 'var(--text-secondary)',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        marginBottom: '0.5rem',
                      }}>
                        GENERATOR MODEL
                      </label>
                      <input
                        type="text"
                        value={gepaFormData.generator_model}
                        onChange={(e) => setGepaFormData({ ...gepaFormData, generator_model: e.target.value })}
                        placeholder="gpt-5"
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '0',
                          fontSize: '0.8125rem',
                          fontFamily: 'monospace',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Max Metric Calls */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      marginBottom: '0.5rem',
                    }}>
                      MAX METRIC CALLS
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={gepaFormData.max_metric_calls}
                      onChange={(e) => setGepaFormData({ ...gepaFormData, max_metric_calls: parseInt(e.target.value) || 10 })}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0',
                        fontSize: '0.8125rem',
                        fontFamily: 'monospace',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  
                  {/* Buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    justifyContent: 'flex-end',
                    marginTop: '0.5rem',
                  }}>
                    <button
                      onClick={() => setShowGepaForm(false)}
                      disabled={isSavingGepaConfig}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0',
                        cursor: isSavingGepaConfig ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        color: 'var(--text-primary)',
                        opacity: isSavingGepaConfig ? 0.5 : 1,
                      }}
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleCreateGepaConfig}
                      disabled={isSavingGepaConfig}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: 'var(--accent-primary)',
                        border: '1px solid var(--accent-primary)',
                        borderRadius: '0',
                        cursor: isSavingGepaConfig ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        color: 'white',
                        opacity: isSavingGepaConfig ? 0.5 : 1,
                      }}
                    >
                      {isSavingGepaConfig ? 'SAVING...' : 'CREATE'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
