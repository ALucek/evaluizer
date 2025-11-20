import { useState, useCallback, useRef, startTransition } from 'react';
import { 
  Evaluation, 
  CSVDataWithRows,
  Prompt,
  runPrompt,
  updateEvaluation,
  getEvaluationsForCSV,
  deleteJudgeResultsForConfig,
  deleteFunctionEvalResultsForConfig
} from '../services/api';
import { LLMConfig } from '../components/PromptEditor';
import { JudgeConfig, FunctionEvalConfig } from '../services/api';

interface UseEvaluationsReturn {
  evaluations: Evaluation[];
  latestEvaluation: Evaluation | null;
  isRunning: boolean;
  isRunningAll: boolean;
  isCancelling: boolean;
  setEvaluations: React.Dispatch<React.SetStateAction<Evaluation[]>>;
  setLatestEvaluation: React.Dispatch<React.SetStateAction<Evaluation | null>>;
  setIsRunning: (isRunning: boolean) => void;
  setIsRunningGepa: (isRunning: boolean) => void;
  isRunningGepa: boolean;
  clearAllOutputs: boolean;
  loadEvaluations: (csvFileId: number, promptId: number | null) => Promise<void>;
  handleUpdateRow: (rowId: number, annotation?: number | null, feedback?: string) => Promise<void>;
  handleRunPrompt: (rowIds: number[], clearOutputsFirst?: boolean) => Promise<void>;
  handleRunAll: () => Promise<void>;
  handleCancel: () => void;
  handleClearAllOutputs: () => Promise<void>;
}

export function useEvaluations(
  selectedFileId: number | null,
  csvData: CSVDataWithRows | null,
  currentPrompt: Prompt | null,
  currentSystemPrompt: string,
  currentUserMessageColumn: string | null,
  llmConfig: LLMConfig,
  judgeConfigs: JudgeConfig[],
  functionEvalConfigs: FunctionEvalConfig[],
  loadJudgeResults: (csvFileId: number, promptId: number | null) => Promise<void>,
  loadFunctionEvalResults: (csvFileId: number, promptId: number | null) => Promise<void>,
  setErrorWithTimestamp: (errorMessage: string | null) => void
): UseEvaluationsReturn {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [latestEvaluation, setLatestEvaluation] = useState<Evaluation | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRunningGepa, setIsRunningGepa] = useState(false);
  const [clearAllOutputs, setClearAllOutputs] = useState(false);
  const cancellationRef = useRef<boolean>(false);

  const loadEvaluations = useCallback(async (csvFileId: number, promptId: number | null) => {
    if (!promptId) {
      setEvaluations([]);
      return;
    }
    try {
      const evals = await getEvaluationsForCSV(csvFileId, promptId);
      setEvaluations(evals);
    } catch (err) {
      console.error('Failed to load evaluations:', err);
      setEvaluations([]);
    }
  }, []);

  const handleUpdateRow = useCallback(async (rowId: number, annotation?: number | null, feedback?: string) => {
    if (!selectedFileId || !currentPrompt?.id) return;
    
    const optimisticAnnotation = annotation !== undefined ? annotation : undefined;
    const optimisticFeedback = feedback !== undefined ? feedback : undefined;
    
    try {
      setEvaluations(prev => {
        const index = prev.findIndex(e => e.csv_row_id === rowId && e.prompt_id === currentPrompt.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { 
            ...updated[index], 
            annotation: optimisticAnnotation !== undefined ? optimisticAnnotation : updated[index].annotation,
            feedback: optimisticFeedback !== undefined ? optimisticFeedback : updated[index].feedback 
          };
          return updated;
        }
        const newEval: Evaluation = {
          id: 0,
          csv_file_id: selectedFileId,
          csv_row_id: rowId,
          prompt_id: currentPrompt.id,
          output: null,
          annotation: optimisticAnnotation !== undefined ? optimisticAnnotation : null,
          feedback: optimisticFeedback !== undefined ? optimisticFeedback : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return [...prev, newEval];
      });
      
      await updateEvaluation(rowId, currentPrompt.id, undefined, annotation, feedback);
      
      setTimeout(async () => {
        await loadEvaluations(selectedFileId, currentPrompt.id);
      }, 100);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update row');
      if (selectedFileId && currentPrompt?.id) {
        await loadEvaluations(selectedFileId, currentPrompt.id);
      }
    }
  }, [selectedFileId, currentPrompt, loadEvaluations, setErrorWithTimestamp]);

  const handleRunPrompt = useCallback(async (rowIds: number[], clearOutputsFirst: boolean = false) => {
    if (!selectedFileId || !csvData || !currentPrompt) return;
    
    const systemPromptToUse = currentSystemPrompt || currentPrompt.system_prompt || '';
    const userMessageColumnToUse = currentUserMessageColumn !== null ? currentUserMessageColumn : currentPrompt.user_message_column;

    const isAllRows = clearOutputsFirst && rowIds.length === csvData.rows.length;
    
    cancellationRef.current = false;
    
    setIsRunning(true);
    setIsRunningAll(isAllRows);
    setLatestEvaluation(null);

    let hadErrors = false;

    try {
      if (clearOutputsFirst) {
        if (cancellationRef.current) return;
        
        setClearAllOutputs(true);
        
        const clearPromises = rowIds.map(rowId => 
          updateEvaluation(rowId, currentPrompt.id, "", null, null)
        );
        await Promise.all(clearPromises);
        
        setTimeout(() => {
          setClearAllOutputs(false);
        }, 100);
      }

      const concurrencyLimit = llmConfig.concurrency || 10;
      const batches: number[][] = [];
      
      for (let i = 0; i < rowIds.length; i += concurrencyLimit) {
        batches.push(rowIds.slice(i, i + concurrencyLimit));
      }

      for (const batch of batches) {
        if (cancellationRef.current) break;
        
        const batchPromises = batch.map(async (rowId) => {
          if (cancellationRef.current) {
            return { success: false, rowId, error: new Error('Cancelled') };
          }
          
          try {
            const evaluation = await runPrompt({
              promptId: currentPrompt.id,
              csvRowId: rowId,
              model: llmConfig.model,
              temperature: llmConfig.temperature,
              maxTokens: llmConfig.maxTokens,
              systemPrompt: systemPromptToUse,
              userMessageColumn: userMessageColumnToUse,
            });
            
            startTransition(() => {
              setLatestEvaluation(evaluation);
            });
            
            return { success: true, rowId, evaluation };
          } catch (err) {
            if (cancellationRef.current) {
              return { success: false, rowId, error: new Error('Cancelled') };
            }
            hadErrors = true;
            const errorMessage = err instanceof Error ? err.message : `Failed to run prompt for row ${rowId}`;
            setErrorWithTimestamp(errorMessage);
            return { success: false, rowId, error: err };
          }
        });

        await Promise.allSettled(batchPromises);
        
        if (cancellationRef.current) break;
      }
    } catch (err) {
      hadErrors = true;
      if (!cancellationRef.current) {
        setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run prompts');
      }
    } finally {
      setIsRunning(false);
      setIsRunningAll(false);
      setIsCancelling(false);
      cancellationRef.current = false;
      if (!hadErrors && !cancellationRef.current) {
        setErrorWithTimestamp(null);
      }
      if (selectedFileId && currentPrompt?.id) {
        await loadEvaluations(selectedFileId, currentPrompt.id);
      }
      setTimeout(() => {
        setLatestEvaluation(null);
      }, 100);
    }
  }, [selectedFileId, csvData, currentPrompt, currentSystemPrompt, currentUserMessageColumn, llmConfig, loadEvaluations, setErrorWithTimestamp]);

  const handleRunAll = useCallback(async () => {
    if (!csvData || csvData.rows.length === 0) {
      setErrorWithTimestamp('No rows to run');
      return;
    }
    
    if (!selectedFileId || !currentPrompt?.id) return;
    
    const allRowIds = csvData.rows.map(row => row.id);
    
    if (judgeConfigs.length > 0) {
      await Promise.allSettled(
        judgeConfigs.map(config => 
          deleteJudgeResultsForConfig(config.id, currentPrompt.id).catch((err: any) => {
            console.error(`Error clearing judge results for config ${config.id}:`, err);
          })
        )
      );
      await loadJudgeResults(selectedFileId, currentPrompt.id);
    }
    
    if (functionEvalConfigs.length > 0) {
      await Promise.allSettled(
        functionEvalConfigs.map(config => 
          deleteFunctionEvalResultsForConfig(config.id, currentPrompt.id).catch((err: any) => {
            console.error(`Error clearing function eval results for config ${config.id}:`, err);
          })
        )
      );
      await loadFunctionEvalResults(selectedFileId, currentPrompt.id);
    }
    
    await handleRunPrompt(allRowIds, true);
  }, [csvData, selectedFileId, currentPrompt, judgeConfigs, functionEvalConfigs, handleRunPrompt, loadJudgeResults, loadFunctionEvalResults, setErrorWithTimestamp]);

  const handleCancel = useCallback(() => {
    cancellationRef.current = true;
    setIsCancelling(true);
  }, []);

  const handleClearAllOutputs = useCallback(async () => {
    if (!csvData || !selectedFileId || !currentPrompt?.id) {
      if (!currentPrompt?.id) setErrorWithTimestamp('No prompt selected');
      return;
    }
    
    try {
      const allRowIds = csvData.rows.map(row => row.id);
      
      setClearAllOutputs(true);
      
      const clearPromises = allRowIds.map(rowId => 
        updateEvaluation(rowId, currentPrompt.id, "", null, null)
      );
      await Promise.all(clearPromises);
      
      if (judgeConfigs.length > 0) {
        await Promise.allSettled(
          judgeConfigs.map(config => 
            deleteJudgeResultsForConfig(config.id, currentPrompt.id).catch((err: any) => {
              console.error(`Error clearing judge results for config ${config.id}:`, err);
            })
          )
        );
        await loadJudgeResults(selectedFileId, currentPrompt.id);
      }
      
      if (functionEvalConfigs.length > 0) {
        await Promise.allSettled(
          functionEvalConfigs.map(config => 
            deleteFunctionEvalResultsForConfig(config.id, currentPrompt.id).catch((err: any) => {
              console.error(`Error clearing function eval results for config ${config.id}:`, err);
            })
          )
        );
        await loadFunctionEvalResults(selectedFileId, currentPrompt.id);
      }
      
      setTimeout(() => {
        setClearAllOutputs(false);
      }, 100);
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear all outputs');
    }
  }, [csvData, selectedFileId, currentPrompt, judgeConfigs, functionEvalConfigs, loadJudgeResults, loadFunctionEvalResults, setErrorWithTimestamp]);

  return {
    evaluations,
    latestEvaluation,
    isRunning,
    isRunningAll,
    isCancelling,
    setEvaluations,
    setLatestEvaluation,
    setIsRunning,
    setIsRunningGepa,
    isRunningGepa,
    clearAllOutputs,
    loadEvaluations,
    handleUpdateRow,
    handleRunPrompt,
    handleRunAll,
    handleCancel,
    handleClearAllOutputs,
  };
}

