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
  prompt_id: number;
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
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  concurrency: number | null;
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
  prompt_id: number;
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
  prompt_id: number;
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

// Generic fetch wrapper to handle errors
async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    
    if (!response.ok) {
      let errorMessage = `Failed request to ${endpoint}: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses (e.g. DELETE)
    if (response.status === 204) {
      return {} as T;
    }

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json')) {
        return response as any; // Return response object for blob handling etc.
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend server. Make sure the backend is running on http://localhost:8000');
    }
    throw error;
  }
}

// --- CSV Endpoints ---

export async function uploadCSV(file: File): Promise<CSVFile> {
  const formData = new FormData();
  formData.append('file', file);
  return fetchAPI<CSVFile>('/csv/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function listCSVFiles(): Promise<CSVFile[]> {
  return fetchAPI<CSVFile[]>('/csv/');
}

export async function getCSVData(csvId: number): Promise<CSVFileWithRows> {
  return fetchAPI<CSVFileWithRows>(`/csv/${csvId}`);
}

export async function deleteCSV(csvId: number): Promise<void> {
  return fetchAPI<void>(`/csv/${csvId}`, { method: 'DELETE' });
}

export async function exportCSV(csvId: number, filename: string, promptId?: number): Promise<void> {
  const endpoint = promptId 
    ? `/csv/${csvId}/export?prompt_id=${promptId}`
    : `/csv/${csvId}/export`;
    
  const response = await fetchAPI<Response>(endpoint);
  
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
}

export async function dropColumns(csvId: number, columns: string[]): Promise<CSVFile> {
  return fetchAPI<CSVFile>(`/csv/${csvId}/drop-columns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columns }),
  });
}

export async function renameColumn(csvId: number, oldName: string, newName: string): Promise<CSVFile> {
  return fetchAPI<CSVFile>(`/csv/${csvId}/rename-column`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_name: oldName, new_name: newName }),
  });
}

// --- Evaluation Endpoints ---

export async function getEvaluationsForCSV(csvId: number, promptId: number): Promise<Evaluation[]> {
  return fetchAPI<Evaluation[]>(`/evaluation/csv/${csvId}?prompt_id=${promptId}`);
}

export async function getEvaluationForRow(rowId: number, promptId: number): Promise<Evaluation | null> {
  try {
    return await fetchAPI<Evaluation>(`/evaluation/row/${rowId}?prompt_id=${promptId}`);
  } catch (error: any) {
    if (error.message.includes('404')) return null;
    throw error;
  }
}

export async function updateEvaluation(
  rowId: number,
  promptId: number,
  output?: string | null,
  annotation?: number | null,
  feedback?: string | null
): Promise<Evaluation> {
  const body: any = { prompt_id: promptId };
  if (output !== undefined) body.output = output;
  if (annotation !== undefined) body.annotation = annotation;
  if (feedback !== undefined) body.feedback = feedback;

  return fetchAPI<Evaluation>(`/evaluation/row/${rowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Legacy function for backward compatibility
export async function updateRow(
  csvId: number,
  rowId: number,
  promptId: number,
  annotation?: number | null,
  feedback?: string
): Promise<CSVRow> {
  await updateEvaluation(rowId, promptId, undefined, annotation, feedback);
  return { id: rowId, csv_file_id: csvId, row_data: {} };
}

// --- Prompt Endpoints ---

export async function listPrompts(csvFileId?: number, includeVersions: boolean = false): Promise<Prompt[]> {
  const query = new URLSearchParams({ include_versions: String(includeVersions) });
  if (csvFileId) query.append('csv_file_id', String(csvFileId));
  return fetchAPI<Prompt[]>(`/prompt/?${query.toString()}`);
}

export async function listPromptVersions(promptId: number): Promise<Prompt[]> {
  return fetchAPI<Prompt[]>(`/prompt/${promptId}/versions`);
}

export async function listPromptsGroupedByName(csvFileId?: number): Promise<Record<string, Prompt[]>> {
  const query = csvFileId ? `?csv_file_id=${csvFileId}` : '';
  return fetchAPI<Record<string, Prompt[]>>(`/prompt/grouped/by-name${query}`);
}

export async function createPromptVersion(
  promptId: number,
  systemPrompt: string,
  userMessageColumn?: string | null,
  name?: string,
  commitMessage?: string,
  model?: string | null,
  temperature?: number | null,
  maxTokens?: number | null,
  concurrency?: number | null
): Promise<Prompt> {
  return fetchAPI<Prompt>(`/prompt/${promptId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_prompt: systemPrompt,
      user_message_column: userMessageColumn || null,
      name: name || null,
      commit_message: commitMessage || null,
      model: model ?? null,
      temperature: temperature ?? null,
      max_tokens: maxTokens ?? null,
      concurrency: concurrency ?? null,
    }),
  });
}

export async function getPrompt(promptId: number): Promise<Prompt> {
  return fetchAPI<Prompt>(`/prompt/${promptId}`);
}

export async function createPrompt(
  systemPrompt: string,
  csvFileId?: number,
  name?: string,
  parentPromptId?: number,
  commitMessage?: string,
  userMessageColumn?: string | null,
  model?: string | null,
  temperature?: number | null,
  maxTokens?: number | null,
  concurrency?: number | null
): Promise<Prompt> {
  return fetchAPI<Prompt>('/prompt/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_prompt: systemPrompt,
      user_message_column: userMessageColumn || null,
      csv_file_id: csvFileId || null,
      name: name || null,
      parent_prompt_id: parentPromptId || null,
      commit_message: commitMessage || null,
      model: model || null,
      temperature: temperature ?? null,
      max_tokens: maxTokens ?? null,
      concurrency: concurrency ?? null,
    }),
  });
}

export async function updatePrompt(
  promptId: number,
  systemPrompt?: string,
  userMessageColumn?: string | null,
  name?: string,
  csvFileId?: number | null,
  commitMessage?: string,
  model?: string | null,
  temperature?: number | null,
  maxTokens?: number | null,
  concurrency?: number | null
): Promise<Prompt> {
  const body: any = {};
  if (systemPrompt !== undefined) body.system_prompt = systemPrompt;
  if (userMessageColumn !== undefined) body.user_message_column = userMessageColumn;
  if (name !== undefined) body.name = name;
  if (csvFileId !== undefined) body.csv_file_id = csvFileId;
  if (commitMessage !== undefined) body.commit_message = commitMessage;
  if (model !== undefined) body.model = model;
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  if (concurrency !== undefined) body.concurrency = concurrency;

  return fetchAPI<Prompt>(`/prompt/${promptId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deletePrompt(promptId: number): Promise<void> {
  return fetchAPI<void>(`/prompt/${promptId}`, { method: 'DELETE' });
}

// Legacy function for backward compatibility
export async function updatePromptForCSV(csvId: number, systemPrompt: string, userMessageColumn?: string | null): Promise<CSVFile> {
  const prompts = await listPrompts(csvId);
  if (prompts.length > 0) {
    await updatePrompt(prompts[0].id, systemPrompt, userMessageColumn);
  } else {
    await createPrompt(systemPrompt, csvId, undefined, undefined, undefined, userMessageColumn);
  }
  return getCSVData(csvId);
}

export interface RunPromptConfig {
  promptId: number;
  csvRowId: number;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  userMessageColumn?: string | null;
}

export async function runPrompt(config: RunPromptConfig): Promise<Evaluation> {
  const body: any = {
    prompt_id: config.promptId,
    csv_row_id: config.csvRowId,
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  };
  if (config.systemPrompt !== undefined) body.system_prompt = config.systemPrompt;
  if (config.userMessageColumn !== undefined) body.user_message_column = config.userMessageColumn;

  return fetchAPI<Evaluation>('/llm/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- Judge Endpoints ---

export async function listJudgeConfigs(csvFileId: number): Promise<JudgeConfig[]> {
  return fetchAPI<JudgeConfig[]>(`/judge/configs?csv_file_id=${csvFileId}`);
}

export async function createJudgeConfig(
  csvFileId: number,
  name: string,
  prompt: string,
  llmConfig: { model: string; temperature: number; maxTokens: number }
): Promise<JudgeConfig> {
  return fetchAPI<JudgeConfig>('/judge/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csv_file_id: csvFileId,
      name,
      prompt,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      max_tokens: llmConfig.maxTokens,
    }),
  });
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
  const body: any = {};
  if (partial.name !== undefined) body.name = partial.name;
  if (partial.prompt !== undefined) body.prompt = partial.prompt;
  if (partial.model !== undefined) body.model = partial.model;
  if (partial.temperature !== undefined) body.temperature = partial.temperature;
  if (partial.maxTokens !== undefined) body.max_tokens = partial.maxTokens;

  return fetchAPI<JudgeConfig>(`/judge/configs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteJudgeConfig(id: number): Promise<void> {
  return fetchAPI<void>(`/judge/configs/${id}`, { method: 'DELETE' });
}

export async function getJudgeResultsForCSV(csvId: number, promptId: number): Promise<JudgeResult[]> {
  return fetchAPI<JudgeResult[]>(`/judge/results/csv/${csvId}?prompt_id=${promptId}`);
}

export async function runJudge(config: { configId: number; csvRowId: number; promptId: number }): Promise<JudgeResult> {
  return fetchAPI<JudgeResult>('/judge/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config_id: config.configId,
      csv_row_id: config.csvRowId,
      prompt_id: config.promptId,
    }),
  });
}

export async function deleteJudgeResult(configId: number, rowId: number, promptId: number): Promise<void> {
  return fetchAPI<void>(`/judge/results/config/${configId}/row/${rowId}?prompt_id=${promptId}`, { method: 'DELETE' });
}

export async function deleteJudgeResultsForConfig(configId: number, promptId?: number): Promise<void> {
  const url = promptId !== undefined
    ? `/judge/results/config/${configId}?prompt_id=${promptId}`
    : `/judge/results/config/${configId}`;
  return fetchAPI<void>(url, { method: 'DELETE' });
}

// --- Function Evaluation Endpoints ---

export interface FunctionEvaluationInfo {
  name: string;
  description: string;
}

export async function listFunctionEvaluations(): Promise<FunctionEvaluationInfo[]> {
  return fetchAPI<FunctionEvaluationInfo[]>('/function-eval/plugins');
}

export async function listFunctionEvalConfigs(csvFileId: number): Promise<FunctionEvalConfig[]> {
  return fetchAPI<FunctionEvalConfig[]>(`/function-eval/configs?csv_file_id=${csvFileId}`);
}

export async function createFunctionEvalConfig(
  csvFileId: number,
  name: string,
  functionName: string,
  config?: Record<string, any>
): Promise<FunctionEvalConfig> {
  return fetchAPI<FunctionEvalConfig>('/function-eval/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csv_file_id: csvFileId,
      name,
      function_name: functionName,
      config: config || null,
    }),
  });
}

export async function updateFunctionEvalConfig(
  id: number,
  partial: { name?: string; config?: Record<string, any> }
): Promise<FunctionEvalConfig> {
  const body: any = {};
  if (partial.name !== undefined) body.name = partial.name;
  if (partial.config !== undefined) body.config = partial.config;

  return fetchAPI<FunctionEvalConfig>(`/function-eval/configs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteFunctionEvalConfig(id: number): Promise<void> {
  return fetchAPI<void>(`/function-eval/configs/${id}`, { method: 'DELETE' });
}

export async function getFunctionEvalResultsForCSV(csvId: number, promptId: number): Promise<FunctionEvalResult[]> {
  return fetchAPI<FunctionEvalResult[]>(`/function-eval/results/csv/${csvId}?prompt_id=${promptId}`);
}

export async function runFunctionEval(configId: number, csvRowId: number, promptId: number): Promise<FunctionEvalResult> {
  return fetchAPI<FunctionEvalResult>('/function-eval/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config_id: configId,
      csv_row_id: csvRowId,
      prompt_id: promptId,
    }),
  });
}

export async function deleteFunctionEvalResult(configId: number, rowId: number, promptId: number): Promise<void> {
  return fetchAPI<void>(`/function-eval/results/config/${configId}/row/${rowId}?prompt_id=${promptId}`, { method: 'DELETE' });
}

export async function deleteFunctionEvalResultsForConfig(configId: number, promptId?: number): Promise<void> {
  const url = promptId !== undefined
    ? `/function-eval/results/config/${configId}?prompt_id=${promptId}`
    : `/function-eval/results/config/${configId}`;
  return fetchAPI<void>(url, { method: 'DELETE' });
}

// --- Metric Endpoints ---

export async function listMetrics(csvFileId: number): Promise<Metric[]> {
  return fetchAPI<Metric[]>(`/csv/${csvFileId}/metrics`);
}

export async function createOrUpdateMetric(
  csvFileId: number,
  metricType: 'human_annotation' | 'judge' | 'function_eval',
  threshold: number,
  configId?: number | null
): Promise<Metric> {
  return fetchAPI<Metric>('/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csv_file_id: csvFileId,
      metric_type: metricType,
      config_id: configId ?? null,
      threshold: threshold,
    }),
  });
}

export async function deleteMetric(metricId: number): Promise<void> {
  return fetchAPI<void>(`/metrics/${metricId}`, { method: 'DELETE' });
}

// --- Best Prompt Endpoints ---

export interface BestPromptInfo {
  id: number;
  name: string | null;
  version: number;
  average_score: number;
  result_count: number;
}

export interface BestPromptsResponse {
  human_annotation?: BestPromptInfo | null;
  judge_configs: Record<number, BestPromptInfo | null>;
  function_eval_configs: Record<number, BestPromptInfo | null>;
}

export async function getBestPromptsForMetrics(csvFileId: number): Promise<BestPromptsResponse> {
  return fetchAPI<BestPromptsResponse>(`/metrics/${csvFileId}/best-prompts`);
}

// --- GEPA Endpoints ---

export interface GepaConfig {
  id: number;
  csv_file_id: number;
  name: string;
  base_prompt_id: number;
  judge_config_ids: number[] | null;
  function_eval_config_ids: number[] | null;
  generator_model: string;
  reflection_model: string;
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
  base_prompt_id: number;
  judge_config_ids?: number[] | null;
  function_eval_config_ids?: number[] | null;
  generator_model?: string;
  reflection_model?: string;
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
  status: 'waiting' | 'running' | 'completed' | 'error' | 'closed';
  current_iteration: number;
  max_iterations: number;
  current_score: number | null;
  best_score: number | null;
  message: string;
  updated_at: string;
  started_at?: string;
  new_prompt_id?: number | null;
}

export async function listGepaConfigs(csvFileId: number): Promise<GepaConfig[]> {
  return fetchAPI<GepaConfig[]>(`/optimizer/gepa/configs?csv_file_id=${csvFileId}`);
}

export async function createGepaConfig(payload: CreateGepaConfigPayload): Promise<GepaConfig> {
  return fetchAPI<GepaConfig>('/optimizer/gepa/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateGepaConfig(
  configId: number,
  payload: Partial<CreateGepaConfigPayload>
): Promise<GepaConfig> {
  return fetchAPI<GepaConfig>(`/optimizer/gepa/configs/${configId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteGepaConfig(configId: number): Promise<void> {
  return fetchAPI<void>(`/optimizer/gepa/configs/${configId}`, { method: 'DELETE' });
}

export async function runGepa(configId: number): Promise<RunGepaResponse> {
  return fetchAPI<RunGepaResponse>(`/optimizer/gepa/configs/${configId}/run`, { method: 'POST' });
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
      // Parse with unknown first to safely cast
      const parsed = JSON.parse(event.data);
      
      // Handle the special "closed" message from backend
      if (parsed.status === 'closed') {
        eventSource.close();
        if (onComplete) onComplete();
        return;
      }
      
      const progress = parsed as GepaProgress;
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
    // Prevent linter warning about unused variable
    console.debug('SSE Error:', error);
    if (eventSource.readyState === EventSource.CLOSED) {
      if (onError) {
        onError(new Error('EventSource connection closed'));
      }
    }
  };
  
  return () => {
    eventSource.close();
  };
}
