import { useState, useCallback } from 'react';
import { 
  Prompt, 
  listPrompts, 
  getPrompt, 
  listPromptVersions, 
  listPromptsGroupedByName, 
  createPrompt, 
  createPromptVersion, 
  updatePrompt, 
  deletePrompt 
} from '../services/api';
import { LLMConfig } from '../components/PromptEditor';

interface UsePromptsReturn {
  currentPrompt: Prompt | null;
  currentSystemPrompt: string;
  currentUserMessageColumn: string | null;
  promptVersions: Prompt[];
  groupedPrompts: Record<string, Prompt[]>;
  llmConfig: LLMConfig;
  setLlmConfig: React.Dispatch<React.SetStateAction<LLMConfig>>;
  setCurrentPrompt: (prompt: Prompt | null) => void;
  setCurrentSystemPrompt: (prompt: string) => void;
  setCurrentUserMessageColumn: (col: string | null) => void;
  handlePromptContentChange: (systemPrompt: string, userMessageColumn: string | null) => void;
  loadPrompt: (csvFileId: number) => Promise<void>;
  loadPromptVersions: (promptId: number, preservePromptId?: number) => Promise<void>;
  loadGroupedPrompts: (csvFileId: number) => Promise<void>;
  handleSavePrompt: (
    systemPrompt: string, 
    userMessageColumn: string | null, 
    createNewVersion: boolean, 
    name?: string, 
    commitMessage?: string
  ) => Promise<void>;
  handleVersionNameUpdate: (versionId: number, newName: string | null) => Promise<void>;
  handleVersionSelect: (versionId: number) => Promise<void>;
  handleDeletePrompt: (promptId: number) => Promise<void>;
}

export function usePrompts(
  selectedFileId: number | null,
  setErrorWithTimestamp: (errorMessage: string | null) => void
): UsePromptsReturn {
  const [currentPrompt, setCurrentPrompt] = useState<Prompt | null>(null);
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>('');
  const [currentUserMessageColumn, setCurrentUserMessageColumn] = useState<string | null>(null);
  const [promptVersions, setPromptVersions] = useState<Prompt[]>([]);
  const [groupedPrompts, setGroupedPrompts] = useState<Record<string, Prompt[]>>({});
  
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    model: 'gpt-5-mini',
    temperature: 1.0,
    maxTokens: 2000,
    concurrency: 10,
  });

  const handlePromptContentChange = useCallback((systemPrompt: string, userMessageColumn: string | null) => {
    setCurrentSystemPrompt(systemPrompt);
    setCurrentUserMessageColumn(userMessageColumn);
  }, []);

  const loadPromptVersions = useCallback(async (promptId: number, preservePromptId?: number) => {
    try {
      const versions = await listPromptVersions(promptId);
      setPromptVersions(versions);
      
      if (preservePromptId !== undefined) {
        const savedVersion = versions.find(v => v.id === preservePromptId);
        if (savedVersion) {
          setCurrentPrompt(savedVersion);
          if (savedVersion.model || savedVersion.temperature !== null || savedVersion.max_tokens !== null || savedVersion.concurrency !== null) {
            setLlmConfig(prev => ({
              model: savedVersion.model || prev.model,
              temperature: savedVersion.temperature ?? prev.temperature,
              maxTokens: savedVersion.max_tokens ?? prev.maxTokens,
              concurrency: savedVersion.concurrency ?? prev.concurrency,
            }));
          }
          return;
        }
      }
      
      const currentVersion = versions.find(v => v.id === promptId);
      if (currentVersion) {
        setCurrentPrompt(currentVersion);
        if (currentVersion.model || currentVersion.temperature !== null || currentVersion.max_tokens !== null || currentVersion.concurrency !== null) {
          setLlmConfig(prev => ({
            model: currentVersion.model || prev.model,
            temperature: currentVersion.temperature ?? prev.temperature,
            maxTokens: currentVersion.max_tokens ?? prev.maxTokens,
            concurrency: currentVersion.concurrency ?? prev.concurrency,
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load prompt versions:', err);
      setPromptVersions([]);
    }
  }, []);

  const loadPrompt = useCallback(async (csvFileId: number) => {
    try {
      const prompts = await listPrompts(csvFileId, false);
      if (prompts.length > 0) {
        const savedPromptIdKey = `selectedPrompt_${csvFileId}`;
        const savedPromptId = localStorage.getItem(savedPromptIdKey);
        let promptToLoad = prompts[0];
        
        if (savedPromptId) {
          try {
            const savedId = parseInt(savedPromptId, 10);
            const savedPrompt = prompts.find(p => p.id === savedId);
            if (savedPrompt) {
              promptToLoad = savedPrompt;
            } else {
              try {
                const loadedPrompt = await getPrompt(savedId);
                if (loadedPrompt.csv_file_id === csvFileId || loadedPrompt.csv_file_id === null) {
                  promptToLoad = loadedPrompt;
                }
              } catch {
                // Ignore
              }
            }
          } catch {
            // Ignore
          }
        }
        
        setCurrentPrompt(promptToLoad);
        localStorage.setItem(`selectedPrompt_${csvFileId}`, promptToLoad.id.toString());
        
        if (promptToLoad.model || promptToLoad.temperature !== null || promptToLoad.max_tokens !== null || promptToLoad.concurrency !== null) {
          setLlmConfig(prev => ({
            model: promptToLoad.model || prev.model,
            temperature: promptToLoad.temperature ?? prev.temperature,
            maxTokens: promptToLoad.max_tokens ?? prev.maxTokens,
            concurrency: promptToLoad.concurrency ?? prev.concurrency,
          }));
        }
        
        const rootPromptId = promptToLoad.parent_prompt_id || promptToLoad.id;
        await loadPromptVersions(rootPromptId, promptToLoad.id);
      } else {
        setCurrentPrompt(null);
        setPromptVersions([]);
        localStorage.removeItem(`selectedPrompt_${csvFileId}`);
      }
    } catch (err) {
      setCurrentPrompt(null);
      setPromptVersions([]);
    }
  }, [loadPromptVersions]);

  const loadGroupedPrompts = useCallback(async (csvFileId: number) => {
    try {
      const grouped = await listPromptsGroupedByName(csvFileId);
      setGroupedPrompts(grouped);
    } catch (err) {
      console.error('Failed to load grouped prompts:', err);
      setGroupedPrompts({});
    }
  }, []);

  const handleSavePrompt = useCallback(async (
    systemPrompt: string, 
    userMessageColumn: string | null, 
    createNewVersion: boolean, 
    name?: string, 
    commitMessage?: string
  ) => {
    if (!selectedFileId) return;
    try {
      if (name && name.trim()) {
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
        if (createNewVersion) {
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
          // Update existing version in place
          const updated = await updatePrompt(
            currentPrompt.id,
            systemPrompt,
            userMessageColumn,
            undefined,
            undefined,
            commitMessage,
            llmConfig.model,
            llmConfig.temperature,
            llmConfig.maxTokens,
            llmConfig.concurrency
          );
          setCurrentPrompt(updated);
          // We might need to reload versions if metadata changed, though ID stays same
          const rootPromptId = updated.parent_prompt_id || updated.id;
          await loadPromptVersions(rootPromptId); 
          await loadGroupedPrompts(selectedFileId);
        }
      } else {
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
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to save prompt');
      throw err;
    }
  }, [selectedFileId, currentPrompt, llmConfig, loadPromptVersions, loadGroupedPrompts, setErrorWithTimestamp]);

  const handleVersionNameUpdate = useCallback(async (versionId: number, newName: string | null) => {
    try {
      const updated = await updatePrompt(versionId, undefined, undefined, newName ?? undefined);
      if (currentPrompt?.id === versionId) {
        setCurrentPrompt(updated);
      }
      const rootPromptId = updated.parent_prompt_id || updated.id;
      await loadPromptVersions(rootPromptId);
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to update version name');
      throw err;
    }
  }, [currentPrompt, loadPromptVersions, setErrorWithTimestamp]);

  const handleVersionSelect = useCallback(async (versionId: number) => {
    try {
      const selectedVersion = await getPrompt(versionId);
      setCurrentPrompt(selectedVersion);
      
      if (selectedFileId) {
        const savedPromptIdKey = `selectedPrompt_${selectedFileId}`;
        localStorage.setItem(savedPromptIdKey, selectedVersion.id.toString());
      }
      
      if (selectedVersion.model || selectedVersion.temperature !== null || selectedVersion.max_tokens !== null || selectedVersion.concurrency !== null) {
        setLlmConfig(prev => ({
          model: selectedVersion.model || prev.model,
          temperature: selectedVersion.temperature ?? prev.temperature,
          maxTokens: selectedVersion.max_tokens ?? prev.maxTokens,
          concurrency: selectedVersion.concurrency ?? prev.concurrency,
        }));
      }
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to load prompt version');
    }
  }, [selectedFileId, setErrorWithTimestamp]);

  const handleDeletePrompt = useCallback(async (promptId: number) => {
    if (!selectedFileId) return;

    try {
      const wasCurrentPrompt = currentPrompt?.id === promptId;
      const currentPromptName = currentPrompt?.name || 'Unnamed';
      
      await deletePrompt(promptId);
      
      const updatedGrouped = await listPromptsGroupedByName(selectedFileId);
      setGroupedPrompts(updatedGrouped);
      
      if (wasCurrentPrompt) {
        const samePromptVersions = updatedGrouped[currentPromptName];
        if (samePromptVersions && samePromptVersions.length > 0) {
          await handleVersionSelect(samePromptVersions[samePromptVersions.length - 1].id);
          setErrorWithTimestamp(null);
          return;
        }
        
        const remainingPrompts = Object.values(updatedGrouped).flat();
        if (remainingPrompts.length > 0) {
          const firstPromptName = Object.keys(updatedGrouped)[0];
          const firstPromptVersions = updatedGrouped[firstPromptName];
          if (firstPromptVersions && firstPromptVersions.length > 0) {
            await handleVersionSelect(firstPromptVersions[firstPromptVersions.length - 1].id);
          }
        } else {
          setCurrentPrompt(null);
          setPromptVersions([]);
        }
      }
      setErrorWithTimestamp(null);
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to delete prompt');
      throw err;
    }
  }, [selectedFileId, currentPrompt, handleVersionSelect, setErrorWithTimestamp]);

  return {
    currentPrompt,
    currentSystemPrompt,
    currentUserMessageColumn,
    promptVersions,
    groupedPrompts,
    llmConfig,
    setLlmConfig,
    setCurrentPrompt,
    setCurrentSystemPrompt,
    setCurrentUserMessageColumn,
    handlePromptContentChange,
    loadPrompt,
    loadPromptVersions,
    loadGroupedPrompts,
    handleSavePrompt,
    handleVersionNameUpdate,
    handleVersionSelect,
    handleDeletePrompt,
  };
}
