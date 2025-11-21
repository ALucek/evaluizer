import { useState, useEffect, useRef, useCallback } from 'react';
import CSVFileList from './components/CSVFileList';
import DataTable from './components/DataTable';
import PromptEditor from './components/PromptEditor';
import CombinedEvaluationsPanel from './components/CombinedEvaluationsPanel';
import OptimizerPanel from './components/OptimizerPanel';
import './index.css';

// Hooks
import { useCSVFiles } from './hooks/useCSVFiles';
import { usePrompts } from './hooks/usePrompts';
import { useEvaluations } from './hooks/useEvaluations';
import { useJudges } from './hooks/useJudges';
import { useFunctionEvals } from './hooks/useFunctionEvals';

function App() {
  // 1. Error Handling
  const [error, setError] = useState<string | null>(null);
  const [errorTimestamp, setErrorTimestamp] = useState<Date | null>(null);

  const setErrorWithTimestamp = useCallback((errorMessage: string | null) => {
    setError(errorMessage);
    setErrorTimestamp(errorMessage ? new Date() : null);
  }, []);

  const isInitializingRef = useRef<boolean>(true);

  // 2. CSV Files Hook
  const {
    csvFiles,
    selectedFileId,
    csvData,
    loading,
    setSelectedFileId,
    handleUploadSuccess,
    handleDeleteFile,
    handleDropColumns,
    handleRenameColumn,
  } = useCSVFiles(setErrorWithTimestamp, isInitializingRef);

  // 3. Prompts Hook
  const {
    currentPrompt,
    currentSystemPrompt,
    currentUserMessageColumn,
    groupedPrompts,
    llmConfig,
    setLlmConfig,
    handlePromptContentChange,
    loadPrompt,
    loadGroupedPrompts,
    handleSavePrompt: savePromptInternal,
    handleVersionSelect,
    handleDeletePrompt: deletePromptInternal,
  } = usePrompts(selectedFileId, setErrorWithTimestamp);

  // 4. Judges Hook
  const {
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
  } = useJudges(selectedFileId, currentPrompt, csvData, setErrorWithTimestamp);

  // 5. Function Evals Hook
  const {
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
  } = useFunctionEvals(selectedFileId, currentPrompt, csvData, setErrorWithTimestamp);

  // 6. Evaluations Hook
  const {
    evaluations,
    latestEvaluation,
    isRunning,
    isRunningAll,
    isCancelling,
    setIsRunningGepa,
    isRunningGepa,
    clearAllOutputs,
    runningRowIds,
    loadEvaluations,
    handleUpdateRow,
    handleRunPrompt,
    handleRunAll,
    handleRunUnfilled,
    handleCancel,
    handleClearAllOutputs,
  } = useEvaluations(
    selectedFileId,
    csvData,
    currentPrompt,
    currentSystemPrompt,
    currentUserMessageColumn,
    llmConfig,
    judgeConfigs,
    functionEvalConfigs,
    loadJudgeResults,
    loadFunctionEvalResults,
    setErrorWithTimestamp
  );

  // Effects for data loading synchronization
  useEffect(() => {
    if (selectedFileId) {
      loadPrompt(selectedFileId);
      loadGroupedPrompts(selectedFileId);
      loadJudgeConfigs(selectedFileId);
      loadFunctionEvalConfigs(selectedFileId);
    }
  }, [selectedFileId, loadPrompt, loadGroupedPrompts, loadJudgeConfigs, loadFunctionEvalConfigs]);

  // Reload results when prompt or file changes
  useEffect(() => {
    if (selectedFileId && currentPrompt?.id) {
      loadJudgeResults(selectedFileId, currentPrompt.id);
      loadFunctionEvalResults(selectedFileId, currentPrompt.id);
      loadEvaluations(selectedFileId, currentPrompt.id);
    }
  }, [selectedFileId, currentPrompt?.id, loadJudgeResults, loadFunctionEvalResults, loadEvaluations]);

  // PromptEditor onSave signature matches usePrompts handleSavePrompt signature

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
                onSave={savePromptInternal}
                onVersionSelect={(versionId) => handleVersionSelect(versionId)}
                onDeletePrompt={(promptId) => deletePromptInternal(promptId)}
                onContentChange={handlePromptContentChange}
                llmConfig={llmConfig}
                onLLMConfigChange={setLlmConfig}
                onRunAll={handleRunAll}
                onRunUnfilled={handleRunUnfilled}
                onClearAllOutputs={handleClearAllOutputs}
                onCancel={handleCancel}
                isRunning={isRunning || isRunningGepa}
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
                  await loadGroupedPrompts(selectedFileId);
                  await handleVersionSelect(newPromptId);
                }}
                onGepaRunningChange={setIsRunningGepa}
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
                onRunJudgeForUnfilledRows={handleRunJudgeForUnfilledRows}
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
                onRunFunctionEvalForUnfilledRows={handleRunFunctionEvalForUnfilledRows}
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
                isRunning={isRunning || isRunningGepa}
                isRunningAll={isRunningAll}
                latestEvaluation={latestEvaluation}
                clearAllOutputs={clearAllOutputs}
                runningRowIds={runningRowIds}
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
