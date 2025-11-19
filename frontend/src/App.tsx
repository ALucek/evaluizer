import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import CSVFileList from './components/CSVFileList';
import DataTable from './components/DataTable';
import { CSVData, CSVDataWithRows, listCSVFiles, getCSVData, deleteCSV, dropColumns, renameColumn, updateEvaluation, listPrompts, createPrompt, updatePrompt as updatePromptAPI, Prompt, runPrompt, Evaluation, listPromptVersions, createPromptVersion, getPrompt, deletePrompt, listPromptsGroupedByName, JudgeConfig, JudgeResult, listJudgeConfigs, createJudgeConfig, updateJudgeConfig, deleteJudgeConfig, getJudgeResultsForCSV, runJudge, deleteJudgeResult, deleteJudgeResultsForConfig, getEvaluationsForCSV, FunctionEvalConfig, FunctionEvalResult, listFunctionEvalConfigs, createFunctionEvalConfig, updateFunctionEvalConfig, deleteFunctionEvalConfig, getFunctionEvalResultsForCSV, runFunctionEval, deleteFunctionEvalResult, deleteFunctionEvalResultsForConfig } from './services/api';
import PromptEditor, { LLMConfig } from './components/PromptEditor';
import CombinedEvaluationsPanel from './components/CombinedEvaluationsPanel';
import OptimizerPanel from './components/OptimizerPanel';
import './index.css';

function App() {
  const [csvFiles, setCsvFiles] = useState<CSVData[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [csvData, setCsvData] = useState<CSVDataWithRows | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<Prompt | null>(null);
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>(''); // Track current edited system prompt
  const [currentUserMessageColumn, setCurrentUserMessageColumn] = useState<string | null>(null); // Track current edited user message column
  const [promptVersions, setPromptVersions] = useState<Prompt[]>([]);
  const [groupedPrompts, setGroupedPrompts] = useState<Record<string, Prompt[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTimestamp, setErrorTimestamp] = useState<Date | null>(null);

  // Helper function to set error with timestamp
  const setErrorWithTimestamp = useCallback((errorMessage: string | null) => {
    setError(errorMessage);
    setErrorTimestamp(errorMessage ? new Date() : null);
  }, []);
  const selectedFileIdRef = useRef<number | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    model: 'gpt-5-mini',
    temperature: 1.0,
    maxTokens: 2000,
    concurrency: 10,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [latestEvaluation, setLatestEvaluation] = useState<Evaluation | null>(null);
  const [clearAllOutputs, setClearAllOutputs] = useState(false);
  const cancellationRef = useRef<boolean>(false);
  const [judgeConfigs, setJudgeConfigs] = useState<JudgeConfig[]>([]);
  const [judgeResults, setJudgeResults] = useState<JudgeResult[]>([]);
  const [latestJudgeResult, setLatestJudgeResult] = useState<JudgeResult | null>(null);
  const [isRunningJudge, setIsRunningJudge] = useState(false);
  const [runningJudgeConfigId, setRunningJudgeConfigId] = useState<number | null>(null);
  const [runningJudgeCells, setRunningJudgeCells] = useState<Set<string>>(new Set());
  const [isCancellingJudge, setIsCancellingJudge] = useState(false);
  const judgeCancellationRef = useRef<boolean>(false);
  const [functionEvalConfigs, setFunctionEvalConfigs] = useState<FunctionEvalConfig[]>([]);
  const [functionEvalResults, setFunctionEvalResults] = useState<FunctionEvalResult[]>([]);
  const [latestFunctionEvalResult, setLatestFunctionEvalResult] = useState<FunctionEvalResult | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

  const loadCSVFiles = async (): Promise<CSVData[]> => {
    try {
      const files = await listCSVFiles();
      setCsvFiles(files);
      return files;
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to load CSV files');
      return [];
    }
  };

  const loadCSVData = async (id: number) => {
    // Only set loading state if we don't have data yet (initial load)
    const isInitialLoad = csvData === null;
    if (isInitialLoad) {
      setLoading(true);
    }
    try {
      const data = await getCSVData(id);
      // Only update if this is still the selected file (prevent race conditions)
      if (selectedFileIdRef.current === id) {
        setCsvData(data);
        setErrorWithTimestamp(null); // Clear error only on success
      }
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to load CSV data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCSVFiles();
  }, []);

  const loadPrompt = async (csvFileId: number) => {
    try {
      const prompts = await listPrompts(csvFileId, false); // Only get root prompts
      if (prompts.length > 0) {
        const prompt = prompts[0]; // Use the first prompt for this CSV file
        setCurrentPrompt(prompt);
        
        // Load LLM config from the prompt if it exists
        if (prompt.model || prompt.temperature !== null || prompt.max_tokens !== null || prompt.concurrency !== null) {
          setLlmConfig({
            model: prompt.model || llmConfig.model,
            temperature: prompt.temperature ?? llmConfig.temperature,
            maxTokens: prompt.max_tokens ?? llmConfig.maxTokens,
            concurrency: prompt.concurrency ?? llmConfig.concurrency,
          });
        }
        
        // Load versions for this prompt
        await loadPromptVersions(prompt.id);
      } else {
        setCurrentPrompt(null);
        setPromptVersions([]);
      }
    } catch (err) {
      // If prompt doesn't exist, that's fine
      setCurrentPrompt(null);
      setPromptVersions([]);
    }
  };

  const loadPromptVersions = async (promptId: number) => {
    try {
      const versions = await listPromptVersions(promptId);
      setPromptVersions(versions);
      // If current prompt is not in versions, update it
      const currentVersion = versions.find(v => v.id === promptId);
      if (currentVersion) {
        setCurrentPrompt(currentVersion);
        
        // Load LLM config from the current version if it exists
        if (currentVersion.model || currentVersion.temperature !== null || currentVersion.max_tokens !== null || currentVersion.concurrency !== null) {
          setLlmConfig({
            model: currentVersion.model || llmConfig.model,
            temperature: currentVersion.temperature ?? llmConfig.temperature,
            maxTokens: currentVersion.max_tokens ?? llmConfig.maxTokens,
            concurrency: currentVersion.concurrency ?? llmConfig.concurrency,
          });
        }
      }
    } catch (err) {
      console.error('Failed to load prompt versions:', err);
      setPromptVersions([]);
    }
  };

  const loadGroupedPrompts = async (csvFileId: number) => {
    try {
      const grouped = await listPromptsGroupedByName(csvFileId);
      setGroupedPrompts(grouped);
    } catch (err) {
      console.error('Failed to load grouped prompts:', err);
      setGroupedPrompts({});
    }
  };

  const loadJudgeConfigs = async (csvFileId: number) => {
    try {
      const configs = await listJudgeConfigs(csvFileId);
      setJudgeConfigs(configs);
    } catch (err) {
      console.error('Failed to load judge configs:', err);
      setJudgeConfigs([]);
    }
  };

  const loadJudgeResults = async (csvFileId: number, promptId: number | null) => {
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
  };

  const loadFunctionEvalConfigs = async (csvFileId: number) => {
    try {
      const configs = await listFunctionEvalConfigs(csvFileId);
      setFunctionEvalConfigs(configs);
    } catch (err) {
      console.error('Failed to load function eval configs:', err);
      setFunctionEvalConfigs([]);
    }
  };

  const loadFunctionEvalResults = async (csvFileId: number, promptId: number | null) => {
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
  };

  const loadEvaluations = async (csvFileId: number, promptId: number | null) => {
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
  };

  useEffect(() => {
    selectedFileIdRef.current = selectedFileId;
    if (selectedFileId) {
      loadCSVData(selectedFileId);
      loadPrompt(selectedFileId);
      loadGroupedPrompts(selectedFileId);
      loadJudgeConfigs(selectedFileId);
      // Load results when both file and prompt are available
      if (currentPrompt?.id) {
        loadJudgeResults(selectedFileId, currentPrompt.id);
        loadFunctionEvalResults(selectedFileId, currentPrompt.id);
        loadEvaluations(selectedFileId, currentPrompt.id);
      }
      loadFunctionEvalConfigs(selectedFileId);
    } else {
      setCsvData(null);
      setCurrentPrompt(null);
      setPromptVersions([]);
      setGroupedPrompts({});
      setJudgeConfigs([]);
      setJudgeResults([]);
      setFunctionEvalConfigs([]);
      setFunctionEvalResults([]);
      setEvaluations([]);
    }
  }, [selectedFileId]);

  // Reload results when prompt changes
  useEffect(() => {
    if (selectedFileId && currentPrompt?.id) {
      loadJudgeResults(selectedFileId, currentPrompt.id);
      loadFunctionEvalResults(selectedFileId, currentPrompt.id);
      loadEvaluations(selectedFileId, currentPrompt.id);
    } else {
      setJudgeResults([]);
      setFunctionEvalResults([]);
      setEvaluations([]);
    }
  }, [currentPrompt?.id, selectedFileId]);

  const handleUploadSuccess = useCallback(async (data: CSVData) => {
    // Optimistically add the new file to the list
    setCsvFiles(prevFiles => {
      // Check if file already exists to avoid duplicates
      if (prevFiles.some(f => f.id === data.id)) {
        return prevFiles;
      }
      return [...prevFiles, data];
    });
    // Select the new file immediately
    setSelectedFileId(data.id);
    // Reload file list in background to ensure consistency
    loadCSVFiles();
  }, []);

  const handleDeleteFile = async (id: number) => {
    try {
      const wasSelected = selectedFileId === id;
      await deleteCSV(id);
      
      // Reload the file list and get updated files
      const updatedFiles = await loadCSVFiles();
      
      // If the deleted file was selected, try to select another file
      if (wasSelected) {
        if (updatedFiles.length > 0) {
          // Select the first available file
          setSelectedFileId(updatedFiles[0].id);
        } else {
          // No files left, clear selection
          setSelectedFileId(null);
          setCsvData(null);
        }
      }
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to delete CSV file');
    }
  };

  const handleDropColumns = async (columns: string[]) => {
    if (!selectedFileId) return;
    try {
      setLoading(true);
      await dropColumns(selectedFileId, columns);
      // Reload the data to reflect the dropped columns
      await loadCSVData(selectedFileId);
      // Also reload the file list to update column count
      await loadCSVFiles();
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to drop columns');
    } finally {
      setLoading(false);
    }
  };

  const handleRenameColumn = async (oldName: string, newName: string) => {
    if (!selectedFileId) return;
    try {
      setLoading(true);
      await renameColumn(selectedFileId, oldName, newName);
      // Reload the data to reflect the renamed column
      await loadCSVData(selectedFileId);
      // Also reload the file list to update column count
      await loadCSVFiles();
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to rename column');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRow = async (rowId: number, annotation?: number | null, feedback?: string) => {
    if (!selectedFileId || !currentPrompt?.id) return;
    
    // Store optimistic update values
    const optimisticAnnotation = annotation !== undefined ? annotation : undefined;
    const optimisticFeedback = feedback !== undefined ? feedback : undefined;
    
    try {
      // Optimistically update evaluations array for immediate UI feedback
      setEvaluations(prev => {
        const index = prev.findIndex(e => e.csv_row_id === rowId && e.prompt_id === currentPrompt.id);
        if (index >= 0) {
          // Update existing evaluation
          const updated = [...prev];
          updated[index] = { 
            ...updated[index], 
            annotation: optimisticAnnotation !== undefined ? optimisticAnnotation : updated[index].annotation,
            feedback: optimisticFeedback !== undefined ? optimisticFeedback : updated[index].feedback 
          };
          return updated;
        }
        // If not found, create a new entry
        const newEval: Evaluation = {
          id: 0, // Temporary ID, will be replaced on reload
          csv_file_id: selectedFileId!,
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
      
      // Update backend
      await updateEvaluation(rowId, currentPrompt.id, undefined, annotation, feedback);
      
      // Reload evaluations after a brief delay to ensure server has processed the update
      // This ensures consistency while preserving the optimistic update until reload completes
      setTimeout(async () => {
        await loadEvaluations(selectedFileId, currentPrompt.id);
      }, 100);
      
      // Note: DataTable component handles its own state synchronization by refetching
      // evaluations from the backend after updates, ensuring SSOT consistency.
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update row');
      // Reload on error to ensure consistency
      if (selectedFileId && currentPrompt?.id) {
        await loadEvaluations(selectedFileId, currentPrompt.id);
      }
    }
  };

  const handleSavePrompt = async (systemPrompt: string, userMessageColumn: string | null, createNewVersion: boolean, name?: string, commitMessage?: string) => {
    if (!selectedFileId) return;
    try {
      // If name is provided, we're creating a new prompt (new branch)
      // Otherwise, if currentPrompt exists, we're creating a new version (commit)
      if (name && name.trim()) {
        // Create a new root prompt (new branch) - don't pass parent_prompt_id
        const created = await createPrompt(
          systemPrompt, 
          selectedFileId, 
          name, 
          undefined, 
          undefined, 
          userMessageColumn,
          llmConfig.model,
          llmConfig.temperature,
          llmConfig.maxTokens,
          llmConfig.concurrency
        );
        setCurrentPrompt(created);
        await loadPromptVersions(created.id);
        await loadGroupedPrompts(selectedFileId);
      } else if (currentPrompt) {
        // When a prompt exists, create a new version (commit)
        const newVersion = await createPromptVersion(
          currentPrompt.id, 
          systemPrompt, 
          userMessageColumn, 
          undefined, 
          commitMessage,
          llmConfig.model,
          llmConfig.temperature,
          llmConfig.maxTokens,
          llmConfig.concurrency
        );
        setCurrentPrompt(newVersion);
        await loadPromptVersions(newVersion.id);
        await loadGroupedPrompts(selectedFileId);
      } else {
        // Fallback: create a new prompt without a name (will be "Unnamed")
        const created = await createPrompt(
          systemPrompt, 
          selectedFileId, 
          name, 
          undefined, 
          undefined, 
          userMessageColumn,
          llmConfig.model,
          llmConfig.temperature,
          llmConfig.maxTokens,
          llmConfig.concurrency
        );
        setCurrentPrompt(created);
        await loadPromptVersions(created.id);
        await loadGroupedPrompts(selectedFileId);
      }
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to save prompt');
      throw err;
    }
  };

  const handleVersionNameUpdate = async (versionId: number, newName: string | null) => {
    try {
      const updated = await updatePromptAPI(versionId, undefined, newName ?? undefined);
      // If this is the current prompt, update it
      if (currentPrompt?.id === versionId) {
        setCurrentPrompt(updated);
      }
      // Reload versions to show the updated name - use the root prompt ID
      const rootPromptId = updated.parent_prompt_id || updated.id;
      await loadPromptVersions(rootPromptId);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update version name');
      throw err;
    }
  };

  const handleVersionSelect = async (versionId: number) => {
    try {
      const selectedVersion = await getPrompt(versionId);
      setCurrentPrompt(selectedVersion);
      
      // Load LLM config from the prompt version if it exists
      if (selectedVersion.model || selectedVersion.temperature !== null || selectedVersion.max_tokens !== null || selectedVersion.concurrency !== null) {
        setLlmConfig({
          model: selectedVersion.model || llmConfig.model,
          temperature: selectedVersion.temperature ?? llmConfig.temperature,
          maxTokens: selectedVersion.max_tokens ?? llmConfig.maxTokens,
          concurrency: selectedVersion.concurrency ?? llmConfig.concurrency,
        });
      }
      
      // currentSystemPrompt and currentUserMessageColumn will be synced by PromptEditor's onContentChange callback
      // when the prompt prop changes and the textarea/select updates
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to load prompt version');
    }
  };


  const handlePromptContentChange = useCallback((systemPrompt: string, userMessageColumn: string | null) => {
    setCurrentSystemPrompt(systemPrompt);
    setCurrentUserMessageColumn(userMessageColumn);
  }, []);

  const handleDeletePrompt = async (promptId: number) => {
    if (!selectedFileId) return;

    try {
      const wasCurrentPrompt = currentPrompt?.id === promptId;
      const currentPromptName = currentPrompt?.name || 'Unnamed';
      
      await deletePrompt(promptId);
      
      // Reload grouped prompts to reflect the deletion
      await loadGroupedPrompts(selectedFileId);
      
      // If we deleted the current prompt, try to select another version from the same prompt
      if (wasCurrentPrompt) {
        const updatedGrouped = await listPromptsGroupedByName(selectedFileId);
        
        // First, try to find other versions of the same prompt (same name)
        const samePromptVersions = updatedGrouped[currentPromptName];
        if (samePromptVersions && samePromptVersions.length > 0) {
          // Select the latest version of the same prompt
          await handleVersionSelect(samePromptVersions[samePromptVersions.length - 1].id);
          setErrorWithTimestamp(null); // Clear error only on success
          return;
        }
        
        // If no versions of the same prompt exist, try other prompts
        const remainingPrompts = Object.values(updatedGrouped).flat();
        if (remainingPrompts.length > 0) {
          // Select the latest version of the first available prompt
          const firstPromptName = Object.keys(updatedGrouped)[0];
          const firstPromptVersions = updatedGrouped[firstPromptName];
          if (firstPromptVersions && firstPromptVersions.length > 0) {
            await handleVersionSelect(firstPromptVersions[firstPromptVersions.length - 1].id);
          }
        } else {
          // No prompts left, clear the prompt
          setCurrentPrompt(null);
          setPromptVersions([]);
        }
      }
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to delete prompt');
      throw err;
    }
  };

  const handleRunPrompt = async (rowIds: number[], clearOutputsFirst: boolean = false) => {
    if (!selectedFileId || !csvData || !currentPrompt) {
      return; // Validation prevents this, but guard anyway
    }
    
    // Use currentSystemPrompt and currentUserMessageColumn which track the editor values (source of truth)
    // Falls back to saved prompt values if editor hasn't been synced yet
    const systemPromptToUse = currentSystemPrompt || currentPrompt.system_prompt || '';
    const userMessageColumnToUse = currentUserMessageColumn !== null ? currentUserMessageColumn : currentPrompt.user_message_column;

    const isAllRows = clearOutputsFirst && rowIds.length === csvData.rows.length;
    
    // Reset cancellation flag at the start
    cancellationRef.current = false;
    
    setIsRunning(true);
    setIsRunningAll(isAllRows);
    setLatestEvaluation(null);

    let hadErrors = false; // Track if any errors occurred

    try {
      // Clear outputs, annotations, and feedback first if requested (for "Run All" scenario)
      if (clearOutputsFirst) {
        // Check for cancellation before clearing
        if (cancellationRef.current) {
          return;
        }
        
        // Immediately update UI to show cleared outputs
        setClearAllOutputs(true);
        
        const clearPromises = rowIds.map(rowId => 
          updateEvaluation(rowId, currentPrompt.id, "", null, null)
        );
        await Promise.all(clearPromises);
        
        // Reset the flag after a brief moment so it can be reused
        setTimeout(() => {
          setClearAllOutputs(false);
        }, 100);
      }

      // Process rows in parallel batches with concurrency limit
      const concurrencyLimit = llmConfig.concurrency || 10;
      const batches: number[][] = [];
      
      // Split rowIds into batches
      for (let i = 0; i < rowIds.length; i += concurrencyLimit) {
        batches.push(rowIds.slice(i, i + concurrencyLimit));
      }

      // Process each batch in parallel, but batches sequentially
      for (const batch of batches) {
        // Check for cancellation before processing each batch
        if (cancellationRef.current) {
          break;
        }
        
        // Process all rows in this batch concurrently
        const batchPromises = batch.map(async (rowId) => {
          // Check cancellation before each individual request
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
              systemPrompt: systemPromptToUse, // Pass current edited system prompt
              userMessageColumn: userMessageColumnToUse, // Pass current edited user message column
            });
            
            // Use startTransition to mark this as a non-urgent update, preventing flickering
            startTransition(() => {
              setLatestEvaluation(evaluation);
            });
            
            return { success: true, rowId, evaluation };
          } catch (err) {
            // Don't set error if cancelled
            if (cancellationRef.current) {
              return { success: false, rowId, error: new Error('Cancelled') };
            }
            hadErrors = true; // Mark that we had errors
            const errorMessage = err instanceof Error ? err.message : `Failed to run prompt for row ${rowId}`;
            setErrorWithTimestamp(errorMessage);
            return { success: false, rowId, error: err };
          }
        });

        // Wait for all rows in this batch to complete (or fail)
        await Promise.allSettled(batchPromises);
        
        // Check cancellation after batch completes
        if (cancellationRef.current) {
          break;
        }
      }
    } catch (err) {
      hadErrors = true;
      // Don't set error if cancelled
      if (!cancellationRef.current) {
        setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run prompts');
      }
    } finally {
      setIsRunning(false);
      setIsRunningAll(false);
      setIsCancelling(false);
      cancellationRef.current = false; // Reset cancellation flag
      // Only clear error if run completed successfully without errors and wasn't cancelled
      if (!hadErrors && !cancellationRef.current) {
        setErrorWithTimestamp(null);
      }
      // Reload evaluations to update OptimizerPanel dashboard
      if (selectedFileId && currentPrompt?.id) {
        await loadEvaluations(selectedFileId, currentPrompt.id);
      }
      // Clear latestEvaluation after a brief delay to allow last update to process
      // But don't reload all data - incremental updates are already handled
      setTimeout(() => {
        setLatestEvaluation(null);
      }, 100);
    }
  };

  const handleRunAll = async () => {
    if (!csvData || csvData.rows.length === 0) {
      setErrorWithTimestamp('No rows to run');
      return;
    }
    
    if (!selectedFileId) {
      return;
    }
    
    const allRowIds = csvData.rows.map(row => row.id);
    
    // Clear all judge evaluation scores for all rows before running
    if (judgeConfigs.length > 0) {
      await Promise.allSettled(
        judgeConfigs.map(config => 
          deleteJudgeResultsForConfig(config.id).catch((err: any) => {
            console.error(`Error clearing judge results for config ${config.id}:`, err);
          })
        )
      );
      // Reload judge results to update UI
      await loadJudgeResults(selectedFileId);
    }
    
    // Clear all function evaluation scores for all rows before running
    if (functionEvalConfigs.length > 0) {
      await Promise.allSettled(
        functionEvalConfigs.map(config => 
          deleteFunctionEvalResultsForConfig(config.id).catch((err: any) => {
            console.error(`Error clearing function eval results for config ${config.id}:`, err);
          })
        )
      );
      // Reload function eval results to update UI
      await loadFunctionEvalResults(selectedFileId);
    }
    
    await handleRunPrompt(allRowIds, true);
  };

  const handleCancel = () => {
    cancellationRef.current = true;
    setIsCancelling(true);
  };

  const handleClearAllOutputs = async () => {
    if (!csvData || !selectedFileId) {
      return;
    }
    
    try {
      const allRowIds = csvData.rows.map(row => row.id);
      
      if (!currentPrompt?.id) {
        setErrorWithTimestamp('No prompt selected');
        return;
      }
      
      // Immediately update UI to show cleared outputs
      setClearAllOutputs(true);
      
      // Clear all evaluation outputs
      const clearPromises = allRowIds.map(rowId => 
        updateEvaluation(rowId, currentPrompt.id, "", null, null)
      );
      await Promise.all(clearPromises);
      
      // Clear all judge evaluation scores for all rows (similar to individual row clearing)
      if (judgeConfigs.length > 0) {
        await Promise.allSettled(
          judgeConfigs.map(config => 
            deleteJudgeResultsForConfig(config.id).catch((err: any) => {
              console.error(`Error clearing judge results for config ${config.id}:`, err);
            })
          )
        );
        // Reload judge results to update UI
        await loadJudgeResults(selectedFileId);
      }
      
      // Clear all function evaluation scores for all rows
      if (functionEvalConfigs.length > 0) {
        await Promise.allSettled(
          functionEvalConfigs.map(config => 
            deleteFunctionEvalResultsForConfig(config.id).catch((err: any) => {
              console.error(`Error clearing function eval results for config ${config.id}:`, err);
            })
          )
        );
        // Reload function eval results to update UI
        await loadFunctionEvalResults(selectedFileId);
      }
      
      // Reset the flag after a brief moment so it can be reused
      setTimeout(() => {
        setClearAllOutputs(false);
      }, 100);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear all outputs');
    }
  };

  const handleCreateJudgeConfig = async (name: string, prompt: string, llmConfig: LLMConfig): Promise<JudgeConfig> => {
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
      setErrorWithTimestamp(null); // Clear error only on success
      return config;
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to create judge config');
      throw err;
    }
  };

  const handleUpdateJudgeConfig = async (id: number, partial: { name?: string; prompt?: string; model?: string; temperature?: number; maxTokens?: number }) => {
    if (!selectedFileId) return;
    try {
      await updateJudgeConfig(id, partial);
      await loadJudgeConfigs(selectedFileId);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update judge config');
      throw err;
    }
  };

  const handleDeleteJudgeConfig = async (id: number) => {
    if (!selectedFileId) return;
    try {
      await deleteJudgeConfig(id);
      await loadJudgeConfigs(selectedFileId);
      await loadJudgeResults(selectedFileId);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to delete judge config');
      throw err;
    }
  };

  const handleRunJudgeForRow = async (configId: number, rowId: number) => {
    if (!currentPrompt?.id) {
      setErrorWithTimestamp('No prompt selected');
      return;
    }
    const cellKey = `${configId}-${rowId}`;
    try {
      setRunningJudgeCells(prev => new Set(prev).add(cellKey));
      const result = await runJudge({ configId, csvRowId: rowId, promptId: currentPrompt.id });
      // Update incrementally as result comes in (similar to latestEvaluation)
      // Update synchronously to trigger immediate UI update
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
  };

  const handleRunJudgeForAllRows = async (configId: number, concurrency: number = 10) => {
    if (!selectedFileId || !csvData || !currentPrompt?.id) return;
    
    judgeCancellationRef.current = false;
    setIsRunningJudge(true);
    setRunningJudgeConfigId(configId);

    let hadErrors = false; // Track if any errors occurred

    try {
      // Fetch evaluations to check which rows have outputs
      const evaluations = await getEvaluationsForCSV(selectedFileId, currentPrompt.id);
      const evaluationsByRowId = new Map<number, Evaluation>();
      evaluations.forEach(evaluation => {
        evaluationsByRowId.set(evaluation.csv_row_id, evaluation);
      });

      // Filter to only rows that have outputs
      const validRowIds = csvData.rows
        .filter(row => {
          const evaluation = evaluationsByRowId.get(row.id);
          const output = evaluation?.output;
          return output !== null && output !== undefined && output !== '';
        })
        .map(row => row.id);

      if (validRowIds.length === 0) {
        setErrorWithTimestamp('No rows with outputs found. Run prompts first to generate outputs.');
        return;
      }

      const config = judgeConfigs.find(c => c.id === configId);
      if (!config) {
        throw new Error('Judge config not found');
      }

      const concurrencyLimit = concurrency || 10; // Use provided concurrency or default to 10
      const batches: number[][] = [];
      
      for (let i = 0; i < validRowIds.length; i += concurrencyLimit) {
        batches.push(validRowIds.slice(i, i + concurrencyLimit));
      }

      for (const batch of batches) {
        if (judgeCancellationRef.current) {
          break;
        }
        
        const batchPromises = batch.map(async (rowId) => {
          const cellKey = `${configId}-${rowId}`;
          // Mark this cell as running
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
            // Update incrementally as each result comes in (similar to latestEvaluation)
            // Use setTimeout to ensure each update happens in its own render cycle
            setTimeout(() => {
              setLatestJudgeResult(result);
              setJudgeResults(prev => {
                const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
                return [...next, result];
              });
              // Clear the running state for this specific cell
              setRunningJudgeCells(prev => {
                const next = new Set(prev);
                next.delete(cellKey);
                return next;
              });
            }, 0);
            return { success: true, rowId, result };
          } catch (err) {
            // Clear running state even on error
            setRunningJudgeCells(prev => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
            if (!judgeCancellationRef.current) {
              hadErrors = true; // Mark that we had errors
              const errorMessage = err instanceof Error ? err.message : `Failed to run judge for row ${rowId}`;
              setErrorWithTimestamp(errorMessage);
            }
            return { success: false, rowId, error: err };
          }
        });

        await Promise.allSettled(batchPromises);
        
        if (judgeCancellationRef.current) {
          break;
        }
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
      // Only clear error if run completed successfully without errors and wasn't cancelled
      if (!hadErrors && !judgeCancellationRef.current) {
        setErrorWithTimestamp(null);
      }
      // Clear latestJudgeResult after a brief delay to allow last update to process
      setTimeout(() => {
        setLatestJudgeResult(null);
      }, 100);
    }
  };

  const handleCancelJudge = () => {
    judgeCancellationRef.current = true;
    setIsCancellingJudge(true);
  };

  const handleClearJudgeForRow = async (configId: number, rowId: number) => {
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
  };

  const handleClearJudgeForAllRows = async (configId: number) => {
    if (!selectedFileId) return;
    try {
      await deleteJudgeResultsForConfig(configId);
      await loadJudgeResults(selectedFileId);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear judge results');
    }
  };

  // Function evaluation handlers
  const handleCreateFunctionEvalConfig = async (functionName: string, config?: Record<string, any>): Promise<FunctionEvalConfig> => {
    if (!selectedFileId) {
      throw new Error('No CSV file selected');
    }
    try {
      // Use functionName as the name for the evaluation
      const created = await createFunctionEvalConfig(selectedFileId, functionName, functionName, config);
      await loadFunctionEvalConfigs(selectedFileId);
      setErrorWithTimestamp(null); // Clear error only on success
      return created;
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to create function eval config');
      throw err;
    }
  };

  const handleUpdateFunctionEvalConfig = async (id: number, partial: { name?: string; config?: Record<string, any> }) => {
    if (!selectedFileId) return;
    try {
      await updateFunctionEvalConfig(id, partial);
      await loadFunctionEvalConfigs(selectedFileId);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update function eval config');
      throw err;
    }
  };

  const handleDeleteFunctionEvalConfig = async (id: number) => {
    if (!selectedFileId) return;
    try {
      await deleteFunctionEvalConfig(id);
      await loadFunctionEvalConfigs(selectedFileId);
      await loadFunctionEvalResults(selectedFileId);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to delete function eval config');
      throw err;
    }
  };

  const handleRunFunctionEvalForRow = async (configId: number, rowId: number) => {
    if (!currentPrompt?.id) {
      setErrorWithTimestamp('No prompt selected');
      return;
    }
    try {
      const result = await runFunctionEval(configId, rowId, currentPrompt.id);
      // Update incrementally as result comes in
      setLatestFunctionEvalResult(result);
      setFunctionEvalResults(prev => {
        const next = prev.filter(r => !(r.config_id === configId && r.csv_row_id === rowId && r.prompt_id === currentPrompt.id));
        return [...next, result];
      });
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run function evaluation');
    }
  };

  const handleRunFunctionEvalForAllRows = async (configId: number, concurrency: number = 10) => {
    if (!selectedFileId || !csvData || !currentPrompt?.id) return;
    
    try {
      // Fetch evaluations to check which rows have outputs
      const evaluations = await getEvaluationsForCSV(selectedFileId, currentPrompt.id);
      const evaluationsByRowId = new Map<number, Evaluation>();
      evaluations.forEach(evaluation => {
        evaluationsByRowId.set(evaluation.csv_row_id, evaluation);
      });

      // Filter to only rows that have outputs
      const validRowIds = csvData.rows
        .filter(row => {
          const evaluation = evaluationsByRowId.get(row.id);
          const output = evaluation?.output;
          return output !== null && output !== undefined && output !== '';
        })
        .map(row => row.id);

      if (validRowIds.length === 0) {
        setErrorWithTimestamp('No rows with outputs found. Run prompts first to generate outputs.');
        return;
      }

      const config = functionEvalConfigs.find(c => c.id === configId);
      if (!config) {
        throw new Error('Function eval config not found');
      }

      const concurrencyLimit = concurrency || 10; // Use provided concurrency or default to 10
      const batches: number[][] = [];
      
      for (let i = 0; i < validRowIds.length; i += concurrencyLimit) {
        batches.push(validRowIds.slice(i, i + concurrencyLimit));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async (rowId) => {
          try {
            const result = await runFunctionEval(configId, rowId, currentPrompt.id);
            // Update incrementally as each result comes in
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
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to run function evaluations');
    } finally {
      setTimeout(() => {
        setLatestFunctionEvalResult(null);
      }, 100);
    }
  };

  const handleClearFunctionEvalForRow = async (configId: number, rowId: number) => {
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
  };

  const handleClearFunctionEvalForAllRows = async (configId: number) => {
    if (!selectedFileId) return;
    try {
      await deleteFunctionEvalResultsForConfig(configId);
      await loadFunctionEvalResults(selectedFileId);
      setErrorWithTimestamp(null); // Clear error only on success
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to clear function eval results');
    }
  };

  const currentColumns = csvData?.columns || [];

  return (
    <div style={{ 
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: 'var(--bg-primary)',
    }}>
      <div style={{
        padding: '1rem 2rem',
        borderBottom: '1px solid var(--border-primary)',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: '1.5rem',
          fontWeight: '700',
          letterSpacing: '-0.03em',
          color: 'var(--text-primary)',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
        }}>EVALUIZER</h1>
      </div>
      
      {error && (
        <div style={{ 
          padding: '0.75rem 1.5rem', 
          backgroundColor: 'var(--bg-secondary)', 
          color: 'var(--accent-danger)', 
          fontSize: '0.8125rem',
          fontWeight: '600',
          borderBottom: '1px solid var(--border-primary)',
          borderTop: '1px solid var(--accent-danger)',
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</span>
            {errorTimestamp && (
              <span style={{ 
                fontSize: '0.6875rem', 
                color: 'var(--text-tertiary)',
                fontWeight: '500',
              }}>
                {errorTimestamp.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={() => setErrorWithTimestamp(null)}
            style={{
              padding: '0.25rem 0.5rem',
              backgroundColor: 'transparent',
              color: 'var(--accent-danger)',
              border: '1px solid var(--accent-danger)',
              borderRadius: '0',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '700',
              fontFamily: 'monospace',
              transition: 'none',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent-danger)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--accent-danger)';
            }}
            title="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1.5rem',
        padding: '1.5rem',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-primary)',
      }}>
        {/* Left Column - Prompt, and LLM Config (1/3) */}
        <div style={{
          flex: '1',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          gap: '1.5rem',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: '0.5rem',
        }}>
          {selectedFileId ? (
            <>
              <PromptEditor
                prompt={currentPrompt}
                groupedPrompts={groupedPrompts}
                columns={currentColumns}
                onSave={handleSavePrompt}
                onVersionSelect={handleVersionSelect}
                onDeletePrompt={handleDeletePrompt}
                onContentChange={handlePromptContentChange}
                llmConfig={llmConfig}
                onLLMConfigChange={setLlmConfig}
                onRunAll={handleRunAll}
                onClearAllOutputs={handleClearAllOutputs}
                onCancel={handleCancel}
                isRunning={isRunning}
                isRunningAll={isRunningAll}
                isCancelling={isCancelling}
              />
              
              {/* Optimizer Panel */}
              <OptimizerPanel
                csvFileId={selectedFileId}
                evaluations={evaluations}
                judgeResults={judgeResults}
                judgeConfigs={judgeConfigs}
                functionEvalResults={functionEvalResults}
                functionEvalConfigs={functionEvalConfigs}
                latestEvaluation={latestEvaluation}
                latestJudgeResult={latestJudgeResult}
                latestFunctionEvalResult={latestFunctionEvalResult}
                prompts={Object.values(groupedPrompts).flat()}
                onGepaRunComplete={async (newPromptId: number) => {
                  // Refresh prompts and select the new one
                  await loadGroupedPrompts(selectedFileId!);
                  await handleVersionSelect(newPromptId);
                }}
              />
              
              {/* Combined Evaluations Panel */}
              <CombinedEvaluationsPanel
                csvFileId={selectedFileId}
                judgeConfigs={judgeConfigs}
                functionEvalConfigs={functionEvalConfigs}
                onJudgeConfigsChange={setJudgeConfigs}
                onFunctionEvalConfigsChange={setFunctionEvalConfigs}
                columns={currentColumns}
                onRunJudgeForAllRows={handleRunJudgeForAllRows}
                onClearJudgeForAllRows={handleClearJudgeForAllRows}
                onCreateJudgeConfig={handleCreateJudgeConfig}
                onUpdateJudgeConfig={handleUpdateJudgeConfig}
                onDeleteJudgeConfig={handleDeleteJudgeConfig}
                isRunningJudge={isRunningJudge}
                runningJudgeConfigId={runningJudgeConfigId}
                onCancelJudge={handleCancelJudge}
                isCancellingJudge={isCancellingJudge}
                onCreateFunctionEvalConfig={handleCreateFunctionEvalConfig}
                onUpdateFunctionEvalConfig={handleUpdateFunctionEvalConfig}
                onDeleteFunctionEvalConfig={handleDeleteFunctionEvalConfig}
                onRunFunctionEvalForAllRows={handleRunFunctionEvalForAllRows}
                onClearFunctionEvalForAllRows={handleClearFunctionEvalForAllRows}
              />
            </>
          ) : (
            <>
              {/* Prompt Editor Placeholder */}
              <div style={{
                padding: '1.5rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '0',
                backgroundColor: 'var(--bg-elevated)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}>
                <div>
                  <h2 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: '700', fontFamily: 'monospace', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PROMPT</h2>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    SELECT A CSV FILE TO START CREATING PROMPTS
                  </p>
                </div>
                <div style={{
                  minHeight: '200px',
                  border: '1px dashed var(--border-secondary)',
                  borderRadius: '0',
                  backgroundColor: 'var(--bg-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  PROMPT EDITOR WILL APPEAR HERE
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Column - Tabs and Table (2/3) */}
        <div style={{
          flex: '2',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0, // Important for flexbox overflow
        }}>
          <CSVFileList
            files={csvFiles}
            selectedFileId={selectedFileId}
            currentPromptId={currentPrompt?.id}
            onSelectFile={setSelectedFileId}
            onDeleteFile={handleDeleteFile}
            onUploadSuccess={handleUploadSuccess}
          />

          <div style={{
            flex: 1,
            overflow: 'hidden',
            minHeight: 0, // Important for flexbox overflow
          }}>
            {loading && csvData === null ? (
              <div style={{ 
                padding: '2rem', 
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                LOADING...
              </div>
            ) : csvData ? (
              <DataTable 
                data={csvData} 
                onDropColumns={handleDropColumns}
                onRenameColumn={handleRenameColumn}
                onUpdateRow={handleUpdateRow}
                currentPrompt={currentPrompt}
                llmConfig={llmConfig}
                onRunPrompt={handleRunPrompt}
                isRunningAll={isRunningAll}
                latestEvaluation={latestEvaluation}
                clearAllOutputs={clearAllOutputs}
                judgeConfigs={judgeConfigs}
                judgeResults={judgeResults}
                latestJudgeResult={latestJudgeResult}
                onRunJudgeForRow={handleRunJudgeForRow}
                onClearJudgeForRow={handleClearJudgeForRow}
                isRunningJudge={isRunningJudge}
                runningJudgeConfigId={runningJudgeConfigId}
                runningJudgeCells={runningJudgeCells}
                functionEvalConfigs={functionEvalConfigs}
                functionEvalResults={functionEvalResults}
                latestFunctionEvalResult={latestFunctionEvalResult}
                onRunFunctionEvalForRow={handleRunFunctionEvalForRow}
                onClearFunctionEvalForRow={handleClearFunctionEvalForRow}
              />
            ) : (
              <div style={{ 
                padding: '3rem', 
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                <div>
                  CLICK THE <strong style={{ color: 'var(--text-secondary)' }}>+</strong> BUTTON ABOVE TO UPLOAD A CSV FILE
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
