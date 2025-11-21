import { useState, useCallback } from 'react';
import { 
  FunctionEvalConfig, 
  FunctionEvalResult, 
  listFunctionEvalConfigs, 
  createFunctionEvalConfig, 
  updateFunctionEvalConfig, 
  deleteFunctionEvalConfig, 
  getFunctionEvalResultsForCSV, 
  runFunctionEval, 
  deleteFunctionEvalResult, 
  deleteFunctionEvalResultsForConfig,
  getEvaluationsForCSV,
  Evaluation,
  CSVDataWithRows,
  Prompt
} from '../services/api';

interface UseFunctionEvalsReturn {
  functionEvalConfigs: FunctionEvalConfig[];
  functionEvalResults: FunctionEvalResult[];
  latestFunctionEvalResult: FunctionEvalResult | null;
  loadFunctionEvalConfigs: (csvFileId: number) => Promise<void>;
  loadFunctionEvalResults: (csvFileId: number, promptId: number | null) => Promise<void>;
  handleCreateFunctionEvalConfig: (functionName: string, config?: Record<string, any>) => Promise<FunctionEvalConfig>;
  handleUpdateFunctionEvalConfig: (id: number, partial: { name?: string; config?: Record<string, any> }) => Promise<void>;
  handleDeleteFunctionEvalConfig: (id: number) => Promise<void>;
  handleRunFunctionEvalForRow: (configId: number, rowId: number) => Promise<void>;
  handleRunFunctionEvalForAllRows: (configId: number, concurrency?: number) => Promise<void>;
  handleRunFunctionEvalForUnfilledRows: (configId: number, concurrency?: number) => Promise<void>;
  handleClearFunctionEvalForRow: (configId: number, rowId: number) => Promise<void>;
  handleClearFunctionEvalForAllRows: (configId: number) => Promise<void>;
  setFunctionEvalConfigs: React.Dispatch<React.SetStateAction<FunctionEvalConfig[]>>;
  setFunctionEvalResults: React.Dispatch<React.SetStateAction<FunctionEvalResult[]>>;
}

export function useFunctionEvals(
  selectedFileId: number | null,
  currentPrompt: Prompt | null,
  csvData: CSVDataWithRows | null,
  setErrorWithTimestamp: (errorMessage: string | null) => void
): UseFunctionEvalsReturn {
  const [functionEvalConfigs, setFunctionEvalConfigs] = useState<FunctionEvalConfig[]>([]);
  const [functionEvalResults, setFunctionEvalResults] = useState<FunctionEvalResult[]>([]);
  const [latestFunctionEvalResult, setLatestFunctionEvalResult] = useState<FunctionEvalResult | null>(null);

  const loadFunctionEvalConfigs = useCallback(async (csvFileId: number) => {
    try {
      const configs = await listFunctionEvalConfigs(csvFileId);
      setFunctionEvalConfigs(configs);
    } catch (err) {
      console.error('Failed to load function eval configs:', err);
      setFunctionEvalConfigs([]);
    }
  }, []);

  const loadFunctionEvalResults = useCallback(async (csvFileId: number, promptId: number | null) => {
    if (!promptId) {
      setFunctionEvalResults([]);
      return;
    }
    try {
      const results = await getFunctionEvalResultsForCSV(csvFileId, promptId);
      setFunctionEvalResults(results);
    } catch (err) {
      console.error('Failed to load function eval results:', err);
      setFunctionEvalResults([]);
    }
  }, []);

  const handleCreateFunctionEvalConfig = useCallback(async (functionName: string, config?: Record<string, any>): Promise<FunctionEvalConfig> => {
    if (!selectedFileId) {
      throw new Error('No CSV file selected');
    }
    try {
      const created = await createFunctionEvalConfig(selectedFileId, functionName, functionName, config);
      await loadFunctionEvalConfigs(selectedFileId);
      setErrorWithTimestamp(null);
      return created;
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to create function eval config');
      throw err;
    }
  }, [selectedFileId, loadFunctionEvalConfigs, setErrorWithTimestamp]);

  const handleUpdateFunctionEvalConfig = useCallback(async (id: number, partial: { name?: string; config?: Record<string, any> }) => {
    if (!selectedFileId) return;
    try {
      await updateFunctionEvalConfig(id, partial);
      await loadFunctionEvalConfigs(selectedFileId);
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update function eval config');
      throw err;
    }
  }, [selectedFileId, loadFunctionEvalConfigs, setErrorWithTimestamp]);

  const handleDeleteFunctionEvalConfig = useCallback(async (id: number) => {
    if (!selectedFileId) return;
    try {
      await deleteFunctionEvalConfig(id);
      await loadFunctionEvalConfigs(selectedFileId);
      if (currentPrompt?.id) {
          await loadFunctionEvalResults(selectedFileId, currentPrompt.id);
      } else {
          setFunctionEvalResults([]);
      }
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to delete function eval config');
      throw err;
    }
  }, [selectedFileId, currentPrompt, loadFunctionEvalConfigs, loadFunctionEvalResults, setErrorWithTimestamp]);

  const handleRunFunctionEvalForRow = useCallback(async (configId: number, rowId: number) => {
    if (!currentPrompt?.id) {
      setErrorWithTimestamp('No prompt selected');
      return;
    }
    try {
      const result = await runFunctionEval(configId, rowId, currentPrompt.id);
      setLatestFunctionEvalResult(result);
      setFunctionEvalResults(prev => {
        const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
        return [...next, result];
      });
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run function evaluation');
    }
  }, [currentPrompt, setErrorWithTimestamp]);

  const handleRunFunctionEvalForAllRows = useCallback(async (configId: number, concurrency: number = 10) => {
    if (!selectedFileId || !csvData || !currentPrompt?.id) return;
    
    try {
      // Get evaluations and function eval results to check what already exists
      const evaluations = await getEvaluationsForCSV(selectedFileId, currentPrompt.id);
      const freshFunctionEvalResults = await getFunctionEvalResultsForCSV(selectedFileId, currentPrompt.id);
      
      const evaluationsByRowId = new Map<number, Evaluation>();
      evaluations.forEach(evaluation => {
        evaluationsByRowId.set(evaluation.csv_row_id, evaluation);
      });

      // Only run for rows with outputs that don't have function eval results yet
      const validRowIds = csvData.rows
        .filter(row => {
          const evaluation = evaluationsByRowId.get(row.id);
          const output = evaluation?.output;
          const hasOutput = output !== null && output !== undefined && output !== '';
          
          // Check if this row already has a function eval result for this config
          const hasFunctionEvalResult = freshFunctionEvalResults.some(
            r => r.config_id === configId && r.csv_row_id === row.id && r.prompt_id === currentPrompt.id
          );
          
          return hasOutput && !hasFunctionEvalResult;
        })
        .map(row => row.id);

      if (validRowIds.length === 0) {
        setErrorWithTimestamp('All rows with outputs already have function eval results for this configuration');
        return;
      }

      const config = functionEvalConfigs.find(c => c.id === configId);
      if (!config) {
        throw new Error('Function eval config not found');
      }

      const concurrencyLimit = concurrency || 10;
      const batches: number[][] = [];
      
      for (let i = 0; i < validRowIds.length; i += concurrencyLimit) {
        batches.push(validRowIds.slice(i, i + concurrencyLimit));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async (rowId) => {
          try {
            const result = await runFunctionEval(configId, rowId, currentPrompt.id);
            setTimeout(() => {
              setLatestFunctionEvalResult(result);
              setFunctionEvalResults(prev => {
                const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
                return [...next, result];
              });
            }, 0);
            return { success: true, rowId, result };
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to run function eval for row ${rowId}`;
            setErrorWithTimestamp(errorMessage);
            return { success: false, rowId, error: err };
          }
        });

        await Promise.allSettled(batchPromises);
      }
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run function evaluations');
    } finally {
      setTimeout(() => {
        setLatestFunctionEvalResult(null);
      }, 100);
    }
  }, [selectedFileId, csvData, currentPrompt, functionEvalConfigs, setErrorWithTimestamp]);

  const handleRunFunctionEvalForUnfilledRows = useCallback(async (configId: number, concurrency: number = 10) => {
    if (!selectedFileId || !csvData || !currentPrompt?.id) return;
    
    try {
      // Get evaluations and function eval results
      const evaluations = await getEvaluationsForCSV(selectedFileId, currentPrompt.id);
      const freshFunctionEvalResults = await getFunctionEvalResultsForCSV(selectedFileId, currentPrompt.id);
      
      const evaluationsByRowId = new Map<number, Evaluation>();
      evaluations.forEach(evaluation => {
        evaluationsByRowId.set(evaluation.csv_row_id, evaluation);
      });

      // Find rows that have outputs but no function eval results for this config
      const unfilledRowIds = csvData.rows
        .filter(row => {
          const evaluation = evaluationsByRowId.get(row.id);
          const output = evaluation?.output;
          const hasOutput = output !== null && output !== undefined && output !== '';
          
          // Check if this row already has a function eval result for this config
          const hasFunctionEvalResult = freshFunctionEvalResults.some(
            r => r.config_id === configId && r.csv_row_id === row.id && r.prompt_id === currentPrompt.id
          );
          
          return hasOutput && !hasFunctionEvalResult;
        })
        .map(row => row.id);

      if (unfilledRowIds.length === 0) {
        setErrorWithTimestamp('All rows with outputs already have function eval results');
        return;
      }

      const config = functionEvalConfigs.find(c => c.id === configId);
      if (!config) {
        throw new Error('Function eval config not found');
      }

      const concurrencyLimit = concurrency || 10;
      const batches: number[][] = [];
      
      for (let i = 0; i < unfilledRowIds.length; i += concurrencyLimit) {
        batches.push(unfilledRowIds.slice(i, i + concurrencyLimit));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async (rowId) => {
          try {
            const result = await runFunctionEval(configId, rowId, currentPrompt.id);
            setTimeout(() => {
              setLatestFunctionEvalResult(result);
              setFunctionEvalResults(prev => {
                const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
                return [...next, result];
              });
            }, 0);
            return { success: true, rowId, result };
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to run function eval for row ${rowId}`;
            setErrorWithTimestamp(errorMessage);
            return { success: false, rowId, error: err };
          }
        });

        await Promise.allSettled(batchPromises);
      }
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run function evaluations');
    } finally {
      setTimeout(() => {
        setLatestFunctionEvalResult(null);
      }, 100);
    }
  }, [selectedFileId, csvData, currentPrompt, functionEvalConfigs, setErrorWithTimestamp]);

  const handleClearFunctionEvalForRow = useCallback(async (configId: number, rowId: number) => {
    if (!currentPrompt?.id) {
      setErrorWithTimestamp('No prompt selected');
      return;
    }
    try {
      await deleteFunctionEvalResult(configId, rowId, currentPrompt.id);
      setFunctionEvalResults(prev => prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id)));
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear function eval result');
    }
  }, [currentPrompt, setErrorWithTimestamp]);

  const handleClearFunctionEvalForAllRows = useCallback(async (configId: number) => {
    if (!selectedFileId || !currentPrompt?.id) return;
    try {
      await deleteFunctionEvalResultsForConfig(configId, currentPrompt.id);
      await loadFunctionEvalResults(selectedFileId, currentPrompt.id);
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear function eval results');
    }
  }, [selectedFileId, currentPrompt, loadFunctionEvalResults, setErrorWithTimestamp]);

  return {
    functionEvalConfigs,
    functionEvalResults,
    latestFunctionEvalResult,
    loadFunctionEvalConfigs,
    loadFunctionEvalResults,
    handleCreateFunctionEvalConfig,
    handleUpdateFunctionEvalConfig,
    handleDeleteFunctionEvalConfig,
    handleRunFunctionEvalForRow,
    handleRunFunctionEvalForAllRows,
    handleRunFunctionEvalForUnfilledRows,
    handleClearFunctionEvalForRow,
    handleClearFunctionEvalForAllRows,
    setFunctionEvalConfigs,
    setFunctionEvalResults,
  };
}

