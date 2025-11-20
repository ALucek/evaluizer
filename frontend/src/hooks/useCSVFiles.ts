import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  CSVData, 
  CSVDataWithRows, 
  listCSVFiles, 
  getCSVData, 
  deleteCSV, 
  dropColumns, 
  renameColumn 
} from '../services/api';

interface UseCSVFilesReturn {
  csvFiles: CSVData[];
  selectedFileId: number | null;
  csvData: CSVDataWithRows | null;
  loading: boolean;
  setSelectedFileId: (id: number | null) => void;
  loadCSVFiles: () => Promise<CSVData[]>;
  loadCSVData: (id: number) => Promise<void>;
  handleUploadSuccess: (data: CSVData) => void;
  handleDeleteFile: (id: number) => Promise<void>;
  handleDropColumns: (columns: string[]) => Promise<void>;
  handleRenameColumn: (oldName: string, newName: string) => Promise<void>;
  selectedFileIdRef: React.MutableRefObject<number | null>;
}

export function useCSVFiles(
  setErrorWithTimestamp: (errorMessage: string | null) => void,
  isInitializingRef: React.MutableRefObject<boolean>
): UseCSVFilesReturn {
  const [csvFiles, setCsvFiles] = useState<CSVData[]>([]);
  
  // Initialize selectedFileId from localStorage if available
  const getInitialFileId = (): number | null => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('selectedFileId');
      if (saved) {
        const id = parseInt(saved, 10);
        if (!isNaN(id)) {
          return id;
        }
      }
    }
    return null;
  };
  
  const [selectedFileId, setSelectedFileId] = useState<number | null>(getInitialFileId());
  const [csvData, setCsvData] = useState<CSVDataWithRows | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedFileIdRef = useRef<number | null>(selectedFileId);

  // Sync ref with state
  useEffect(() => {
    selectedFileIdRef.current = selectedFileId;
    
    // Save to localStorage whenever selectedFileId changes (but not during initial load)
    if (!isInitializingRef.current) {
      if (selectedFileId) {
        localStorage.setItem('selectedFileId', selectedFileId.toString());
      } else {
        localStorage.removeItem('selectedFileId');
      }
    }
  }, [selectedFileId, isInitializingRef]);

  const loadCSVFiles = useCallback(async (): Promise<CSVData[]> => {
    try {
      const files = await listCSVFiles();
      setCsvFiles(files);
      return files;
    } catch (err) {
      setErrorWithTimestamp(err instanceof Error ? err.message : 'Failed to load CSV files');
      return [];
    }
  }, [setErrorWithTimestamp]);

  const loadCSVData = useCallback(async (id: number) => {
    // Only set loading state if we don't have data yet (initial load)
    // or if we are switching files
    setLoading(true);
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
  }, [setErrorWithTimestamp]);

  // Initial load
  useEffect(() => {
    const loadFilesAndVerifySelection = async () => {
      const files = await loadCSVFiles();
      
      // Verify the initially restored file still exists
      const currentFileId = selectedFileId;
      if (currentFileId !== null) {
        const fileExists = files.some(f => f.id === currentFileId);
        if (!fileExists) {
          // File no longer exists, clear selection
          setSelectedFileId(null);
          localStorage.removeItem('selectedFileId');
        }
      }
      
      // Mark initialization as complete
      isInitializingRef.current = false;
    };
    
    loadFilesAndVerifySelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Load data when selection changes
  useEffect(() => {
    if (selectedFileId) {
      loadCSVData(selectedFileId);
    } else {
      setCsvData(null);
    }
  }, [selectedFileId, loadCSVData]);

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
  }, [loadCSVFiles]);

  const handleDeleteFile = useCallback(async (id: number) => {
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
  }, [selectedFileId, loadCSVFiles, setErrorWithTimestamp]);

  const handleDropColumns = useCallback(async (columns: string[]) => {
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
  }, [selectedFileId, loadCSVData, loadCSVFiles, setErrorWithTimestamp]);

  const handleRenameColumn = useCallback(async (oldName: string, newName: string) => {
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
  }, [selectedFileId, loadCSVData, loadCSVFiles, setErrorWithTimestamp]);

  return {
    csvFiles,
    selectedFileId,
    csvData,
    loading,
    setSelectedFileId,
    loadCSVFiles,
    loadCSVData,
    handleUploadSuccess,
    handleDeleteFile,
    handleDropColumns,
    handleRenameColumn,
    selectedFileIdRef
  };
}

