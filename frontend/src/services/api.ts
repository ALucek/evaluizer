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
  content: string;
  csv_file_id: number | null;
  version: number;
  parent_prompt_id: number | null;
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

export async function exportCSV(csvId: number, filename: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/csv/${csvId}/export`);
    
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

export async function createPromptVersion(
  promptId: number,
  content: string,
  name?: string
): Promise<Prompt> {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt/${promptId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        name: name || null,
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
  content: string,
  csvFileId?: number,
  name?: string,
  parentPromptId?: number
): Promise<Prompt> {
  try {
    const response = await fetch(`${API_BASE_URL}/prompt/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        csv_file_id: csvFileId || null,
        name: name || null,
        parent_prompt_id: parentPromptId || null,
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
  content?: string,
  name?: string,
  csvFileId?: number | null
): Promise<Prompt> {
  try {
    const body: { content?: string; name?: string; csv_file_id?: number | null } = {};
    if (content !== undefined) {
      body.content = content;
    }
    if (name !== undefined) {
      body.name = name;
    }
    if (csvFileId !== undefined) {
      body.csv_file_id = csvFileId;
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
export async function updatePromptForCSV(csvId: number, prompt: string): Promise<CSVFile> {
  // Get existing prompts for this CSV file
  const prompts = await listPrompts(csvId);
  
  if (prompts.length > 0) {
    // Update the first prompt (or you could update all)
    await updatePrompt(prompts[0].id, prompt);
  } else {
    // Create a new prompt
    await createPrompt(prompt, csvId);
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
}

export async function runPrompt(config: RunPromptConfig): Promise<Evaluation> {
  try {
    const response = await fetch(`${API_BASE_URL}/llm/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt_id: config.promptId,
        csv_row_id: config.csvRowId,
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      }),
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
