import { useState, useEffect, useRef, startTransition, useMemo } from 'react';
import { CSVDataWithRows, getEvaluationsForCSV, Evaluation, Prompt, updateEvaluation, getEvaluationForRow, JudgeConfig, JudgeResult, FunctionEvalConfig, FunctionEvalResult } from '../services/api';
import { LLMConfig } from './PromptEditor';

interface DataTableProps {
  data: CSVDataWithRows | null;
  onDropColumns?: (columns: string[]) => void;
  onRenameColumn?: (oldName: string, newName: string) => void;
  onUpdateRow?: (rowId: number, annotation?: number | null, feedback?: string) => void;
  currentPrompt?: Prompt | null;
  llmConfig?: LLMConfig;
  onRunPrompt?: (rowIds: number[]) => void;
  isRunningAll?: boolean;
  latestEvaluation?: Evaluation | null;
  clearAllOutputs?: boolean;
  judgeConfigs?: JudgeConfig[];
  judgeResults?: JudgeResult[];
  latestJudgeResult?: JudgeResult | null;
  onRunJudgeForRow?: (configId: number, rowId: number) => void;
  onClearJudgeForRow?: (configId: number, rowId: number) => void;
  isRunningJudge?: boolean;
  runningJudgeConfigId?: number | null;
  runningJudgeCells?: Set<string>;
  functionEvalConfigs?: FunctionEvalConfig[];
  functionEvalResults?: FunctionEvalResult[];
  latestFunctionEvalResult?: FunctionEvalResult | null;
  onRunFunctionEvalForRow?: (configId: number, rowId: number) => void;
  onClearFunctionEvalForRow?: (configId: number, rowId: number) => void;
}

const EVAL_COLUMNS = ["Output", "Annotation", "Feedback"];

export default function DataTable({ 
  data, 
  onDropColumns,
  onRenameColumn,
  onUpdateRow,
  currentPrompt,
  llmConfig,
  onRunPrompt,
  isRunningAll = false,
  latestEvaluation,
  clearAllOutputs = false,
  judgeConfigs = [],
  judgeResults = [],
  latestJudgeResult = null,
  onRunJudgeForRow,
  onClearJudgeForRow,
  isRunningJudge = false,
  runningJudgeConfigId = null,
  runningJudgeCells = new Set(),
  functionEvalConfigs = [],
  functionEvalResults = [],
  latestFunctionEvalResult = null,
  onRunFunctionEvalForRow,
  onClearFunctionEvalForRow,
}: DataTableProps) {
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [openMenuColumn, setOpenMenuColumn] = useState<string | null>(null);
  const [localRowData, setLocalRowData] = useState<{ [key: number]: any }>({});
  const [evaluations, setEvaluations] = useState<{ [key: number]: Evaluation }>({});
  const [editingFeedbackRowId, setEditingFeedbackRowId] = useState<number | null>(null);
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  const [newColumnName, setNewColumnName] = useState<string>('');
  const [runningRows, setRunningRows] = useState<Set<number>>(new Set());
  const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({});
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const rowNumberCellRefs = useRef<{ [key: number]: HTMLTableCellElement | null }>({});
  const resizeStartWidthRef = useRef<number>(0);
  const resizeColumnRef = useRef<string | null>(null);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const feedbackInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const processedEvaluationIds = useRef<Set<number>>(new Set());

  // Build map of scores by row and config for O(1) lookup
  const scoresByRowAndConfig = useMemo(() => {
    const map: { [rowId: number]: { [configId: number]: number } } = {};
    judgeResults.forEach(result => {
      if (!map[result.csv_row_id]) {
        map[result.csv_row_id] = {};
      }
      map[result.csv_row_id][result.config_id] = result.score;
    });
    return map;
  }, [judgeResults]);

  // Build map of configs by name for quick lookup
  const configByName = useMemo(() => {
    const map: { [name: string]: JudgeConfig } = {};
    judgeConfigs.forEach(config => {
      map[config.name] = config;
    });
    return map;
  }, [judgeConfigs]);

  // Build map of function eval scores by row and config for O(1) lookup
  const scoresByRowAndFunctionConfig = useMemo(() => {
    const map: { [rowId: number]: { [configId: number]: number } } = {};
    functionEvalResults.forEach(result => {
      if (!map[result.csv_row_id]) {
        map[result.csv_row_id] = {};
      }
      map[result.csv_row_id][result.config_id] = result.score;
    });
    return map;
  }, [functionEvalResults]);

  // Build map of function eval configs by name for quick lookup
  const functionEvalConfigByName = useMemo(() => {
    const map: { [name: string]: FunctionEvalConfig } = {};
    functionEvalConfigs.forEach(config => {
      map[config.name] = config;
    });
    return map;
  }, [functionEvalConfigs]);

  // Calculate and set column widths to fit container
  const calculateColumnWidths = () => {
    if (!data?.columns || !tableRef.current) return;
    
    const container = tableRef.current.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    if (containerWidth === 0) return; // Container not ready yet
    
    // Sort judge columns by creation date (oldest first) so newest appear on the right
    const judgeColumnNames = [...judgeConfigs]
      .sort((a, b) => {
        if (a.created_at && b.created_at) {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateA - dateB; // Oldest first, so newest appears on right
        }
        return 0;
      })
      .map(c => c.name);
    // Sort function eval columns by creation date (oldest first) so newest appear on the right
    const functionEvalColumnNames = [...functionEvalConfigs]
      .sort((a, b) => {
        if (a.created_at && b.created_at) {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          return dateA - dateB; // Oldest first, so newest appears on right
        }
        return 0;
      })
      .map(c => c.name);
    const allColumns = [...data.columns, ...EVAL_COLUMNS, ...judgeColumnNames, ...functionEvalColumnNames];
    const evalColumnCount = EVAL_COLUMNS.length;
    const judgeColumnCount = judgeColumnNames.length;
    const functionEvalColumnCount = functionEvalColumnNames.length;
    const regularColumnCount = data.columns.length;
    
    // Reserve space for evaluation columns (wider)
    const evalColumnWidth = Math.max(175, containerWidth * 0.15);
    const judgeColumnWidth = Math.max(180, containerWidth * 0.12); // Judge columns need space for score + buttons
    const functionEvalColumnWidth = Math.max(180, containerWidth * 0.12); // Function eval columns need space for score + buttons
    const reservedForEval = evalColumnWidth * evalColumnCount;
    const reservedForJudge = judgeColumnWidth * judgeColumnCount;
    const reservedForFunctionEval = functionEvalColumnWidth * functionEvalColumnCount;
    
    // Distribute remaining space among regular columns
    const remainingWidth = Math.max(0, containerWidth - reservedForEval - reservedForJudge - reservedForFunctionEval);
    const regularColumnWidth = regularColumnCount > 0 
      ? Math.max(100, remainingWidth / regularColumnCount)
      : 150;
    
    setColumnWidths(prevWidths => {
      const newWidths: { [key: string]: number } = { ...prevWidths };
      let updated = false;
      
      allColumns.forEach(column => {
        if (!newWidths[column]) {
          updated = true;
          if (EVAL_COLUMNS.includes(column)) {
            newWidths[column] = Math.floor(evalColumnWidth);
          } else if (judgeColumnNames.includes(column)) {
            newWidths[column] = Math.floor(judgeColumnWidth);
          } else if (functionEvalColumnNames.includes(column)) {
            newWidths[column] = Math.floor(functionEvalColumnWidth);
          } else {
            newWidths[column] = Math.floor(regularColumnWidth);
          }
        }
      });
      
      return updated ? newWidths : prevWidths;
    });
  };

  // Initialize column widths when data changes
  useEffect(() => {
      if (data?.columns) {
        // Sort judge columns by creation date (oldest first) so newest appear on the right
        const judgeColumnNames = [...judgeConfigs]
          .sort((a, b) => {
            if (a.created_at && b.created_at) {
              const dateA = new Date(a.created_at).getTime();
              const dateB = new Date(b.created_at).getTime();
              return dateA - dateB; // Oldest first, so newest appears on right
            }
            return 0;
          })
          .map(c => c.name);
        const allColumns = [...data.columns, ...EVAL_COLUMNS, ...judgeColumnNames];
      setColumnWidths(prev => {
        const updated: { [key: string]: number } = { ...prev };
        let hasNewColumns = false;
        
        // Check if we need to initialize widths
        const needsInitialization = allColumns.some(col => !updated[col]);
        
        if (needsInitialization) {
          hasNewColumns = true;
          // Use double requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              calculateColumnWidths();
            });
          });
          
              // Set temporary defaults while we calculate
              allColumns.forEach(column => {
                if (!updated[column]) {
                  if (EVAL_COLUMNS.includes(column)) {
                    updated[column] = 200;
                  } else if (judgeColumnNames.includes(column)) {
                    updated[column] = 180;
                  } else if (functionEvalColumnNames.includes(column)) {
                    updated[column] = 180;
                  } else {
                    updated[column] = 150;
                  }
                }
              });
        }
        
        // Only update if there are new columns to avoid resetting user resizes
        return hasNewColumns ? updated : prev;
      });
    }
  }, [data?.columns, judgeConfigs]);

  // Handle window resize to recalculate widths
  useEffect(() => {
    const handleResize = () => {
      if (data?.columns) {
        // Only recalculate if we have uninitialized columns
        const allColumns = [...data.columns, ...EVAL_COLUMNS];
        const hasUninitialized = allColumns.some(col => !columnWidths[col]);
        if (hasUninitialized) {
          calculateColumnWidths();
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data?.columns, columnWidths]);

  // Fetch evaluations when data changes
  useEffect(() => {
    if (data?.id) {
      processedEvaluationIds.current.clear(); // Reset processed IDs when data changes
      getEvaluationsForCSV(data.id)
        .then((evals) => {
          const evalMap: { [key: number]: Evaluation } = {};
          evals.forEach((evaluation) => {
            evalMap[evaluation.csv_row_id] = evaluation;
          });
          setEvaluations(evalMap);

          // Initialize local row data from evaluations, preserving existing local data if it exists
          setLocalRowData((prevLocalData) => {
            const initialData: { [key: number]: any } = {};
            data.rows.forEach((row) => {
              const evaluation = evalMap[row.id];
              const existingLocal = prevLocalData[row.id] || {};
              initialData[row.id] = {
                annotation: existingLocal.annotation ?? evaluation?.annotation ?? null,
                feedback: existingLocal.feedback ?? evaluation?.feedback ?? '',
                output: existingLocal.output ?? evaluation?.output ?? '',
              };
            });
            return initialData;
          });
        })
        .catch((err) => {
          console.error('Failed to load evaluations:', err);
          // Initialize with empty evaluations
          setLocalRowData((prevLocalData) => {
            const initialData: { [key: number]: any } = {};
            if (data?.rows) {
              data.rows.forEach((row) => {
                const existingLocal = prevLocalData[row.id] || {};
                initialData[row.id] = {
                  annotation: existingLocal.annotation ?? null,
                  feedback: existingLocal.feedback ?? '',
                  output: existingLocal.output ?? '',
                };
              });
            }
            return initialData;
          });
        });
    }
  }, [data?.id]);

  // Handle clear all outputs flag - clear all outputs immediately in UI
  useEffect(() => {
    if (!clearAllOutputs || !data) {
      return;
    }

    // Clear outputs for all rows immediately
    startTransition(() => {
      setEvaluations(prev => {
        const next = { ...prev };
        data.rows.forEach(row => {
          const rowId = row.id;
          if (next[rowId]) {
            next[rowId] = {
              ...next[rowId],
              output: "",
              annotation: null,
              feedback: "",
            };
          } else {
            // Create a minimal evaluation object if it doesn't exist
            next[rowId] = {
              id: 0,
              csv_file_id: data.id,
              csv_row_id: rowId,
              output: "",
              annotation: null,
              feedback: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          }
        });
        return next;
      });
      
      setLocalRowData(prev => {
        const next = { ...prev };
        data.rows.forEach(row => {
          const rowId = row.id;
          next[rowId] = {
            ...prev[rowId],
            output: "",
            annotation: null,
            feedback: "",
          };
        });
        return next;
      });
    });
  }, [clearAllOutputs, data]);

  // Handle single evaluation updates (for incremental updates during "Run All")
  useEffect(() => {
    if (!latestEvaluation) {
      return;
    }

    const rowId = latestEvaluation.csv_row_id;
    const output = latestEvaluation.output ?? "";
    
    // Use startTransition to batch all state updates together and prevent flickering
    // This marks the updates as non-urgent, allowing React to batch them smoothly
    startTransition(() => {
      setEvaluations(prev => {
        const next = { ...prev };
        next[rowId] = { ...latestEvaluation };
        return next;
      });
      
      setLocalRowData(prev => {
        const next = { ...prev };
        next[rowId] = {
          ...prev[rowId],
          annotation: latestEvaluation.annotation ?? null,
          feedback: latestEvaluation.feedback ?? "",
          output: output ?? "",
        };
        return next;
      });
      
      setRunningRows(prev => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    });
  }, [latestEvaluation]);

  // Handle single judge result updates (for incremental updates during "Run All")
  // This effect ensures the component re-renders when each result comes in,
  // causing scoresByRowAndConfig to recalculate with the updated judgeResults prop
  useEffect(() => {
    if (!latestJudgeResult) {
      return;
    }
    
    // The scoresByRowAndConfig useMemo will automatically update when judgeResults prop changes
    // This effect ensures the UI updates incrementally as each result comes in
    // by triggering a re-render when latestJudgeResult changes
  }, [latestJudgeResult]);

  // Handle single function eval result updates (for incremental updates during "Run All")
  // This effect ensures the component re-renders when each result comes in,
  // causing scoresByRowAndFunctionConfig to recalculate with the updated functionEvalResults prop
  useEffect(() => {
    if (!latestFunctionEvalResult) {
      return;
    }
    
    // The scoresByRowAndFunctionConfig useMemo will automatically update when functionEvalResults prop changes
    // This effect ensures the UI updates incrementally as each result comes in
    // by triggering a re-render when latestFunctionEvalResult changes
  }, [latestFunctionEvalResult]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuColumn) {
        const menuElement = menuRefs.current[openMenuColumn];
        if (menuElement && !menuElement.contains(event.target as Node)) {
          setOpenMenuColumn(null);
        }
      }
    };

    if (openMenuColumn) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuColumn]);

  // Reset menu and editing state when data changes
  useEffect(() => {
    setOpenMenuColumn(null);
    setEditingFeedbackRowId(null);
    setRenamingColumn(null);
  }, [data?.id]);

  // Sync expanded state with # column cells
  useEffect(() => {
    if (data?.rows) {
      data.rows.forEach((row, idx) => {
        const numberCell = rowNumberCellRefs.current[row.id];
        if (numberCell) {
          if (expandedRowId === row.id) {
            numberCell.style.backgroundColor = 'var(--bg-hover)';
          } else {
            numberCell.style.backgroundColor = idx % 2 === 0 ? 'var(--bg-elevated)' : 'var(--bg-secondary)';
          }
        }
      });
    }
  }, [expandedRowId, data?.rows]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingColumn && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingColumn]);

  if (!data) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center', 
        color: 'var(--text-tertiary)',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        NO DATA SELECTED. SELECT A FILE TAB ABOVE TO VIEW DATA.
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center', 
        color: 'var(--text-tertiary)',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        NO ROWS FOUND IN THIS CSV FILE.
      </div>
    );
  }

      // Combine CSV columns with evaluation columns, judge columns, and function eval columns
      // Sort judge columns by creation date (oldest first) so newest appear on the right
      const judgeColumnNames = [...judgeConfigs]
        .sort((a, b) => {
          if (a.created_at && b.created_at) {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateA - dateB; // Oldest first, so newest appears on right
          }
          return 0;
        })
        .map(c => c.name);
      // Sort function eval columns by creation date (oldest first) so newest appear on the right
      const functionEvalColumnNames = [...functionEvalConfigs]
        .sort((a, b) => {
          if (a.created_at && b.created_at) {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateA - dateB; // Oldest first, so newest appears on right
          }
          return 0;
        })
        .map(c => c.name);
      const allColumns = [...data.columns, ...EVAL_COLUMNS, ...judgeColumnNames, ...functionEvalColumnNames];

  const handleRowClick = (rowId: number, e: React.MouseEvent) => {
    // Don't expand row if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('.column-menu, .annotation-buttons, .feedback-input') || 
        target.closest('[data-feedback-cell]') ||
        target.closest('button')) {
      return;
    }
    setExpandedRowId(expandedRowId === rowId ? null : rowId);
  };

  const handleMenuToggle = (column: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuColumn(openMenuColumn === column ? null : column);
  };

  const handleDropColumn = (column: string) => {
    if (EVAL_COLUMNS.includes(column)) {
      alert(`Cannot drop evaluation column: ${column}`);
      setOpenMenuColumn(null);
      return;
    }
    
    if (data.columns.length <= 1) {
      alert('Cannot drop the last column. At least one column must remain.');
      setOpenMenuColumn(null);
      return;
    }
    
    if (window.confirm(`Are you sure you want to drop the column "${column}"?`)) {
      if (onDropColumns) {
        onDropColumns([column]);
      }
    }
    setOpenMenuColumn(null);
  };

  const handleRenameColumn = (column: string) => {
    if (EVAL_COLUMNS.includes(column)) {
      alert(`Cannot rename evaluation column: ${column}`);
      setOpenMenuColumn(null);
      return;
    }
    setRenamingColumn(column);
    setNewColumnName(column);
    setOpenMenuColumn(null);
  };

  const handleRenameSubmit = () => {
    if (!renamingColumn || !onRenameColumn) return;
    
    const trimmedName = newColumnName.trim();
    if (!trimmedName) {
      alert('Column name cannot be empty');
      return;
    }
    
    if (trimmedName === renamingColumn) {
      // No change, just cancel
      setRenamingColumn(null);
      setNewColumnName('');
      return;
    }
    
    // Check if new name already exists
    if (data?.columns.includes(trimmedName)) {
      alert(`Column "${trimmedName}" already exists`);
      return;
    }
    
    onRenameColumn(renamingColumn, trimmedName);
    setRenamingColumn(null);
    setNewColumnName('');
  };

  const handleRenameCancel = () => {
    setRenamingColumn(null);
    setNewColumnName('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleRenameCancel();
    }
  };

  const handleAnnotationClick = async (rowId: number, value: number | null, e: React.MouseEvent) => {
    e.stopPropagation();
    // Check if there's output before allowing annotation
    const evalOutput = evaluations[rowId]?.output;
    const localOutput = localRowData[rowId]?.output;
    const output = evalOutput !== undefined ? evalOutput : (localOutput !== undefined ? localOutput : "");
    if (!output) {
      return;
    }
    
    // Calculate new value using functional update to read absolute latest state
    // This ensures we're reading the most current state, not a stale closure value
    let newValue: number | null = null;
    setLocalRowData(prev => {
      // Get the current annotation value from the latest state
      // Explicitly handle 0 as a valid value (not falsy) - check if property exists
      let currentAnnotation: number | null | undefined;
      if (prev[rowId] !== undefined && 'annotation' in prev[rowId]) {
        // localRowData has the annotation property - use it (could be 0, 1, or null)
        currentAnnotation = prev[rowId].annotation;
      } else {
        // Fall back to evaluations
        currentAnnotation = evaluations[rowId]?.annotation ?? null;
      }
      
      // Normalize: preserve null, handle undefined, ensure 0 and 1 are treated as numbers
      const currentAnnotationNum = (currentAnnotation === null || currentAnnotation === undefined) 
        ? null 
        : (typeof currentAnnotation === 'number' ? currentAnnotation : Number(currentAnnotation));
      
      // Toggle: if clicking the same button that's already active, remove annotation (set to null)
      // Use strict equality to ensure 0 === 0 works correctly
      newValue = (currentAnnotationNum !== null && currentAnnotationNum === value) ? null : value;
      
      // Optimistic update - ensure we create a new object reference
      const currentRowData = prev[rowId] || {};
      return {
        ...prev,
        [rowId]: {
          ...currentRowData,
          // Explicitly set to null (not undefined) when toggling off, or the number value (0 or 1)
          annotation: newValue,
        }
      };
    });
    
    // Update DB and sync back
    if (onUpdateRow) {
      try {
        await onUpdateRow(rowId, newValue);
        // Sync back from DB to ensure consistency
        const updatedEval = await getEvaluationForRow(rowId);
        if (updatedEval) {
          setEvaluations(prev => ({
            ...prev,
            [rowId]: updatedEval,
          }));
          // Preserve the optimistic update - keep newValue we just set
          // The DB response should match, but we keep our optimistic update to ensure UI stays responsive
          // Explicitly preserve null values (not undefined) when toggling off
          setLocalRowData(prev => {
            const currentRowData = prev[rowId] || {};
            return {
              ...prev,
              [rowId]: {
                ...currentRowData,
                // Keep the newValue we optimistically set - explicitly preserve null when toggling off
                // newValue is either null (toggle off) or a number (toggle on), so use it directly
                annotation: newValue,
                feedback: updatedEval.feedback ?? currentRowData.feedback ?? "",
                output: updatedEval.output ?? currentRowData.output ?? "",
              },
            };
          });
        }
      } catch (err) {
        console.error('Error updating annotation:', err);
        // Revert optimistic update on error
        const originalEval = evaluations[rowId];
        setLocalRowData(prev => {
          const currentRowData = prev[rowId] || {};
          return {
            ...prev,
            [rowId]: {
              ...currentRowData,
              annotation: originalEval?.annotation ?? null,
            },
          };
        });
      }
    }
  };

  const handleFeedbackClick = (rowId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // Check if there's output before allowing feedback editing
    const evalOutput = evaluations[rowId]?.output;
    const localOutput = localRowData[rowId]?.output;
    const output = evalOutput !== undefined ? evalOutput : (localOutput !== undefined ? localOutput : "");
    if (!output) {
      return;
    }
    setEditingFeedbackRowId(rowId);
  };

  const handleFeedbackChange = (rowId: number, value: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setLocalRowData(prev => {
      // Ensure the existing row data is preserved, especially the annotation
      const existingRowData = prev[rowId] || {};
      return {
        ...prev,
        [rowId]: {
          ...existingRowData,
          feedback: value,
        },
      };
    });
  };

  const handleFeedbackBlur = async (rowId: number) => {
    if (onUpdateRow) {
      try {
        // Also pass the current annotation state when updating feedback
        await onUpdateRow(rowId, localRowData[rowId]?.annotation, localRowData[rowId]?.feedback);
        // Sync back from DB to ensure consistency
        const updatedEval = await getEvaluationForRow(rowId);
        if (updatedEval) {
          setEvaluations(prev => ({
            ...prev,
            [rowId]: updatedEval,
          }));
          setLocalRowData(prev => ({
            ...prev,
            [rowId]: {
              ...prev[rowId],
              annotation: updatedEval.annotation ?? null,
              feedback: updatedEval.feedback ?? "",
              output: updatedEval.output ?? "",
            },
          }));
        }
      } catch (err) {
        console.error('Error updating feedback:', err);
        // Revert to original on error
        const originalEval = evaluations[rowId];
        if (originalEval) {
          setLocalRowData(prev => ({
            ...prev,
            [rowId]: {
              ...prev[rowId],
              feedback: originalEval.feedback ?? "",
            },
          }));
        }
      }
    }
    setEditingFeedbackRowId(null);
  };

  const handleFeedbackKeyDown = async (rowId: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (onUpdateRow) {
        try {
          // Also pass the current annotation state when updating feedback
          await onUpdateRow(rowId, localRowData[rowId]?.annotation, localRowData[rowId]?.feedback);
          // Sync back from DB to ensure consistency
          const updatedEval = await getEvaluationForRow(rowId);
          if (updatedEval) {
            setEvaluations(prev => ({
              ...prev,
              [rowId]: updatedEval,
            }));
            setLocalRowData(prev => ({
              ...prev,
              [rowId]: {
                ...prev[rowId],
                annotation: updatedEval.annotation ?? null,
                feedback: updatedEval.feedback ?? "",
                output: updatedEval.output ?? "",
              },
            }));
          }
        } catch (err) {
          console.error('Error updating feedback:', err);
        }
      }
      setEditingFeedbackRowId(null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // Reset to original value from evaluation
      const originalFeedback = evaluations[rowId]?.feedback || "";
      setLocalRowData(prev => ({
        ...prev,
        [rowId]: { ...prev[rowId], feedback: originalFeedback }
      }));
      setEditingFeedbackRowId(null);
    }
  };

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingFeedbackRowId && feedbackInputRef.current) {
      feedbackInputRef.current.focus();
    }
  }, [editingFeedbackRowId]);

  const handleResizeStart = (column: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeColumnRef.current = column;
    resizeStartXRef.current = e.clientX;
    const isJudgeColumn = judgeConfigs.some(c => c.name === column);
    const isFunctionEvalColumn = functionEvalConfigs.some(c => c.name === column);
    resizeStartWidthRef.current = columnWidths[column] || (EVAL_COLUMNS.includes(column) ? 200 : isJudgeColumn || isFunctionEvalColumn ? 180 : 120);
    setResizingColumn(column);
  };

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!resizeColumnRef.current) return;
      
      const deltaX = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(175, resizeStartWidthRef.current + deltaX); // Minimum width 200px
      
      setColumnWidths(prev => ({
                ...prev,
        [resizeColumnRef.current!]: newWidth,
              }));
    };

    const handleResizeEnd = () => {
      resizeColumnRef.current = null;
      setResizingColumn(null);
    };

    if (resizingColumn) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingColumn]);

  const handleRunRow = async (rowId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRunPrompt) return;
              
    // Mark this row as running
    startTransition(() => {
      setRunningRows(prev => new Set(prev).add(rowId));
    });
    
    try {
      // Clear output, annotation, and feedback before running
      await updateEvaluation(rowId, "", null, null);
      
      // Update local state optimistically using startTransition to prevent flickering
      startTransition(() => {
        setLocalRowData(prev => ({
          ...prev,
          [rowId]: {
            ...prev[rowId],
            output: "",
            annotation: null,
            feedback: "",
          },
        }));
        setEvaluations(prev => {
          const next = { ...prev };
          if (next[rowId]) {
            next[rowId] = {
              ...next[rowId],
              output: "",
              annotation: null,
              feedback: "",
            };
          }
          return next;
        });
      });
      
      await onRunPrompt([rowId]);
      // Note: Evaluation update is handled via latestEvaluation prop from App.tsx
      // No need to fetch here - it would cause redundant DB calls and potential race conditions
    } catch (err) {
      console.error('Error running prompt:', err);
    } finally {
      // Remove this row from running set (will also be removed when latestEvaluation updates)
      startTransition(() => {
        setRunningRows(prev => {
          const next = new Set(prev);
          next.delete(rowId);
          return next;
        });
      });
    }
  };

  const handleClearOutput = async (rowId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Clear the output, annotation, and feedback in the database
      const updatedEval = await updateEvaluation(rowId, "", null, null);
      
      // Ensure annotation and feedback are explicitly null
      const clearedEval = {
        ...updatedEval,
        annotation: null,
        feedback: null,
        output: "",
      };
      
      // Clear all judge evaluation scores for this row
      if (onClearJudgeForRow && judgeConfigs.length > 0) {
        await Promise.allSettled(
          judgeConfigs.map(config => 
            Promise.resolve(onClearJudgeForRow(config.id, rowId)).catch((err: any) => {
              console.error(`Error clearing judge result for config ${config.id}:`, err);
            })
          )
        );
      }
      
      // Clear all function evaluation scores for this row
      if (onClearFunctionEvalForRow && functionEvalConfigs.length > 0) {
        await Promise.allSettled(
          functionEvalConfigs.map(config => 
            Promise.resolve(onClearFunctionEvalForRow(config.id, rowId)).catch((err: any) => {
              console.error(`Error clearing function eval result for config ${config.id}:`, err);
            })
          )
        );
      }
      
      // Update state from DB response using startTransition to prevent flickering
      startTransition(() => {
        setEvaluations(prev => ({
          ...prev,
          [rowId]: clearedEval,
        }));
        setLocalRowData(prev => ({
          ...prev,
          [rowId]: {
            ...prev[rowId],
            output: "",
            annotation: null,
            feedback: "",
          },
        }));
      });
    } catch (err) {
      console.error('Error clearing output:', err);
    }
  };

  const renderCellContent = (column: string, row: any, rowId: number) => {
    if (column === "Output") {
      // Get output from evaluations map first, then localRowData
      const evaluation = evaluations[rowId];
      const evalOutput = evaluation?.output;
      const localOutput = localRowData[rowId]?.output;
      
      // Use evaluation output if it exists (even if empty string), otherwise use local
      const output = evalOutput !== undefined && evalOutput !== null ? evalOutput : (localOutput !== undefined ? localOutput : "");
      const isRowRunning = runningRows.has(rowId);
      const hasOutput = output !== null && output !== undefined && output !== "";
      
      // Show "..." placeholder when running (either individually or as part of "Run All") and no output yet
      const showPlaceholder = (isRowRunning || isRunningAll) && !hasOutput;
      const displayOutput = showPlaceholder ? "..." : (hasOutput ? output : "—");
      
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', minWidth: 0 }}>
          <span style={{ 
            color: showPlaceholder ? 'var(--text-tertiary)' : (displayOutput && displayOutput !== "—" ? 'var(--text-primary)' : 'var(--text-tertiary)'), 
            fontStyle: showPlaceholder ? 'normal' : (displayOutput && displayOutput !== "—" ? 'normal' : 'italic'),
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: expandedRowId === rowId ? 'pre-wrap' : 'nowrap',
            minWidth: 0,
            marginRight: 'auto',
          }}>
            {displayOutput}
          </span>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
            {hasOutput && (
              <button
                onClick={(e) => handleClearOutput(rowId, e)}
                disabled={isRowRunning || isRunningAll}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: (isRowRunning || isRunningAll) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: (isRowRunning || isRunningAll) ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  cursor: (isRowRunning || isRunningAll) ? 'not-allowed' : 'pointer',
                  fontSize: '0.6875rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'none',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => {
                  if (!isRowRunning && !isRunningAll) {
                    e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRowRunning && !isRunningAll) {
                    e.currentTarget.style.outline = 'none';
                  }
                }}
                title="Clear output for this row"
              >
                CLEAR
              </button>
            )}
          {currentPrompt && llmConfig && currentPrompt.content && (
            <button
              onClick={(e) => handleRunRow(rowId, e)}
                disabled={isRowRunning || isRunningAll}
              style={{
                padding: '0.25rem 0.5rem',
                  backgroundColor: (isRowRunning || isRunningAll) ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '0',
                  cursor: (isRowRunning || isRunningAll) ? 'not-allowed' : 'pointer',
                fontSize: '0.6875rem',
                fontWeight: '700',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                  flexShrink: 0,
                transition: 'none',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => {
                if (!isRowRunning && !isRunningAll) {
                  e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRowRunning && !isRunningAll) {
                  e.currentTarget.style.outline = 'none';
                }
              }}
              title="Run prompt for this row"
            >
                {(isRowRunning || isRunningAll) ? 'RUNNING...' : 'RUN'}
            </button>
          )}
          </div>
        </div>
      );
    }
    
    if (column === "Annotation") {
      // Check localRowData first since it has the most recent optimistic updates
      // Explicitly handle 0 as a valid value (not falsy) - check if property exists
      let annotationRaw: number | null | undefined;
      if (localRowData[rowId] !== undefined && 'annotation' in localRowData[rowId]) {
        // localRowData[rowId] exists and has annotation property - use it directly
        // This ensures optimistic updates are immediately reflected
        // annotation can be 0, 1, or null - all are valid
        annotationRaw = localRowData[rowId].annotation;
      } else {
        // localRowData[rowId] doesn't exist or doesn't have annotation - use evaluations
        annotationRaw = evaluations[rowId]?.annotation;
      }
      // Normalize: preserve null explicitly, convert undefined to null, ensure 0 and 1 are treated as numbers
      const annotation = (annotationRaw === null || annotationRaw === undefined) 
        ? null 
        : (typeof annotationRaw === 'number' ? annotationRaw : Number(annotationRaw));
      const evalOutput = evaluations[rowId]?.output;
      const localOutput = localRowData[rowId]?.output;
      const output = evalOutput !== undefined ? evalOutput : (localOutput !== undefined ? localOutput : "");
      const isDisabled = !output;
      // Create style objects to ensure React detects changes
      const thumbsUpStyle: React.CSSProperties = {
        padding: '0.25rem 0.5rem',
        backgroundColor: annotation === 1 ? 'var(--accent-success)' : (isDisabled ? 'var(--bg-tertiary)' : 'var(--bg-secondary)'),
        color: annotation === 1 ? '#000000' : (isDisabled ? 'var(--text-tertiary)' : 'var(--text-primary)'),
        border: `1px solid ${annotation === 1 ? 'var(--accent-success)' : 'var(--border-primary)'}`,
        borderRadius: '0',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontSize: '0.875rem',
        fontWeight: '700',
        opacity: isDisabled ? 0.4 : 1,
        transition: 'none',
      };
      
      const thumbsDownStyle: React.CSSProperties = {
        padding: '0.25rem 0.5rem',
        backgroundColor: annotation === 0 ? 'var(--accent-danger)' : (isDisabled ? 'var(--bg-tertiary)' : 'var(--bg-secondary)'),
        color: annotation === 0 ? 'white' : (isDisabled ? 'var(--text-tertiary)' : 'var(--text-primary)'),
        border: `1px solid ${annotation === 0 ? 'var(--accent-danger)' : 'var(--border-primary)'}`,
        borderRadius: '0',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontSize: '0.875rem',
        fontWeight: '700',
        opacity: isDisabled ? 0.4 : 1,
        transition: 'none',
      };
      
      // Use explicit key that changes when annotation changes (including null)
      // This ensures React properly re-renders when annotation toggles between null and a value
      const annotationKey = annotation === null ? 'none' : String(annotation);
      
      return (
        <div className="annotation-buttons" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            key={`thumb-up-${rowId}-${annotationKey}`}
            onClick={(e) => handleAnnotationClick(rowId, 1, e)}
            disabled={isDisabled}
            style={thumbsUpStyle}
            onMouseEnter={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.outline = annotation === 1 
                  ? '2px solid rgba(255, 255, 255, 0.8)' 
                  : '2px solid var(--accent-primary)';
                e.currentTarget.style.outlineOffset = '-2px';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.outline = 'none';
              }
            }}
          >
            +
          </button>
          <button
            key={`thumb-down-${rowId}-${annotationKey}`}
            onClick={(e) => handleAnnotationClick(rowId, 0, e)}
            disabled={isDisabled}
            style={thumbsDownStyle}
            onMouseEnter={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.outline = annotation === 0 
                  ? '2px solid rgba(255, 255, 255, 0.8)' 
                  : '2px solid var(--accent-primary)';
                e.currentTarget.style.outlineOffset = '-2px';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDisabled) {
                e.currentTarget.style.outline = 'none';
              }
            }}
          >
            -
          </button>
        </div>
      );
    }
    
    if (column === "Feedback") {
      const isEditing = editingFeedbackRowId === rowId;
      // When editing, prioritize localRowData to show user's current typing
      // When not editing, prioritize evaluations for display
      const feedbackValue = isEditing 
        ? (localRowData[rowId]?.feedback ?? evaluations[rowId]?.feedback ?? "")
        : (evaluations[rowId]?.feedback ?? localRowData[rowId]?.feedback ?? "");
      const evalOutput = evaluations[rowId]?.output;
      const localOutput = localRowData[rowId]?.output;
      const output = evalOutput !== undefined ? evalOutput : (localOutput !== undefined ? localOutput : "");
      const isDisabled = !output;
      
      if (isEditing) {
        return (
          <input
            ref={feedbackInputRef}
            className="feedback-input"
            type="text"
            value={feedbackValue}
            onChange={(e) => handleFeedbackChange(rowId, e.target.value, e)}
            onBlur={() => handleFeedbackBlur(rowId)}
            onKeyDown={(e) => handleFeedbackKeyDown(rowId, e)}
            onClick={(e) => e.stopPropagation()}
            placeholder="ENTER FEEDBACK..."
            style={{
              width: '100%',
              padding: '0.25rem 0.5rem',
              border: '1px solid var(--accent-primary)',
              borderRadius: '0',
              fontSize: '0.8125rem',
              outline: 'none',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              fontWeight: '600',
            }}
          />
        );
      }
      
      return (
        <div
          data-feedback-cell
          onClick={(e) => handleFeedbackClick(rowId, e)}
          style={{
            width: '100%',
            padding: '0.25rem 0.5rem',
            cursor: isDisabled ? 'not-allowed' : 'text',
            minHeight: '1.5rem',
            color: isDisabled ? 'var(--text-tertiary)' : (feedbackValue ? 'var(--text-primary)' : 'var(--text-tertiary)'),
            fontStyle: feedbackValue ? 'normal' : 'italic',
            opacity: isDisabled ? 0.4 : 1,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            maxWidth: '100%',
            borderRadius: '0',
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
            transition: 'none',
          }}
          onMouseEnter={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.outline = '1px solid var(--accent-primary)';
              e.currentTarget.style.outlineOffset = '-1px';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.outline = 'none';
            }
          }}
        >
          {feedbackValue || (isDisabled ? "—" : "CLICK TO ADD FEEDBACK...")}
        </div>
      );
    }
    
    // Check if this is a judge column
    const judgeConfig = configByName[column];
    if (judgeConfig) {
      const score = scoresByRowAndConfig[rowId]?.[judgeConfig.id];
      const cellKey = `${judgeConfig.id}-${rowId}`;
      const isCellRunning = runningJudgeCells.has(cellKey);
      const isConfigRunning = isRunningJudge && runningJudgeConfigId === judgeConfig.id;
      const hasScore = score !== undefined && score !== null;
      
      // Check if there's output for this row (needed to run judge evaluation)
      const evalOutput = evaluations[rowId]?.output;
      const localOutput = localRowData[rowId]?.output;
      const output = evalOutput !== undefined ? evalOutput : (localOutput !== undefined ? localOutput : "");
      const hasOutput = output !== null && output !== undefined && output !== "";
      const isRunDisabled = isCellRunning || isConfigRunning || !hasOutput;
      
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', minWidth: 0 }}>
          <span style={{ 
            color: hasScore ? 'var(--text-primary)' : 'var(--text-tertiary)',
            fontStyle: hasScore ? 'normal' : 'italic',
            flex: 1,
            textAlign: 'right',
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
            fontWeight: '600',
            marginRight: 'auto',
          }}>
            {isCellRunning || isConfigRunning ? "..." : (hasScore ? score.toFixed(2) : "—")}
          </span>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
            {hasScore && onClearJudgeForRow && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClearJudgeForRow) {
                    onClearJudgeForRow(judgeConfig.id, rowId);
                  }
                }}
                disabled={isCellRunning || isConfigRunning}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: (isCellRunning || isConfigRunning) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                  color: (isCellRunning || isConfigRunning) ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  cursor: (isCellRunning || isConfigRunning) ? 'not-allowed' : 'pointer',
                  fontSize: '0.6875rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'none',
                  textTransform: 'uppercase',
                  opacity: (isCellRunning || isConfigRunning) ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isCellRunning && !isConfigRunning) {
                    e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCellRunning && !isConfigRunning) {
                    e.currentTarget.style.outline = 'none';
                  }
                }}
                title="Clear score for this row"
              >
                CLEAR
              </button>
            )}
            {onRunJudgeForRow && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRunJudgeForRow && hasOutput) {
                    onRunJudgeForRow(judgeConfig.id, rowId);
                  }
                }}
                disabled={isRunDisabled}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: isRunDisabled ? 'var(--bg-tertiary)' : 'var(--accent-success)',
                  color: isRunDisabled ? 'var(--text-tertiary)' : '#000000',
                  border: 'none',
                  borderRadius: '0',
                  cursor: isRunDisabled ? 'not-allowed' : 'pointer',
                  fontSize: '0.6875rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'none',
                  textTransform: 'uppercase',
                  opacity: isRunDisabled ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isRunDisabled) {
                    e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRunDisabled) {
                    e.currentTarget.style.outline = 'none';
                  }
                }}
                title={hasOutput ? "Run judge evaluation for this row" : "No output available - run prompt first"}
              >
                {(isCellRunning || isConfigRunning) ? 'RUNNING...' : 'RUN'}
              </button>
            )}
          </div>
        </div>
      );
    }
    
    // Check if this is a function eval column
    const functionEvalConfig = functionEvalConfigByName[column];
    if (functionEvalConfig) {
      const score = scoresByRowAndFunctionConfig[rowId]?.[functionEvalConfig.id];
      const hasScore = score !== undefined && score !== null;
      
      // Check if there's output for this row (needed to run function evaluation)
      const evalOutput = evaluations[rowId]?.output;
      const localOutput = localRowData[rowId]?.output;
      const output = evalOutput !== undefined ? evalOutput : (localOutput !== undefined ? localOutput : "");
      const hasOutput = output !== null && output !== undefined && output !== "";
      const isRunDisabled = !hasOutput;
      
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', minWidth: 0 }}>
          <span style={{ 
            color: hasScore ? 'var(--text-primary)' : 'var(--text-tertiary)',
            fontStyle: hasScore ? 'normal' : 'italic',
            flex: 1,
            textAlign: 'right',
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
            fontWeight: '600',
            marginRight: 'auto',
          }}>
            {hasScore ? score.toFixed(2) : "—"}
          </span>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
            {hasScore && onClearFunctionEvalForRow && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClearFunctionEvalForRow) {
                    onClearFunctionEvalForRow(functionEvalConfig.id, rowId);
                  }
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontSize: '0.6875rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'none',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                  e.currentTarget.style.outlineOffset = '-2px';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.outline = 'none';
                }}
                title="Clear score for this row"
              >
                CLEAR
              </button>
            )}
            {onRunFunctionEvalForRow && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRunFunctionEvalForRow && hasOutput) {
                    onRunFunctionEvalForRow(functionEvalConfig.id, rowId);
                  }
                }}
                disabled={isRunDisabled}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: isRunDisabled ? 'var(--bg-tertiary)' : 'var(--accent-success)',
                  color: isRunDisabled ? 'var(--text-tertiary)' : '#000000',
                  border: 'none',
                  borderRadius: '0',
                  cursor: isRunDisabled ? 'not-allowed' : 'pointer',
                  fontSize: '0.6875rem',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'none',
                  textTransform: 'uppercase',
                  opacity: isRunDisabled ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isRunDisabled) {
                    e.currentTarget.style.outline = '2px solid rgba(255, 255, 255, 0.8)';
                    e.currentTarget.style.outlineOffset = '-2px';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRunDisabled) {
                    e.currentTarget.style.outline = 'none';
                  }
                }}
                title={isRunDisabled ? "No output to evaluate" : "Run evaluation for this row"}
              >
                RUN
              </button>
            )}
          </div>
        </div>
      );
    }
    
    return String(row.row_data[column] || '');
  };

  return (
    <div style={{ 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ 
        marginBottom: '0.5rem',
        fontSize: '0.75rem',
        color: 'var(--text-tertiary)',
        fontWeight: '700',
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {data.rows.length} ROWS • {data.columns.length} COLUMNS
      </div>
      <div style={{ 
        flex: 1,
        overflow: 'auto',
        border: '1px solid var(--border-primary)',
        borderRadius: '0',
        backgroundColor: 'var(--bg-elevated)',
      }}>
        <table
          ref={tableRef}
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
            tableLayout: 'fixed',
          }}
        >
          <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
            <tr style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-primary)' }}>
              <th
                style={{
                  padding: '0.5rem 0.75rem',
                  textAlign: 'center',
                  fontWeight: '700',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  width: '60px',
                  minWidth: '60px',
                  maxWidth: '60px',
                  verticalAlign: 'middle',
                  borderBottom: '2px solid var(--border-primary)',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                #
              </th>
              {allColumns.map((column) => {
                const isEvalColumn = EVAL_COLUMNS.includes(column);
                const isJudgeColumn = judgeColumnNames.includes(column);
                const isFunctionEvalColumn = functionEvalColumnNames.includes(column);
                const isSpecialColumn = isEvalColumn || isJudgeColumn || isFunctionEvalColumn;
                const columnWidth = columnWidths[column] || (isEvalColumn ? 200 : isJudgeColumn || isFunctionEvalColumn ? 180 : 120);
                return (
                  <th
                    key={column}
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'center',
                      fontWeight: '700',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      position: 'relative',
                      whiteSpace: 'nowrap',
                      width: `${columnWidth}px`,
                      minWidth: `${Math.max(175, columnWidth)}px`,
                      maxWidth: `${columnWidth}px`,
                      zIndex: 1,
                      verticalAlign: 'middle',
                      borderBottom: '2px solid var(--border-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      position: 'relative',
                      width: '100%',
                      paddingRight: !isSpecialColumn ? '1.5rem' : '0',
                    }}>
                      {renamingColumn === column ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={newColumnName}
                          onChange={(e) => setNewColumnName(e.target.value)}
                          onKeyDown={handleRenameKeyDown}
                          onBlur={handleRenameSubmit}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '0.25rem 0.5rem',
                            border: '1px solid var(--accent-primary)',
                            borderRadius: '0',
                            fontSize: '0.8125rem',
                            outline: 'none',
                            textAlign: 'center',
                            minWidth: '100px',
                            maxWidth: '200px',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            fontFamily: 'monospace',
                            fontWeight: '600',
                          }}
                        />
                      ) : (
                        <>
                          <span style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            textAlign: 'center',
                            paddingRight: !isSpecialColumn ? '0.5rem' : '0',
                          }}>
                            {column}
                          </span>
                          {!isSpecialColumn && (
                            <div 
                              className="column-menu"
                              ref={(el) => { menuRefs.current[column] = el; }}
                              style={{ 
                                position: 'absolute', 
                                right: '0.25rem',
                                flexShrink: 0,
                              }}
                            >
                              <button
                                onClick={(e) => handleMenuToggle(column, e)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '1rem',
                                  color: 'var(--text-tertiary)',
                                  borderRadius: '0',
                                  lineHeight: '1',
                                  transition: 'none',
                                  fontWeight: '700',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.outline = '1px solid var(--accent-primary)';
                                  e.currentTarget.style.outlineOffset = '-1px';
                                  e.currentTarget.style.color = 'var(--text-primary)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.outline = 'none';
                                  e.currentTarget.style.color = 'var(--text-tertiary)';
                                }}
                              >
                                ...
                              </button>
                              {openMenuColumn === column && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  right: 0,
                                  marginTop: '0',
                                  backgroundColor: 'var(--bg-elevated)',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: '0',
                                  boxShadow: 'none',
                                  minWidth: '140px',
                                  zIndex: 100,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  overflow: 'hidden',
                                }}>
                                  <button
                                    onClick={() => handleRenameColumn(column)}
                                    style={{
                                      width: '100%',
                                      padding: '0.5rem 1rem',
                                      textAlign: 'left',
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      borderBottom: '1px solid var(--border-primary)',
                                      cursor: 'pointer',
                                      fontSize: '0.8125rem',
                                      fontWeight: '600',
                                      fontFamily: 'monospace',
                                      color: 'var(--text-primary)',
                                      transition: 'none',
                                      textTransform: 'uppercase',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                                      e.currentTarget.style.outlineOffset = '-2px';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.outline = 'none';
                                    }}
                                  >
                                    RENAME
                                  </button>
                                  <button
                                    onClick={() => handleDropColumn(column)}
                                    style={{
                                      width: '100%',
                                      padding: '0.5rem 1rem',
                                      textAlign: 'left',
                                      backgroundColor: 'transparent',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontSize: '0.8125rem',
                                      fontWeight: '600',
                                      fontFamily: 'monospace',
                                      color: 'var(--accent-danger)',
                                      transition: 'none',
                                      textTransform: 'uppercase',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.outline = '2px solid var(--accent-danger)';
                                      e.currentTarget.style.outlineOffset = '-2px';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.outline = 'none';
                                    }}
                                  >
                                    DROP
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div
                      onMouseDown={(e) => handleResizeStart(column, e)}
                      style={{
                        position: 'absolute',
                        right: '-3px',
                        top: 0,
                        bottom: 0,
                        width: '16px',
                        cursor: 'col-resize',
                        zIndex: 2,
                        transition: 'none',
                        display: 'flex',
                        alignItems: 'stretch',
                        justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => {
                        if (resizingColumn !== column) {
                          (e.currentTarget.firstElementChild as HTMLElement | null)?.style.setProperty('background-color', 'var(--border-accent)');
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (resizingColumn !== column) {
                          (e.currentTarget.firstElementChild as HTMLElement | null)?.style.setProperty('background-color', 'var(--border-primary)');
                        }
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: '1px',
                          backgroundColor: resizingColumn === column ? 'var(--accent-primary)' : 'var(--border-primary)',
                          flex: '0 0 1px',
                          transition: 'background-color 0.15s ease',
                        }}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => {
              const isExpanded = expandedRowId === row.id;
              return (
                <tr
                  key={row.id}
                  onClick={(e) => handleRowClick(row.id, e)}
                  style={{
                    backgroundColor: isExpanded 
                      ? 'var(--bg-hover)' 
                      : idx % 2 === 0 ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
                    cursor: 'pointer',
                    transition: 'none',
                    borderBottom: '1px solid var(--border-primary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.outline = '2px solid var(--accent-primary)';
                      e.currentTarget.style.outlineOffset = '-2px';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.outline = 'none';
                    }
                  }}
                >
                  <td
                    ref={(el) => { rowNumberCellRefs.current[row.id] = el; }}
                    style={{
                      padding: isExpanded ? '0.75rem 0.5rem' : '0.5rem 0.5rem',
                      textAlign: 'center',
                      fontWeight: '700',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      backgroundColor: isExpanded 
                        ? 'var(--bg-hover)' 
                        : idx % 2 === 0 ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
                      whiteSpace: 'nowrap',
                      width: '60px',
                      minWidth: '60px',
                      maxWidth: '60px',
                      transition: 'none',
                      verticalAlign: 'top',
                      borderRight: '1px solid var(--border-primary)',
                    }}
                  >
                    {idx + 1}
                  </td>
                  {allColumns.map((column) => {
                    const isEvalColumn = EVAL_COLUMNS.includes(column);
                    const isJudgeColumn = judgeColumnNames.includes(column);
                    const isFunctionEvalColumn = functionEvalColumnNames.includes(column);
                    const isFeedbackColumn = column === "Feedback";
                    const isOutputColumn = column === "Output";
                    const isAnnotationColumn = column === "Annotation";
                    const columnWidth = columnWidths[column] || (isEvalColumn ? 200 : isJudgeColumn || isFunctionEvalColumn ? 180 : 120);
                    return (
                      <td
                        key={column}
                        style={{
                          padding: isExpanded ? '0.75rem 0.5rem' : '0.5rem 0.5rem',
                          overflow: isExpanded || isFeedbackColumn ? 'visible' : 'hidden',
                          textOverflow: isExpanded || isFeedbackColumn ? 'clip' : 'ellipsis',
                          whiteSpace: (isExpanded && !isEvalColumn && !isJudgeColumn && !isFunctionEvalColumn) || isFeedbackColumn ? 'pre-wrap' : 'nowrap',
                          wordBreak: (isExpanded || isFeedbackColumn) ? 'break-word' : 'normal',
                          verticalAlign: (isOutputColumn || isAnnotationColumn || isJudgeColumn || isFunctionEvalColumn) ? 'middle' : 'top',
                          width: `${columnWidth}px`,
                          minWidth: `${Math.max(175, columnWidth)}px`,
                          maxWidth: isExpanded && (isJudgeColumn || isFunctionEvalColumn) ? 'none' : `${columnWidth}px`,
                          color: 'var(--text-primary)',
                          fontSize: '0.8125rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        {renderCellContent(column, row, row.id)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
