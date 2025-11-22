import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Evaluation, JudgeResult, FunctionEvalResult, JudgeConfig, FunctionEvalConfig, Metric, listMetrics, createOrUpdateMetric, deleteMetric, GepaConfig, listGepaConfigs, createGepaConfig, updateGepaConfig, deleteGepaConfig, runGepa, subscribeToGepaProgress, GepaProgress, Prompt, BestPromptsResponse, getBestPromptsForMetrics } from '../services/api';

function Timer({ startTime, updatedAt, status }: { startTime: string; updatedAt: string; status: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (status === 'running') {
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const start = new Date(startTime).getTime();
  // If completed or error, stop timer at updated_at
  const end = (status === 'completed' || status === 'error')
    ? new Date(updatedAt).getTime() 
    : now;
  
  const elapsed = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  return (
    <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
      {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}

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
  onGepaRunningChange?: (isRunning: boolean) => void;
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
  onGepaRunningChange,
}: OptimizerPanelProps) {
  // State for thresholds (loaded from backend)
  const [humanAnnotationThreshold, setHumanAnnotationThreshold] = useState<number | null>(null);
  const [judgeThresholds, setJudgeThresholds] = useState<Record<number, number | null>>({});
  const [functionEvalThresholds, setFunctionEvalThresholds] = useState<Record<number, number | null>>({});
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const saveTimeoutRefs = useRef<Record<string, number>>({});
  
  // State for best prompts
  const [bestPrompts, setBestPrompts] = useState<BestPromptsResponse | null>(null);
  const [_isLoadingBestPrompts, setIsLoadingBestPrompts] = useState(false);
  
  // GEPA state
  const [gepaConfigs, setGepaConfigs] = useState<GepaConfig[]>([]);
  const [isLoadingGepaConfigs, setIsLoadingGepaConfigs] = useState(false);
  const [isRunningGepa, setIsRunningGepa] = useState<number | null>(null); // config ID that's running
  const [gepaProgress, setGepaProgress] = useState<Record<number, GepaProgress>>({});
  const [showGepaForm, setShowGepaForm] = useState(false);
  const [editingGepaConfigId, setEditingGepaConfigId] = useState<number | null>(null);
  const [gepaFormData, setGepaFormData] = useState({
    name: '',
    base_prompt_id: null as number | null,
    judge_config_ids: [] as number[],
    function_eval_config_ids: [] as number[],
    generator_model: 'gpt-5',
    reflection_model: 'gpt-5',
    generator_temperature: 1.0,
    generator_max_tokens: 16384,
    reflection_temperature: 1.0,
    reflection_max_tokens: 16384,
    max_metric_calls: 10,
  });
  const [isSavingGepaConfig, setIsSavingGepaConfig] = useState(false);
  // Local string states for number inputs to allow empty during editing
  // Use null to mean "not editing", empty string means "editing but empty"
  const [tempGeneratorTemperature, setTempGeneratorTemperature] = useState<string | null>(null);
  const [tempGeneratorMaxTokens, setTempGeneratorMaxTokens] = useState<string | null>(null);
  const [tempReflectionTemperature, setTempReflectionTemperature] = useState<string | null>(null);
  const [tempReflectionMaxTokens, setTempReflectionMaxTokens] = useState<string | null>(null);
  const [tempMaxMetricCalls, setTempMaxMetricCalls] = useState<string | null>(null);

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

  // Notify parent when GEPA running state changes
  useEffect(() => {
    if (onGepaRunningChange) {
      onGepaRunningChange(isRunningGepa !== null);
    }
  }, [isRunningGepa, onGepaRunningChange]);

  // Load metrics from backend when csvFileId changes
  useEffect(() => {
    if (!csvFileId) {
      setHumanAnnotationThreshold(null);
      setJudgeThresholds({});
      setFunctionEvalThresholds({});
      setMetrics([]);
      setBestPrompts(null);
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

  // Load best prompts from backend when csvFileId, results, or prompts change
  useEffect(() => {
    if (!csvFileId) {
      setBestPrompts(null);
      return;
    }

    const loadBestPrompts = async () => {
      setIsLoadingBestPrompts(true);
      try {
        const bestPromptsData = await getBestPromptsForMetrics(csvFileId);
        setBestPrompts(bestPromptsData);
      } catch (err) {
        console.error('Failed to load best prompts:', err);
        setBestPrompts(null);
      } finally {
        setIsLoadingBestPrompts(false);
      }
    };

    loadBestPrompts();
  }, [
    csvFileId,
    evaluations.length,
    judgeResults.length,
    functionEvalResults.length,
    prompts.length,
    latestEvaluation?.id,
    latestEvaluation?.annotation, // Track annotation changes for human annotation best prompt
    latestEvaluation?.updated_at, // Track when evaluation is updated
    latestJudgeResult?.id,
    latestFunctionEvalResult?.id,
    // Also track annotation changes in evaluations array
    evaluations.filter(e => e.annotation !== null && e.annotation !== undefined).length,
    // Track a hash of annotation values to detect changes
    evaluations.map(e => `${e.csv_row_id}-${e.annotation}`).join(',')
  ]);

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
    setGepaProgress(prev => ({
      ...prev,
      [configId]: {
        status: 'running',
        current_iteration: 0,
        max_iterations: 0,
        current_score: null,
        best_score: null,
        message: 'Starting...',
        updated_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      }
    }));
    
    // Start progress subscription BEFORE calling runGepa
    let completed = false;
    const unsubscribe = subscribeToGepaProgress(
      configId,
      (progress) => {
        setGepaProgress(prev => ({
          ...prev,
          [configId]: progress
        }));
        
        // Handle completion when progress shows completed
        if (progress.status === 'completed' && !completed) {
          completed = true;
          setIsRunningGepa(null);
          
          // Reload configs
          listGepaConfigs(csvFileId).then(configs => {
            setGepaConfigs(configs);
          }).catch(err => {
            console.error('Failed to reload GEPA configs:', err);
          });
          
          // Notify parent to refresh prompts if we have a new prompt ID
          if (onGepaRunComplete && progress.new_prompt_id) {
            onGepaRunComplete(progress.new_prompt_id);
          }
        } else if (progress.status === 'error' && !completed) {
          completed = true;
          setIsRunningGepa(null);
        }
      },
      (error) => {
        console.error('Progress stream error:', error);
        if (!completed) {
          completed = true;
          setIsRunningGepa(null);
          setGepaProgress(prev => ({
            ...prev,
            [configId]: {
              ...prev[configId],
              status: 'error',
              message: `Error: ${error.message}`
            }
          }));
        }
      },
      () => {
        // Cleanup on complete
        if (!completed) {
          completed = true;
          setIsRunningGepa(null);
        }
        setTimeout(() => {
          setGepaProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[configId];
            return newProgress;
          });
        }, 3000); // Keep progress visible for 3 seconds after completion
      }
    );
    
    try {
      // Start the optimization (returns immediately now)
      await runGepa(configId);
      // Note: We don't wait for completion here - the progress stream will handle it
    } catch (err) {
      console.error('Failed to start GEPA:', err);
      if (!completed) {
        completed = true;
        setIsRunningGepa(null);
        unsubscribe();
        setGepaProgress(prev => ({
          ...prev,
          [configId]: {
            ...prev[configId],
            status: 'error',
            message: `Failed to start: ${err instanceof Error ? err.message : 'Unknown error'}`
          }
        }));
      }
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

  const handleEditGepaConfig = useCallback((config: GepaConfig) => {
    setEditingGepaConfigId(config.id);
    setGepaFormData({
      name: config.name,
      base_prompt_id: config.base_prompt_id,
      judge_config_ids: config.judge_config_ids || [],
      function_eval_config_ids: config.function_eval_config_ids || [],
      generator_model: config.generator_model,
      reflection_model: config.reflection_model,
      generator_temperature: config.generator_temperature,
      generator_max_tokens: config.generator_max_tokens,
      reflection_temperature: config.reflection_temperature,
      reflection_max_tokens: config.reflection_max_tokens,
      max_metric_calls: config.max_metric_calls,
    });
    setTempGeneratorTemperature(null);
    setTempGeneratorMaxTokens(null);
    setTempReflectionTemperature(null);
    setTempReflectionMaxTokens(null);
    setTempMaxMetricCalls(null);
    setShowGepaForm(true);
  }, []);

  const handleSaveGepaConfig = useCallback(async () => {
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
      const payload = {
        name: gepaFormData.name.trim(),
        base_prompt_id: gepaFormData.base_prompt_id!,
        judge_config_ids: gepaFormData.judge_config_ids.length > 0 ? gepaFormData.judge_config_ids : null,
        function_eval_config_ids: gepaFormData.function_eval_config_ids.length > 0 ? gepaFormData.function_eval_config_ids : null,
        generator_model: gepaFormData.generator_model,
        reflection_model: gepaFormData.reflection_model,
        generator_temperature: gepaFormData.generator_temperature,
        generator_max_tokens: gepaFormData.generator_max_tokens,
        reflection_temperature: gepaFormData.reflection_temperature,
        reflection_max_tokens: gepaFormData.reflection_max_tokens,
        max_metric_calls: gepaFormData.max_metric_calls,
      };

      if (editingGepaConfigId) {
        // Update existing config
        await updateGepaConfig(editingGepaConfigId, payload);
      } else {
        // Create new config
        await createGepaConfig({
          csv_file_id: csvFileId,
          ...payload,
      });
      }
      
      // Reload configs
      const configs = await listGepaConfigs(csvFileId);
      setGepaConfigs(configs);
      
      // Reset form
      setGepaFormData({
        name: '',
        base_prompt_id: null,
        judge_config_ids: [],
        function_eval_config_ids: [],
        generator_model: 'gpt-5',
        reflection_model: 'gpt-5',
        generator_temperature: 1.0,
        generator_max_tokens: 16384,
        reflection_temperature: 1.0,
        reflection_max_tokens: 16384,
        max_metric_calls: 10,
      });
      setTempGeneratorTemperature(null);
      setTempGeneratorMaxTokens(null);
      setTempReflectionTemperature(null);
      setTempReflectionMaxTokens(null);
      setTempMaxMetricCalls(null);
      setEditingGepaConfigId(null);
      setShowGepaForm(false);
    } catch (err) {
      console.error(`Failed to ${editingGepaConfigId ? 'update' : 'create'} GEPA config:`, err);
      alert(`Failed to ${editingGepaConfigId ? 'update' : 'create'} GEPA config: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSavingGepaConfig(false);
    }
  }, [csvFileId, gepaFormData, editingGepaConfigId]);

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
          MONITOR EVALUATION SCORES, SET THRESHOLDS, AND OPTIMIZE PROMPTS USING GEPA
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
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '0.25rem',
                justifyContent: 'flex-end',
                minWidth: '80px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                  justifyContent: 'flex-end',
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
                {bestPrompts?.human_annotation && (
                  <div style={{
                    fontSize: '0.5rem',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'monospace',
                    fontWeight: '400',
                    textAlign: 'right',
                  }}>
                    BEST: {bestPrompts.human_annotation.name || 'Unnamed'} v{bestPrompts.human_annotation.version} ({bestPrompts.human_annotation.average_score.toFixed(2)})
                  </div>
                )}
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
              disabled={isLoadingMetrics || isRunningGepa !== null}
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
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '0.25rem',
                  justifyContent: 'flex-end',
                  minWidth: '80px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.5rem',
                    justifyContent: 'flex-end',
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
                  {bestPrompts?.judge_configs[config.id] && (
                    <div style={{
                      fontSize: '0.5rem',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'monospace',
                      fontWeight: '400',
                      textAlign: 'right',
                    }}>
                      BEST: {bestPrompts.judge_configs[config.id]!.name || 'Unnamed'} v{bestPrompts.judge_configs[config.id]!.version} ({bestPrompts.judge_configs[config.id]!.average_score.toFixed(2)})
                    </div>
                  )}
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
                disabled={isLoadingMetrics || isRunningGepa !== null}
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
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '0.25rem',
                  justifyContent: 'flex-end',
                  minWidth: '80px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.5rem',
                    justifyContent: 'flex-end',
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
                  {bestPrompts?.function_eval_configs[config.id] && (
                    <div style={{
                      fontSize: '0.5rem',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'monospace',
                      fontWeight: '400',
                      textAlign: 'right',
                    }}>
                      BEST: {bestPrompts.function_eval_configs[config.id]!.name || 'Unnamed'} v{bestPrompts.function_eval_configs[config.id]!.version} ({bestPrompts.function_eval_configs[config.id]!.average_score.toFixed(2)})
                    </div>
                  )}
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
                disabled={isLoadingMetrics || isRunningGepa !== null}
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
              padding: '0.75rem',
              border: '1px solid var(--border-primary)',
              borderRadius: '0',
              backgroundColor: 'var(--bg-secondary)',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  GEPA OPTIMIZER
                </h3>
                <button
                  onClick={() => {
                    setTempGeneratorTemperature(null);
                    setTempGeneratorMaxTokens(null);
                    setTempReflectionTemperature(null);
                    setTempReflectionMaxTokens(null);
                    setTempMaxMetricCalls(null);
                    setEditingGepaConfigId(null);
                    setShowGepaForm(true);
                  }}
                  disabled={!csvFileId || isRunningGepa !== null}
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: (!csvFileId || isRunningGepa !== null) ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
                    border: `1px solid ${(!csvFileId || isRunningGepa !== null) ? 'var(--border-primary)' : 'var(--accent-primary)'}`,
                    borderRadius: '0',
                    cursor: (!csvFileId || isRunningGepa !== null) ? 'not-allowed' : 'pointer',
                    fontSize: '0.625rem',
                    color: (!csvFileId || isRunningGepa !== null) ? 'var(--text-tertiary)' : 'var(--accent-primary)',
                    fontWeight: '700',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    opacity: (!csvFileId || isRunningGepa !== null) ? 0.5 : 1,
                    transition: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (csvFileId && isRunningGepa === null) {
                      e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                      e.currentTarget.style.outlineOffset = '-2px';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (csvFileId && isRunningGepa === null) {
                      e.currentTarget.style.outline = 'none';
                    }
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
                    const progress = gepaProgress[config.id];
                    const isActuallyRunning = isRunning && progress?.status === 'running';
                    
                    return (
                      <div
                        key={config.id}
                        style={{
                          padding: '0.5rem 0.75rem',
                          border: `1px solid ${isActuallyRunning ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                          borderRadius: '0',
                          backgroundColor: isActuallyRunning ? 'var(--bg-elevated)' : 'var(--bg-elevated)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          transition: 'none',
                          cursor: (isActuallyRunning || isRunningGepa !== null) ? 'default' : 'pointer',
                        }}
                        onClick={(e) => {
                          // Don't open edit if clicking on buttons
                          if ((e.target as HTMLElement).closest('button')) {
                            return;
                          }
                          if (!isActuallyRunning && isRunningGepa === null) {
                            handleEditGepaConfig(config);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (!isActuallyRunning && isRunningGepa === null) {
                            e.currentTarget.style.borderColor = 'var(--accent-primary)';
                            e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                            e.currentTarget.style.outlineOffset = '-2px';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActuallyRunning) {
                            e.currentTarget.style.borderColor = 'var(--border-primary)';
                            e.currentTarget.style.outline = 'none';
                          }
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}>
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
                              disabled={isActuallyRunning || isRunningGepa !== null}
                              style={{
                                padding: '0.25rem 0.5rem',
                                backgroundColor: 'transparent',
                                border: `1px solid ${isActuallyRunning ? 'var(--border-primary)' : 'var(--accent-success)'}`,
                                borderRadius: '0',
                                cursor: (isActuallyRunning || isRunningGepa !== null) ? 'not-allowed' : 'pointer',
                                fontSize: '0.625rem',
                                color: isActuallyRunning ? 'var(--text-tertiary)' : 'var(--accent-success)',
                                fontWeight: '700',
                                fontFamily: 'monospace',
                                textTransform: 'uppercase',
                                opacity: (isActuallyRunning || isRunningGepa !== null) && !isActuallyRunning ? 0.5 : 1,
                                transition: 'none',
                              }}
                              onMouseEnter={(e) => {
                                if (!isActuallyRunning && isRunningGepa === null) {
                                  e.currentTarget.style.outline = '2px solid var(--accent-success)';
                                  e.currentTarget.style.outlineOffset = '-2px';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isActuallyRunning && isRunningGepa === null) {
                                  e.currentTarget.style.outline = 'none';
                                }
                              }}
                            >
                              {isActuallyRunning ? 'RUNNING...' : 'RUN'}
                            </button>
                            <button
                              onClick={() => handleDeleteGepaConfig(config.id)}
                              disabled={isActuallyRunning || isRunningGepa !== null}
                              style={{
                                padding: '0.25rem 0.5rem',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--accent-danger)',
                                borderRadius: '0',
                                cursor: (isRunning || isRunningGepa !== null) ? 'not-allowed' : 'pointer',
                                fontSize: '0.625rem',
                                color: 'var(--accent-danger)',
                                fontWeight: '700',
                                fontFamily: 'monospace',
                                textTransform: 'uppercase',
                                opacity: (isActuallyRunning || isRunningGepa !== null) ? 0.5 : 1,
                                transition: 'none',
                              }}
                              onMouseEnter={(e) => {
                                if (!isActuallyRunning && isRunningGepa === null) {
                                  e.currentTarget.style.outline = '2px solid var(--accent-danger)';
                                  e.currentTarget.style.outlineOffset = '-2px';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isActuallyRunning && isRunningGepa === null) {
                                  e.currentTarget.style.outline = 'none';
                                }
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        
                        {/* Progress visualization */}
                        {progress && (
                          <div style={{
                            padding: '0.5rem',
                            backgroundColor: progress.status === 'error' 
                              ? 'rgba(239, 68, 68, 0.1)' 
                              : progress.status === 'completed'
                              ? 'rgba(34, 197, 94, 0.1)'
                              : 'rgba(59, 130, 246, 0.1)',
                            border: `1px solid ${progress.status === 'error' 
                              ? 'rgba(239, 68, 68, 0.3)' 
                              : progress.status === 'completed'
                              ? 'rgba(34, 197, 94, 0.3)'
                              : 'rgba(59, 130, 246, 0.3)'}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.625rem',
                              color: 'var(--text-tertiary)',
                              fontFamily: 'monospace',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ 
                                  fontWeight: '700',
                                  color: progress.status === 'error' ? '#ef4444' : progress.status === 'completed' ? '#22c55e' : 'var(--accent-primary)'
                                }}>
                                  {progress.status === 'running' ? 'RUNNING' : progress.status.toUpperCase()}
                                </span>
                                {progress.started_at && (
                                  <Timer 
                                    key={progress.started_at}
                                    startTime={progress.started_at} 
                                    updatedAt={progress.updated_at} 
                                    status={progress.status} 
                                  />
                                )}
                              </div>
                              {progress.best_score !== null && (
                                <span>Best: {progress.best_score.toFixed(3)}</span>
                              )}
                            </div>
                            <div style={{
                              fontSize: '0.625rem',
                              color: 'var(--text-primary)',
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                            }}>
                              {progress.message}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
            }} onClick={() => {
              setTempGeneratorTemperature(null);
              setTempGeneratorMaxTokens(null);
              setTempReflectionTemperature(null);
              setTempReflectionMaxTokens(null);
              setTempMaxMetricCalls(null);
              setEditingGepaConfigId(null);
              setShowGepaForm(false);
            }}>
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
                    {editingGepaConfigId ? 'EDIT GEPA CONFIG' : 'CREATE GEPA CONFIG'}
                  </h3>
                  <button
                    onClick={() => {
                      setTempGeneratorTemperature(null);
                      setTempGeneratorMaxTokens(null);
                      setTempReflectionTemperature(null);
                      setTempReflectionMaxTokens(null);
                      setTempMaxMetricCalls(null);
                      setEditingGepaConfigId(null);
                      setShowGepaForm(false);
                    }}
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
                  
                  {/* Generator Model */}
                  <div>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      marginBottom: '0.75rem',
                    }}>
                      GENERATOR MODEL *
                    </div>
                    <div style={{
                      padding: '0.75rem',
                      border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
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
                          MODEL ID
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
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{
                          fontSize: '0.5rem',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                          marginTop: '0.25rem',
                          fontStyle: 'italic',
                        }}>
                          Model you're optimizing for
                        </div>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.75rem',
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
                            TEMPERATURE
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            value={tempGeneratorTemperature !== null ? tempGeneratorTemperature : gepaFormData.generator_temperature}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTempGeneratorTemperature(val);
                              const numVal = parseFloat(val);
                              if (val !== '' && !isNaN(numVal) && numVal >= 0 && numVal <= 2) {
                                setGepaFormData({ ...gepaFormData, generator_temperature: numVal });
                              }
                            }}
                            onBlur={(e) => {
                              const val = e.target.value === '' ? gepaFormData.generator_temperature.toString() : e.target.value;
                              const numVal = parseFloat(val);
                              if (isNaN(numVal) || numVal < 0 || numVal > 2) {
                                setTempGeneratorTemperature(null);
                              } else {
                                setTempGeneratorTemperature(null);
                                setGepaFormData({ ...gepaFormData, generator_temperature: numVal });
                              }
                            }}
                            onFocus={() => setTempGeneratorTemperature(gepaFormData.generator_temperature.toString())}
                            placeholder="1.0"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '0',
                              fontSize: '0.8125rem',
                              fontFamily: 'monospace',
                              backgroundColor: 'var(--bg-elevated)',
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
                            MAX TOKENS
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={tempGeneratorMaxTokens !== null ? tempGeneratorMaxTokens : gepaFormData.generator_max_tokens}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTempGeneratorMaxTokens(val);
                              const numVal = parseInt(val);
                              if (val !== '' && !isNaN(numVal) && numVal >= 1) {
                                setGepaFormData({ ...gepaFormData, generator_max_tokens: numVal });
                              }
                            }}
                            onBlur={(e) => {
                              const val = e.target.value === '' ? gepaFormData.generator_max_tokens.toString() : e.target.value;
                              const numVal = parseInt(val);
                              if (isNaN(numVal) || numVal < 1) {
                                setTempGeneratorMaxTokens(null);
                              } else {
                                setTempGeneratorMaxTokens(null);
                                setGepaFormData({ ...gepaFormData, generator_max_tokens: numVal });
                              }
                            }}
                            onFocus={() => setTempGeneratorMaxTokens(gepaFormData.generator_max_tokens.toString())}
                            placeholder="16384"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '0',
                              fontSize: '0.8125rem',
                              fontFamily: 'monospace',
                              backgroundColor: 'var(--bg-elevated)',
                              color: 'var(--text-primary)',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Reflection Model */}
                  <div>
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      marginBottom: '0.75rem',
                    }}>
                      REFLECTION MODEL
                    </div>
                    <div style={{
                      padding: '0.75rem',
                      border: '1px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
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
                          MODEL ID
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
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            boxSizing: 'border-box',
                          }}
                        />
                        <div style={{
                          fontSize: '0.5rem',
                          color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                          marginTop: '0.25rem',
                          fontStyle: 'italic',
                        }}>
                          Model for meta-prompting (can be different)
                        </div>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.75rem',
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
                            TEMPERATURE
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            value={tempReflectionTemperature !== null ? tempReflectionTemperature : gepaFormData.reflection_temperature}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTempReflectionTemperature(val);
                              const numVal = parseFloat(val);
                              if (val !== '' && !isNaN(numVal) && numVal >= 0 && numVal <= 2) {
                                setGepaFormData({ ...gepaFormData, reflection_temperature: numVal });
                              }
                            }}
                            onBlur={(e) => {
                              const val = e.target.value === '' ? gepaFormData.reflection_temperature.toString() : e.target.value;
                              const numVal = parseFloat(val);
                              if (isNaN(numVal) || numVal < 0 || numVal > 2) {
                                setTempReflectionTemperature(null);
                              } else {
                                setTempReflectionTemperature(null);
                                setGepaFormData({ ...gepaFormData, reflection_temperature: numVal });
                              }
                            }}
                            onFocus={() => setTempReflectionTemperature(gepaFormData.reflection_temperature.toString())}
                            placeholder="1.0"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '0',
                              fontSize: '0.8125rem',
                              fontFamily: 'monospace',
                              backgroundColor: 'var(--bg-elevated)',
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
                            MAX TOKENS
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={tempReflectionMaxTokens !== null ? tempReflectionMaxTokens : gepaFormData.reflection_max_tokens}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTempReflectionMaxTokens(val);
                              const numVal = parseInt(val);
                              if (val !== '' && !isNaN(numVal) && numVal >= 1) {
                                setGepaFormData({ ...gepaFormData, reflection_max_tokens: numVal });
                              }
                            }}
                            onBlur={(e) => {
                              const val = e.target.value === '' ? gepaFormData.reflection_max_tokens.toString() : e.target.value;
                              const numVal = parseInt(val);
                              if (isNaN(numVal) || numVal < 1) {
                                setTempReflectionMaxTokens(null);
                              } else {
                                setTempReflectionMaxTokens(null);
                                setGepaFormData({ ...gepaFormData, reflection_max_tokens: numVal });
                              }
                            }}
                            onFocus={() => setTempReflectionMaxTokens(gepaFormData.reflection_max_tokens.toString())}
                            placeholder="16384"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '0',
                              fontSize: '0.8125rem',
                              fontFamily: 'monospace',
                              backgroundColor: 'var(--bg-elevated)',
                              color: 'var(--text-primary)',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
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
                      value={tempMaxMetricCalls !== null ? tempMaxMetricCalls : gepaFormData.max_metric_calls}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTempMaxMetricCalls(val);
                        const numVal = parseInt(val);
                        if (val !== '' && !isNaN(numVal) && numVal >= 1) {
                          setGepaFormData({ ...gepaFormData, max_metric_calls: numVal });
                        }
                      }}
                      onBlur={(e) => {
                        const val = e.target.value === '' ? gepaFormData.max_metric_calls.toString() : e.target.value;
                        const numVal = parseInt(val);
                        if (isNaN(numVal) || numVal < 1) {
                          setTempMaxMetricCalls(null);
                        } else {
                          setTempMaxMetricCalls(null);
                          setGepaFormData({ ...gepaFormData, max_metric_calls: numVal });
                        }
                      }}
                      onFocus={() => setTempMaxMetricCalls(gepaFormData.max_metric_calls.toString())}
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
                      onClick={() => {
                        setTempGeneratorTemperature(null);
                        setTempGeneratorMaxTokens(null);
                        setTempReflectionTemperature(null);
                        setTempReflectionMaxTokens(null);
                        setTempMaxMetricCalls(null);
                        setShowGepaForm(false);
                      }}
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
                      onClick={handleSaveGepaConfig}
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
                      {isSavingGepaConfig ? 'SAVING...' : (editingGepaConfigId ? 'SAVE' : 'CREATE')}
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
