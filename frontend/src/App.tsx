import { useState, useEffect, startTransition } from 'react';
import CSVUpload from './components/CSVUpload';
import CSVFileList from './components/CSVFileList';
import DataTable from './components/DataTable';
import { CSVData, CSVDataWithRows, listCSVFiles, getCSVData, deleteCSV, dropColumns, renameColumn, updateEvaluation, listPrompts, createPrompt, updatePrompt as updatePromptAPI, Prompt, runPrompt, Evaluation, listPromptVersions, createPromptVersion, getPrompt, deletePrompt } from './services/api';
import PromptEditor from './components/PromptEditor';
import LLMConfigPanel, { LLMConfig } from './components/LLMConfigPanel';
import './index.css';

function App() {
  const [csvFiles, setCsvFiles] = useState<CSVData[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [csvData, setCsvData] = useState<CSVDataWithRows | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<Prompt | null>(null);
  const [promptVersions, setPromptVersions] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    model: 'gpt-5-mini',
    temperature: 1.0,
    maxTokens: 2000,
    concurrency: 10,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [latestEvaluation, setLatestEvaluation] = useState<Evaluation | null>(null);
  const [clearAllOutputs, setClearAllOutputs] = useState(false);

  const loadCSVFiles = async (): Promise<CSVData[]> => {
    try {
      const files = await listCSVFiles();
      setCsvFiles(files);
      return files;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CSV files');
      return [];
    }
  };

  const loadCSVData = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCSVData(id);
      setCsvData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CSV data');
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
      }
    } catch (err) {
      console.error('Failed to load prompt versions:', err);
      setPromptVersions([]);
    }
  };

  useEffect(() => {
    if (selectedFileId) {
      loadCSVData(selectedFileId);
      loadPrompt(selectedFileId);
    } else {
      setCsvData(null);
      setCurrentPrompt(null);
      setPromptVersions([]);
    }
  }, [selectedFileId]);

  const handleUploadSuccess = (data: CSVData) => {
    loadCSVFiles();
    setSelectedFileId(data.id);
  };

  const handleDeleteFile = async (id: number) => {
    try {
      setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete CSV file');
    }
  };

  const handleDropColumns = async (columns: string[]) => {
    if (!selectedFileId) return;
    try {
      setError(null);
      setLoading(true);
      await dropColumns(selectedFileId, columns);
      // Reload the data to reflect the dropped columns
      await loadCSVData(selectedFileId);
      // Also reload the file list to update column count
      await loadCSVFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to drop columns');
    } finally {
      setLoading(false);
    }
  };

  const handleRenameColumn = async (oldName: string, newName: string) => {
    if (!selectedFileId) return;
    try {
      setError(null);
      setLoading(true);
      await renameColumn(selectedFileId, oldName, newName);
      // Reload the data to reflect the renamed column
      await loadCSVData(selectedFileId);
      // Also reload the file list to update column count
      await loadCSVFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename column');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRow = async (rowId: number, annotation?: number | null, feedback?: string) => {
    if (!selectedFileId) return;
    try {
      await updateEvaluation(rowId, undefined, annotation, feedback);
      // Note: DataTable component handles its own state synchronization by refetching
      // evaluations from the backend after updates, ensuring SSOT consistency.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update row');
    }
  };

  const handleSavePrompt = async (prompt: string, createNewVersion: boolean, name?: string) => {
    if (!selectedFileId) return;
    try {
      setError(null);
      if (currentPrompt) {
        if (createNewVersion) {
          // Create a new version
          const newVersion = await createPromptVersion(currentPrompt.id, prompt, name);
          setCurrentPrompt(newVersion);
          await loadPromptVersions(newVersion.id);
        } else {
          // Update the current prompt (only metadata, not content - but we'll allow it for now)
          const updated = await updatePromptAPI(currentPrompt.id, prompt, name);
          setCurrentPrompt(updated);
          await loadPromptVersions(updated.id);
        }
      } else {
        // Create a new root prompt
        const created = await createPrompt(prompt, selectedFileId, name);
        setCurrentPrompt(created);
        await loadPromptVersions(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
      throw err;
    }
  };

  const handleVersionNameUpdate = async (versionId: number, newName: string | null) => {
    try {
      setError(null);
      const updated = await updatePromptAPI(versionId, undefined, newName ?? undefined);
      // If this is the current prompt, update it
      if (currentPrompt?.id === versionId) {
        setCurrentPrompt(updated);
      }
      // Reload versions to show the updated name - use the root prompt ID
      const rootPromptId = updated.parent_prompt_id || updated.id;
      await loadPromptVersions(rootPromptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update version name');
      throw err;
    }
  };

  const handleVersionSelect = async (versionId: number) => {
    try {
      const selectedVersion = await getPrompt(versionId);
      setCurrentPrompt(selectedVersion);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompt version');
    }
  };

  const handleDeletePrompt = async (promptId: number) => {
    if (!selectedFileId) return;
    
    // Confirm deletion
    const promptToDelete = promptVersions.find(v => v.id === promptId);
    const promptName = promptToDelete?.name || `Version ${promptToDelete?.version || ''}`;
    
    if (!window.confirm(`Are you sure you want to delete "${promptName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      const wasCurrentPrompt = currentPrompt?.id === promptId;
      const rootPromptId = promptToDelete?.parent_prompt_id || promptToDelete?.id;
      
      await deletePrompt(promptId);
      
      // If we deleted the current prompt, select another version or clear it
      if (wasCurrentPrompt) {
        const remainingVersions = promptVersions.filter(v => v.id !== promptId);
        if (remainingVersions.length > 0) {
          // Select the first remaining version
          await handleVersionSelect(remainingVersions[0].id);
          await loadPromptVersions(remainingVersions[0].id);
        } else {
          // No versions left, clear the prompt
          setCurrentPrompt(null);
          setPromptVersions([]);
        }
      } else {
        // Just reload versions to reflect the deletion - use root prompt ID
        if (rootPromptId && rootPromptId !== promptId) {
          await loadPromptVersions(rootPromptId);
        } else if (currentPrompt) {
          // Fallback to current prompt's root
          const currentRootId = currentPrompt.parent_prompt_id || currentPrompt.id;
          await loadPromptVersions(currentRootId);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete prompt');
    }
  };

  const handleRunPrompt = async (rowIds: number[], clearOutputsFirst: boolean = false) => {
    if (!selectedFileId || !csvData || !currentPrompt?.content) {
      return; // Validation prevents this, but guard anyway
    }

    const isAllRows = clearOutputsFirst && rowIds.length === csvData.rows.length;
    setIsRunning(true);
    setIsRunningAll(isAllRows);
    setError(null);
    setLatestEvaluation(null);

    try {
      // Clear outputs, annotations, and feedback first if requested (for "Run All" scenario)
      if (clearOutputsFirst) {
        // Immediately update UI to show cleared outputs
        setClearAllOutputs(true);
        
        const clearPromises = rowIds.map(rowId => 
          updateEvaluation(rowId, "", null, null)
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
        // Process all rows in this batch concurrently
        const batchPromises = batch.map(async (rowId) => {
          try {
            const evaluation = await runPrompt({
              promptId: currentPrompt.id,
              csvRowId: rowId,
              model: llmConfig.model,
              temperature: llmConfig.temperature,
              maxTokens: llmConfig.maxTokens,
            });
            
            // Use startTransition to mark this as a non-urgent update, preventing flickering
            startTransition(() => {
              setLatestEvaluation(evaluation);
            });
            
            return { success: true, rowId, evaluation };
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to run prompt for row ${rowId}`;
            setError(errorMessage);
            return { success: false, rowId, error: err };
          }
        });

        // Wait for all rows in this batch to complete (or fail)
        await Promise.allSettled(batchPromises);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run prompts');
    } finally {
      setIsRunning(false);
      setIsRunningAll(false);
      // Clear latestEvaluation after a brief delay to allow last update to process
      // But don't reload all data - incremental updates are already handled
      setTimeout(() => {
        setLatestEvaluation(null);
      }, 100);
    }
  };

  const handleRunAll = async () => {
    if (!csvData || csvData.rows.length === 0) {
      setError('No rows to run');
      return;
    }
    
    const allRowIds = csvData.rows.map(row => row.id);
    await handleRunPrompt(allRowIds, true);
  };

  const currentColumns = csvData?.columns || [];

  return (
    <div style={{ 
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '2px solid #ddd',
        backgroundColor: '#fff',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Evaluizer</h1>
      </div>
      
      {error && (
        <div style={{ 
          padding: '0.75rem 1.5rem', 
          backgroundColor: '#fee', 
          color: '#c33', 
          fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      <div style={{
        flex: 1,
        display: 'flex',
        gap: '1.5rem',
        padding: '1.5rem',
        overflow: 'hidden',
      }}>
        {/* Left Column - Upload, Prompt, and LLM Config (1/3) */}
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
          <CSVUpload onUploadSuccess={handleUploadSuccess} />
          {selectedFileId && (
            <>
              <PromptEditor
                prompt={currentPrompt}
                versions={promptVersions}
                columns={currentColumns}
                onSave={handleSavePrompt}
                onVersionSelect={handleVersionSelect}
                onVersionNameUpdate={handleVersionNameUpdate}
                onVersionDelete={handleDeletePrompt}
              />
              <LLMConfigPanel
                config={llmConfig}
                onConfigChange={setLlmConfig}
                onRunAll={handleRunAll}
                isRunning={isRunning}
                error={error}
                hasValidPrompt={!!currentPrompt && !!currentPrompt.content}
              />
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
            onSelectFile={setSelectedFileId}
            onDeleteFile={handleDeleteFile}
          />

          <div style={{
            flex: 1,
            overflow: 'hidden',
            minHeight: 0, // Important for flexbox overflow
          }}>
            {loading ? (
              <div style={{ 
                padding: '2rem', 
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                Loading...
              </div>
            ) : csvFiles.length === 0 && !selectedFileId ? (
              <div style={{ 
                padding: '2rem', 
                textAlign: 'center',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
              }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                  Welcome to Evaluizer
                </div>
                <div style={{ fontSize: '0.9rem' }}>
                  Upload a CSV file to get started
                </div>
              </div>
            ) : (
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
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
