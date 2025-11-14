// API client functions
// Use relative URL to leverage Vite proxy, or full URL if proxy not working
const API_BASE_URL = '/api/v1';

export interface CSVFile {
  id: number;
  filename: string;
  uploaded_at: string;
  columns: string[];
  row_count: number;
}

export interface CSVRow {
  id: number;
  csv_file_id: number;
  row_data: Record<string, string>;
}

export interface CSVFileWithRows {
  id: number;
  filename: string;
  uploaded_at: string;
  columns: string[];
  row_count: number;
  rows: CSVRow[];
}

export interface Evaluation {
  id: number;
  csv_file_id: number;
  csv_row_id: number;
  output: string | null;
  annotation: number | null; // 1 for thumbs up, 0 for thumbs down, null for none
  feedback: string | null;
  created_at: string;
  updated_at: string;
}

export interface Prompt {
  id: number;
  name: string | null;
  system_prompt: string;
  user_message_column: string | null;
  csv_file_id: number | null;
  version: number;
  commit_message: string | null;
  parent_prompt_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface JudgeConfig {
  id: number;
  csv_file_id: number;
  name: string;
  prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface JudgeResult {
  id: number;
  config_id: number;
  csv_file_id: number;
  csv_row_id: number;
  score: number;
  raw_output: string | null;
  created_at: string;
  updated_at: string;
}

export interface FunctionEvalConfig {
  id: number;
  csv_file_id: number;
  name: string;
  function_name: string;
  config: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface FunctionEvalResult {
  id: number;
  config_id: number;
  csv_file_id: number;
  csv_row_id: number;
  score: number;
  details: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface Metric {
  id: number;
  csv_file_id: number;
  metric_type: 'human_annotation' | 'judge' | 'function_eval';
  config_id: number | null;
  threshold: number;
  created_at: string;
  updated_at: string;
}

// Legacy type alias for backward compatibility during migration
export type CSVData = CSVFile;
export type CSVDataWithRows = CSVFileWithRows;

export async function uploadCSV(file: File): Promise<CSVFile> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE_URL}/csv/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload CSV file: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function listCSVFiles(): Promise<CSVFile[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/csv/`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch CSV files: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function getCSVData(csvId: number): Promise<CSVFileWithRows> {
  try {
    const response = await fetch(`${API_BASE_URL}/csv/${csvId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch CSV data: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteCSV(csvId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/csv/${csvId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete CSV file: ${response.status} ${errorText}`);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function exportCSV(csvId: number, filename: string, promptId?: number): Promise<void> {
  try {
    const apiUrl = promptId 
      ? `${API_BASE_URL}/csv/${csvId}/export?prompt_id=${promptId}`
      : `${API_BASE_URL}/csv/${csvId}/export`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to export CSV file: ${response.status} ${errorText}`);
    }
    
    // Note: Backend now returns a ZIP file containing CSV and prompt TXT
    
    // Get the blob from the response
    const blob = await response.blob();
    
    // Create a download link and trigger it
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Get filename from Content-Disposition header or use provided filename
    const contentDisposition = response.headers.get('Content-Disposition');
    let downloadFilename = filename;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      if (filenameMatch) {
        downloadFilename = filenameMatch[1];
      }
    }
    
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function dropColumns(csvId: number, columns: string[]): Promise<CSVFile> {
  try {
    const response = await fetch(`${API_BASE_URL}/csv/${csvId}/drop-columns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ columns }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to drop columns: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function renameColumn(csvId: number, oldName: string, newName: string): Promise<CSVFile> {
  try {
    const response = await fetch(`${API_BASE_URL}/csv/${csvId}/rename-column`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ old_name: oldName, new_name: newName }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to rename column: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function getEvaluationsForCSV(csvId: number): Promise<Evaluation[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/evaluation/csv/${csvId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch evaluations: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function getEvaluationForRow(rowId: number): Promise<Evaluation | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/evaluation/row/${rowId}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch evaluation: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function updateEvaluation(
  rowId: number,
  output?: string | null,
  annotation?: number | null,
  feedback?: string | null
): Promise<Evaluation> {
  try {
    const body: { output?: string | null; annotation?: number | null; feedback?: string | null } = {};
    if (output !== undefined) {
      body.output = output;
    }
    if (annotation !== undefined) {
      body.annotation = annotation;
    }
    if (feedback !== undefined) {
      body.feedback = feedback;
    }

    const response = await fetch(`${API_BASE_URL}/evaluation/row/${rowId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update evaluation: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

// Legacy function for backward compatibility
export async function updateRow(
  csvId: number,
  rowId: number,
  annotation?: number | null,
  feedback?: string
): Promise<CSVRow> {
  // Use the new evaluation endpoint
  await updateEvaluation(rowId, undefined, annotation, feedback);
  // Return the row (we'd need to fetch it, but for now just return a placeholder)
  // This is kept for backward compatibility during migration
  return { id: rowId, csv_file_id: csvId, row_data: {} };
}

export async function listPrompts(csvFileId?: number, includeVersions: boolean = false): Promise<Prompt[]> {
  try {
    const url = csvFileId 
      ? `${API_BASE_URL}/prompt/?csv_file_id=${csvFileId}&include_versions=${includeVersions}`
      : `${API_BASE_URL}/prompt/?include_versions=${includeVersions}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch prompts: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function listPromptVersions(promptId: number): Promise<Prompt[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt/${promptId}/versions`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch prompt versions: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function listPromptsGroupedByName(csvFileId?: number): Promise<Record<string, Prompt[]>> {
  try {
    const url = csvFileId 
      ? `${API_BASE_URL}/prompt/grouped/by-name?csv_file_id=${csvFileId}`
      : `${API_BASE_URL}/prompt/grouped/by-name`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch grouped prompts: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function createPromptVersion(
  promptId: number,
  systemPrompt: string,
  userMessageColumn?: string | null,
  name?: string,
  commitMessage?: string
): Promise<Prompt> {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt/${promptId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_message_column: userMessageColumn || null,
        name: name || null,
        commit_message: commitMessage || null,
      }),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create prompt version: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function getPrompt(promptId: number): Promise<Prompt> {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt/${promptId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch prompt: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function createPrompt(
  systemPrompt: string,
  csvFileId?: number,
  name?: string,
  parentPromptId?: number,
  commitMessage?: string,
  userMessageColumn?: string | null
): Promise<Prompt> {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        user_message_column: userMessageColumn || null,
        csv_file_id: csvFileId || null,
        name: name || null,
        parent_prompt_id: parentPromptId || null,
        commit_message: commitMessage || null,
      }),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create prompt: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function updatePrompt(
  promptId: number,
  systemPrompt?: string,
  userMessageColumn?: string | null,
  name?: string,
  csvFileId?: number | null,
  commitMessage?: string
): Promise<Prompt> {
  try {
    const body: { system_prompt?: string; user_message_column?: string | null; name?: string; csv_file_id?: number | null; commit_message?: string } = {};
    if (systemPrompt !== undefined) {
      body.system_prompt = systemPrompt;
    }
    if (userMessageColumn !== undefined) {
      body.user_message_column = userMessageColumn;
    }
    if (name !== undefined) {
      body.name = name;
    }
    if (csvFileId !== undefined) {
      body.csv_file_id = csvFileId;
    }
    if (commitMessage !== undefined) {
      body.commit_message = commitMessage;
    }

    const response = await fetch(`${API_BASE_URL}/prompt/${promptId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to update prompt: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deletePrompt(promptId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt/${promptId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete prompt: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

// Legacy function for backward compatibility - creates/updates prompt for a CSV file
export async function updatePromptForCSV(csvId: number, systemPrompt: string, userMessageColumn?: string | null): Promise<CSVFile> {
  // Get existing prompts for this CSV file
  const prompts = await listPrompts(csvId);
  
  if (prompts.length > 0) {
    // Update the first prompt (or you could update all)
    await updatePrompt(prompts[0].id, systemPrompt, userMessageColumn);
  } else {
    // Create a new prompt
    await createPrompt(systemPrompt, csvId, undefined, undefined, undefined, userMessageColumn);
  }
  
  // Return the CSV file
  return getCSVData(csvId);
}

export interface RunPromptConfig {
  promptId: number;
  csvRowId: number;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;  // Optional override for system prompt (for unsaved edits)
  userMessageColumn?: string | null;  // Optional override for user message column (for unsaved edits)
}

export async function runPrompt(config: RunPromptConfig): Promise<Evaluation> {
  try {
    const body: any = {
      prompt_id: config.promptId,
      csv_row_id: config.csvRowId,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };
    
    // Include system_prompt if provided (for unsaved edits)
    if (config.systemPrompt !== undefined) {
      body.system_prompt = config.systemPrompt;
    }
    
    // Include user_message_column if provided (for unsaved edits)
    if (config.userMessageColumn !== undefined) {
      body.user_message_column = config.userMessageColumn;
    }
    
    const response = await fetch(`${API_BASE_URL}/llm/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage = `Failed to run prompt: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

// Judge evaluation API functions

export async function listJudgeConfigs(csvFileId: number): Promise<JudgeConfig[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/judge/configs?csv_file_id=${csvFileId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch judge configs: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function createJudgeConfig(
  csvFileId: number,
  name: string,
  prompt: string,
  llmConfig: { model: string; temperature: number; maxTokens: number }
): Promise<JudgeConfig> {
  try {
    const response = await fetch(`${API_BASE_URL}/judge/configs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        csv_file_id: csvFileId,
        name,
        prompt,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        max_tokens: llmConfig.maxTokens,
      }),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create judge config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function updateJudgeConfig(
  id: number,
  partial: {
    name?: string;
    prompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<JudgeConfig> {
  try {
    const body: any = {};
    if (partial.name !== undefined) body.name = partial.name;
    if (partial.prompt !== undefined) body.prompt = partial.prompt;
    if (partial.model !== undefined) body.model = partial.model;
    if (partial.temperature !== undefined) body.temperature = partial.temperature;
    if (partial.maxTokens !== undefined) body.max_tokens = partial.maxTokens;

    const response = await fetch(`${API_BASE_URL}/judge/configs/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to update judge config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteJudgeConfig(id: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/judge/configs/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete judge config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function getJudgeResultsForCSV(csvId: number): Promise<JudgeResult[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/judge/results/csv/${csvId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch judge results: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function runJudge(config: { configId: number; csvRowId: number }): Promise<JudgeResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/judge/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config_id: config.configId,
        csv_row_id: config.csvRowId,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Failed to run judge: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteJudgeResult(configId: number, rowId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/judge/results/config/${configId}/row/${rowId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete judge result: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteJudgeResultsForConfig(configId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/judge/results/config/${configId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete judge results: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

// Function evaluation API functions

export interface FunctionEvaluationInfo {
  name: string;
  description: string;
}

export async function listFunctionEvaluations(): Promise<FunctionEvaluationInfo[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-evaluations/`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch function evaluations: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function listFunctionEvalConfigs(csvFileId: number): Promise<FunctionEvalConfig[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-eval/configs?csv_file_id=${csvFileId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch function eval configs: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function createFunctionEvalConfig(
  csvFileId: number,
  name: string,
  functionName: string,
  config?: Record<string, any>
): Promise<FunctionEvalConfig> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-eval/configs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        csv_file_id: csvFileId,
        name,
        function_name: functionName,
        config: config || null,
      }),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create function eval config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function updateFunctionEvalConfig(
  id: number,
  partial: {
    name?: string;
    config?: Record<string, any>;
  }
): Promise<FunctionEvalConfig> {
  try {
    const body: any = {};
    if (partial.name !== undefined) body.name = partial.name;
    if (partial.config !== undefined) body.config = partial.config;

    const response = await fetch(`${API_BASE_URL}/function-eval/configs/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to update function eval config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteFunctionEvalConfig(id: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-eval/configs/${id}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete function eval config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function getFunctionEvalResultsForCSV(csvId: number): Promise<FunctionEvalResult[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-eval/results/csv/${csvId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch function eval results: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function runFunctionEval(configId: number, csvRowId: number): Promise<FunctionEvalResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-eval/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config_id: configId,
        csv_row_id: csvRowId,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Failed to run function eval: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteFunctionEvalResult(configId: number, rowId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-eval/results/config/${configId}/row/${rowId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete function eval result: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteFunctionEvalResultsForConfig(configId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/function-eval/results/config/${configId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete function eval results: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

// Metric/Threshold API functions
export async function listMetrics(csvFileId: number): Promise<Metric[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/csv/${csvFileId}/metrics`);
    
    if (!response.ok) {
      let errorMessage = `Failed to list metrics: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function createOrUpdateMetric(
  csvFileId: number,
  metricType: 'human_annotation' | 'judge' | 'function_eval',
  threshold: number,
  configId?: number | null
): Promise<Metric> {
  try {
    const response = await fetch(`${API_BASE_URL}/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        csv_file_id: csvFileId,
        metric_type: metricType,
        config_id: configId ?? null,
        threshold: threshold,
      }),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create/update metric: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteMetric(metricId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/metrics/${metricId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete metric: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

// GEPA Optimizer types and API

export interface GepaConfig {
  id: number;
  csv_file_id: number;
  name: string;
  base_prompt_id: number;  // Required
  judge_config_ids: number[] | null;
  function_eval_config_ids: number[] | null;
  generator_model: string;  // Model for generating outputs (the model you're optimizing for)
  reflection_model: string;  // Model for reflection/meta-prompt
  generator_temperature: number;
  generator_max_tokens: number;
  reflection_temperature: number;
  reflection_max_tokens: number;
  max_metric_calls: number;
  created_at: string;
  updated_at: string;
}

export interface CreateGepaConfigPayload {
  csv_file_id: number;
  name: string;
  base_prompt_id: number;  // Required - must have a prompt to optimize
  judge_config_ids?: number[] | null;
  function_eval_config_ids?: number[] | null;
  generator_model?: string;  // Model for generating outputs
  reflection_model?: string;  // Model for reflection/meta-prompt (defaults to generator_model if not specified)
  generator_temperature?: number;
  generator_max_tokens?: number;
  reflection_temperature?: number;
  reflection_max_tokens?: number;
  max_metric_calls?: number;
}

export interface RunGepaResponse {
  best_prompt: string;
  new_prompt_id: number;
  score: number;
  logs?: string | null;
}

export interface GepaProgress {
  status: 'waiting' | 'running' | 'completed' | 'error';
  current_iteration: number;
  max_iterations: number;
  current_score: number | null;
  best_score: number | null;
  message: string;
  updated_at: string;
  new_prompt_id?: number | null;
}

export async function listGepaConfigs(csvFileId: number): Promise<GepaConfig[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/optimizer/gepa/configs?csv_file_id=${csvFileId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch GEPA configs: ${response.status} ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function createGepaConfig(payload: CreateGepaConfigPayload): Promise<GepaConfig> {
  try {
    const response = await fetch(`${API_BASE_URL}/optimizer/gepa/configs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to create GEPA config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function updateGepaConfig(
  configId: number,
  payload: Partial<CreateGepaConfigPayload>
): Promise<GepaConfig> {
  try {
    const response = await fetch(`${API_BASE_URL}/optimizer/gepa/configs/${configId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to update GEPA config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function deleteGepaConfig(configId: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/optimizer/gepa/configs/${configId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete GEPA config: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export async function runGepa(configId: number): Promise<RunGepaResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/optimizer/gepa/configs/${configId}/run`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to run GEPA optimization: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

export function subscribeToGepaProgress(
  configId: number,
  onProgress: (progress: GepaProgress) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): () => void {
  const eventSource = new EventSource(`${API_BASE_URL}/optimizer/gepa/configs/${configId}/progress`);
  
  eventSource.onmessage = (event) => {
    try {
      const progress = JSON.parse(event.data) as GepaProgress;
      
      if (progress.status === 'closed') {
        eventSource.close();
        if (onComplete) onComplete();
        return;
      }
      
      onProgress(progress);
      
      if (progress.status === 'completed' || progress.status === 'error') {
        eventSource.close();
        if (onComplete) onComplete();
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error('Failed to parse progress'));
      }
    }
  };
  
  eventSource.onerror = (error) => {
    // Don't close on first error - EventSource will retry
    // Only close if the readyState indicates it's closed
    if (eventSource.readyState === EventSource.CLOSED) {
      if (onError) {
        onError(new Error('EventSource connection closed'));
      }
    }
  };
  
  // Return cleanup function
  return () => {
    eventSource.close();
  };
}
