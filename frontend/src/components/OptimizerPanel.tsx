import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Evaluation, JudgeResult, FunctionEvalResult, JudgeConfig, FunctionEvalConfig, Metric, listMetrics, createOrUpdateMetric, deleteMetric } from '../services/api';

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
}: OptimizerPanelProps) {
  // State for thresholds (loaded from backend)
  const [humanAnnotationThreshold, setHumanAnnotationThreshold] = useState<number | null>(null);
  const [judgeThresholds, setJudgeThresholds] = useState<Record<number, number | null>>({});
  const [functionEvalThresholds, setFunctionEvalThresholds] = useState<Record<number, number | null>>({});
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const saveTimeoutRefs = useRef<Record<string, number>>({});

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
        </div>
      )}
    </div>
  );
}
