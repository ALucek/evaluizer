import { useState, useCallback, useRef } from 'react';
import { 
  JudgeConfig, 
  JudgeResult, 
  listJudgeConfigs, 
  createJudgeConfig, 
  updateJudgeConfig, 
  deleteJudgeConfig, 
  getJudgeResultsForCSV, 
  runJudge, 
  deleteJudgeResult, 
  deleteJudgeResultsForConfig,
  getEvaluationsForCSV,
  Evaluation,
  CSVDataWithRows,
  Prompt
} from '../services/api';
import { LLMConfig } from '../components/PromptEditor';

interface UseJudgesReturn {
  judgeConfigs: JudgeConfig[];
  judgeResults: JudgeResult[];
  latestJudgeResult: JudgeResult | null;
  isRunningJudge: boolean;
  runningJudgeConfigId: number | null;
  runningJudgeCells: Set<string>;
  isCancellingJudge: boolean;
  loadJudgeConfigs: (csvFileId: number) => Promise<void>;
  loadJudgeResults: (csvFileId: number, promptId: number | null) => Promise<void>;
  handleCreateJudgeConfig: (name: string, prompt: string, llmConfig: LLMConfig) => Promise<JudgeConfig>;
  handleUpdateJudgeConfig: (id: number, partial: { name?: string; prompt?: string; model?: string; temperature?: number; maxTokens?: number }) => Promise<void>;
  handleDeleteJudgeConfig: (id: number) => Promise<void>;
  handleRunJudgeForRow: (configId: number, rowId: number) => Promise<void>;
  handleRunJudgeForAllRows: (configId: number, concurrency?: number) => Promise<void>;
  handleRunJudgeForUnfilledRows: (configId: number, concurrency?: number) => Promise<void>;
  handleCancelJudge: () => void;
  handleClearJudgeForRow: (configId: number, rowId: number) => Promise<void>;
  handleClearJudgeForAllRows: (configId: number) => Promise<void>;
  setJudgeConfigs: React.Dispatch<React.SetStateAction<JudgeConfig[]>>;
}

export function useJudges(
  selectedFileId: number | null,
  currentPrompt: Prompt | null,
  csvData: CSVDataWithRows | null,
  setErrorWithTimestamp: (errorMessage: string | null) => void
): UseJudgesReturn {
  const [judgeConfigs, setJudgeConfigs] = useState<JudgeConfig[]>([]);
  const [judgeResults, setJudgeResults] = useState<JudgeResult[]>([]);
  const [latestJudgeResult, setLatestJudgeResult] = useState<JudgeResult | null>(null);
  const [isRunningJudge, setIsRunningJudge] = useState(false);
  const [runningJudgeConfigId, setRunningJudgeConfigId] = useState<number | null>(null);
  const [runningJudgeCells, setRunningJudgeCells] = useState<Set<string>>(new Set());
  const [isCancellingJudge, setIsCancellingJudge] = useState(false);
  const judgeCancellationRef = useRef<boolean>(false);

  const loadJudgeConfigs = useCallback(async (csvFileId: number) => {
    try {
      const configs = await listJudgeConfigs(csvFileId);
      setJudgeConfigs(configs);
    } catch (err) {
      console.error('Failed to load judge configs:', err);
      setJudgeConfigs([]);
    }
  }, []);

  const loadJudgeResults = useCallback(async (csvFileId: number, promptId: number | null) => {
    if (!promptId) {
      setJudgeResults([]);
      return;
    }
    try {
      const results = await getJudgeResultsForCSV(csvFileId, promptId);
      setJudgeResults(results);
    } catch (err) {
      console.error('Failed to load judge results:', err);
      setJudgeResults([]);
    }
  }, []);

  const handleCreateJudgeConfig = useCallback(async (name: string, prompt: string, llmConfig: LLMConfig): Promise<JudgeConfig> => {
    if (!selectedFileId) {
      throw new Error('No CSV file selected');
    }
    try {
      const config = await createJudgeConfig(selectedFileId, name, prompt, {
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
      });
      await loadJudgeConfigs(selectedFileId);
      setErrorWithTimestamp(null);
      return config;
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to create judge config');
      throw err;
    }
  }, [selectedFileId, loadJudgeConfigs, setErrorWithTimestamp]);

  const handleUpdateJudgeConfig = useCallback(async (id: number, partial: { name?: string; prompt?: string; model?: string; temperature?: number; maxTokens?: number }) => {
    if (!selectedFileId) return;
    try {
      await updateJudgeConfig(id, partial);
      await loadJudgeConfigs(selectedFileId);
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update judge config');
      throw err;
    }
  }, [selectedFileId, loadJudgeConfigs, setErrorWithTimestamp]);

  const handleDeleteJudgeConfig = useCallback(async (id: number) => {
    if (!selectedFileId) return;
    try {
      await deleteJudgeConfig(id);
      await loadJudgeConfigs(selectedFileId);
      // Also reload results as they are cascaded deleted
      if (currentPrompt?.id) {
          await loadJudgeResults(selectedFileId, currentPrompt.id);
      } else {
          setJudgeResults([]);
      }
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to delete judge config');
      throw err;
    }
  }, [selectedFileId, currentPrompt, loadJudgeConfigs, loadJudgeResults, setErrorWithTimestamp]);

  const handleRunJudgeForRow = useCallback(async (configId: number, rowId: number) => {
    if (!currentPrompt?.id) {
      setErrorWithTimestamp('No prompt selected');
      return;
    }
    const cellKey = `${configId}-${rowId}`;
    try {
      setRunningJudgeCells(prev => new Set(prev).add(cellKey));
      const result = await runJudge({ configId, csvRowId: rowId, promptId: currentPrompt.id });
      setLatestJudgeResult(result);
      setJudgeResults(prev => {
        const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
        return [...next, result];
      });
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run judge evaluation');
    } finally {
      setRunningJudgeCells(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  }, [currentPrompt, setErrorWithTimestamp]);

  const handleRunJudgeForAllRows = useCallback(async (configId: number, concurrency: number = 10) => {
    if (!selectedFileId || !csvData || !currentPrompt?.id) return;
    
    judgeCancellationRef.current = false;
    setIsRunningJudge(true);
    setRunningJudgeConfigId(configId);

    let hadErrors = false;

    try {
      // Get evaluations and judge results to check what already exists
      const evaluations = await getEvaluationsForCSV(selectedFileId, currentPrompt.id);
      const freshJudgeResults = await getJudgeResultsForCSV(selectedFileId, currentPrompt.id);
      
      const evaluationsByRowId = new Map<number, Evaluation>();
      evaluations.forEach(evaluation => {
        evaluationsByRowId.set(evaluation.csv_row_id, evaluation);
      });

      // Only run for rows with outputs that don't have judge results yet
      const validRowIds = csvData.rows
        .filter(row => {
          const evaluation = evaluationsByRowId.get(row.id);
          const output = evaluation?.output;
          const hasOutput = output !== null && output !== undefined && output !== '';
          
          // Check if this row already has a judge result for this config
          const hasJudgeResult = freshJudgeResults.some(
            r => r.config_id === configId && r.csv_row_id === row.id && r.prompt_id === currentPrompt.id
          );
          
          return hasOutput && !hasJudgeResult;
        })
        .map(row => row.id);

      if (validRowIds.length === 0) {
        setErrorWithTimestamp('All rows with outputs already have judge results for this configuration');
        return;
      }

      const config = judgeConfigs.find(c => c.id === configId);
      if (!config) {
        throw new Error('Judge config not found');
      }

      const concurrencyLimit = concurrency || 10;
      const batches: number[][] = [];
      
      for (let i = 0; i < validRowIds.length; i += concurrencyLimit) {
        batches.push(validRowIds.slice(i, i + concurrencyLimit));
      }

      for (const batch of batches) {
        if (judgeCancellationRef.current) break;
        
        const batchPromises = batch.map(async (rowId) => {
          const cellKey = `${configId}-${rowId}`;
          setRunningJudgeCells(prev => new Set(prev).add(cellKey));
          
          if (judgeCancellationRef.current) {
            setRunningJudgeCells(prev => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
            return { success: false, rowId, error: new Error('Cancelled') };
          }
          
          try {
            const result = await runJudge({ configId, csvRowId: rowId, promptId: currentPrompt.id });
            setTimeout(() => {
              setLatestJudgeResult(result);
              setJudgeResults(prev => {
                const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
                return [...next, result];
              });
              setRunningJudgeCells(prev => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
              });
            }, 0);
            return { success: true, rowId, result };
          } catch (err) {
            setRunningJudgeCells(prev => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
            if (!judgeCancellationRef.current) {
              hadErrors = true;
              const errorMessage = err instanceof Error ? err.message : `Failed to run judge for row ${rowId}`;
              setErrorWithTimestamp(errorMessage);
            }
            return { success: false, rowId, error: err };
          }
        });

        await Promise.allSettled(batchPromises);
        
        if (judgeCancellationRef.current) break;
      }
    } catch (err) {
      hadErrors = true;
      if (!judgeCancellationRef.current) {
        setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run judge evaluations');
      }
    } finally {
      setIsRunningJudge(false);
      setRunningJudgeConfigId(null);
      setIsCancellingJudge(false);
      judgeCancellationRef.current = false;
      if (!hadErrors && !judgeCancellationRef.current) {
        setErrorWithTimestamp(null);
      }
      setTimeout(() => {
        setLatestJudgeResult(null);
      }, 100);
    }
  }, [selectedFileId, csvData, currentPrompt, judgeConfigs, setErrorWithTimestamp]);

  const handleRunJudgeForUnfilledRows = useCallback(async (configId: number, concurrency: number = 10) => {
    if (!selectedFileId || !csvData || !currentPrompt?.id) return;
    
    judgeCancellationRef.current = false;
    setIsRunningJudge(true);
    setRunningJudgeConfigId(configId);

    let hadErrors = false;

    try {
      // Get evaluations and judge results
      const evaluations = await getEvaluationsForCSV(selectedFileId, currentPrompt.id);
      const freshJudgeResults = await getJudgeResultsForCSV(selectedFileId, currentPrompt.id);
      
      const evaluationsByRowId = new Map<number, Evaluation>();
      evaluations.forEach(evaluation => {
        evaluationsByRowId.set(evaluation.csv_row_id, evaluation);
      });

      // Find rows that have outputs but no judge results for this config
      const unfilledRowIds = csvData.rows
        .filter(row => {
          const evaluation = evaluationsByRowId.get(row.id);
          const output = evaluation?.output;
          const hasOutput = output !== null && output !== undefined && output !== '';
          
          // Check if this row already has a judge result for this config
          const hasJudgeResult = freshJudgeResults.some(
            r => r.config_id === configId && r.csv_row_id === row.id && r.prompt_id === currentPrompt.id
          );
          
          return hasOutput && !hasJudgeResult;
        })
        .map(row => row.id);

      if (unfilledRowIds.length === 0) {
        setErrorWithTimestamp('All rows with outputs already have judge results');
        return;
      }

      const config = judgeConfigs.find(c => c.id === configId);
      if (!config) {
        throw new Error('Judge config not found');
      }

      const concurrencyLimit = concurrency || 10;
      const batches: number[][] = [];
      
      for (let i = 0; i < unfilledRowIds.length; i += concurrencyLimit) {
        batches.push(unfilledRowIds.slice(i, i + concurrencyLimit));
      }

      for (const batch of batches) {
        if (judgeCancellationRef.current) break;
        
        const batchPromises = batch.map(async (rowId) => {
          const cellKey = `${configId}-${rowId}`;
          setRunningJudgeCells(prev => new Set(prev).add(cellKey));
          
          if (judgeCancellationRef.current) {
            setRunningJudgeCells(prev => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
            return { success: false, rowId, error: new Error('Cancelled') };
          }
          
          try {
            const result = await runJudge({ configId, csvRowId: rowId, promptId: currentPrompt.id });
            setTimeout(() => {
              setLatestJudgeResult(result);
              setJudgeResults(prev => {
                const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
                return [...next, result];
              });
              setRunningJudgeCells(prev => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
              });
            }, 0);
            return { success: true, rowId, result };
          } catch (err) {
            setRunningJudgeCells(prev => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
            if (!judgeCancellationRef.current) {
              hadErrors = true;
              const errorMessage = err instanceof Error ? err.message : `Failed to run judge for row ${rowId}`;
              setErrorWithTimestamp(errorMessage);
            }
            return { success: false, rowId, error: err };
          }
        });

        await Promise.allSettled(batchPromises);
        
        if (judgeCancellationRef.current) break;
      }
    } catch (err) {
      hadErrors = true;
      if (!judgeCancellationRef.current) {
        setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run judge evaluations');
      }
    } finally {
      setIsRunningJudge(false);
      setRunningJudgeConfigId(null);
      setIsCancellingJudge(false);
      judgeCancellationRef.current = false;
      if (!hadErrors && !judgeCancellationRef.current) {
        setErrorWithTimestamp(null);
      }
      setTimeout(() => {
        setLatestJudgeResult(null);
      }, 100);
    }
  }, [selectedFileId, csvData, currentPrompt, judgeConfigs, setErrorWithTimestamp]);

  const handleCancelJudge = useCallback(() => {
    judgeCancellationRef.current = true;
    setIsCancellingJudge(true);
  }, []);

  const handleClearJudgeForRow = useCallback(async (configId: number, rowId: number) => {
    if (!currentPrompt?.id) {
      setErrorWithTimestamp('No prompt selected');
      return;
    }
    try {
      await deleteJudgeResult(configId, rowId, currentPrompt.id);
      setJudgeResults(prev => prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id)));
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear judge result');
    }
  }, [currentPrompt, setErrorWithTimestamp]);

  const handleClearJudgeForAllRows = useCallback(async (configId: number) => {
    if (!selectedFileId || !currentPrompt?.id) return;
    try {
      await deleteJudgeResultsForConfig(configId, currentPrompt.id);
      await loadJudgeResults(selectedFileId, currentPrompt.id);
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear judge results');
    }
  }, [selectedFileId, currentPrompt, loadJudgeResults, setErrorWithTimestamp]);

  return {
    judgeConfigs,
    judgeResults,
    latestJudgeResult,
    isRunningJudge,
    runningJudgeConfigId,
    runningJudgeCells,
    isCancellingJudge,
    loadJudgeConfigs,
    loadJudgeResults,
    handleCreateJudgeConfig,
    handleUpdateJudgeConfig,
    handleDeleteJudgeConfig,
    handleRunJudgeForRow,
    handleRunJudgeForAllRows,
    handleRunJudgeForUnfilledRows,
    handleCancelJudge,
    handleClearJudgeForRow,
    handleClearJudgeForAllRows,
    setJudgeConfigs,
  };
}

