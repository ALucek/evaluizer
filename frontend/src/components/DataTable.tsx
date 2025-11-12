import { useState, useEffect, useRef, startTransition } from 'react';
import { CSVDataWithRows, getEvaluationsForCSV, Evaluation, Prompt, updateEvaluation, getEvaluationForRow } from '../services/api';
import { LLMConfig } from './LLMConfigPanel';

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

  // Calculate and set column widths to fit container
  const calculateColumnWidths = () => {
    if (!data?.columns || !tableRef.current) return;
    
    const container = tableRef.current.parentElement;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    if (containerWidth === 0) return; // Container not ready yet
    
    const allColumns = [...data.columns, ...EVAL_COLUMNS];
    const evalColumnCount = EVAL_COLUMNS.length;
    const regularColumnCount = data.columns.length;
    
    // Reserve space for evaluation columns (wider)
    const evalColumnWidth = Math.max(200, containerWidth * 0.15);
    const reservedForEval = evalColumnWidth * evalColumnCount;
    
    // Distribute remaining space among regular columns
    const remainingWidth = Math.max(0, containerWidth - reservedForEval);
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
      const allColumns = [...data.columns, ...EVAL_COLUMNS];
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
  }, [data?.columns]);

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
      getEvaluationsForCSV(data.id).then(evals => {
        const evalMap: { [key: number]: Evaluation } = {};
        evals.forEach(evaluation => {
          evalMap[evaluation.csv_row_id] = evaluation;
        });
        setEvaluations(evalMap);
        
        // Initialize local row data from evaluations
        const initialData: { [key: number]: any } = {};
        data.rows.forEach(row => {
          const evaluation = evalMap[row.id];
          initialData[row.id] = {
            annotation: evaluation?.annotation ?? null,
            feedback: evaluation?.feedback ?? "",
            output: evaluation?.output ?? "",
          };
        });
        setLocalRowData(initialData);
      }).catch(err => {
        console.error('Failed to load evaluations:', err);
        // Initialize with empty evaluations
        const initialData: { [key: number]: any } = {};
        data.rows.forEach(row => {
          initialData[row.id] = {
            annotation: null,
            feedback: "",
            output: "",
          };
        });
        setLocalRowData(initialData);
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
            numberCell.style.backgroundColor = '#e7f3ff';
          } else {
            numberCell.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#f9f9f9';
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
        color: '#666',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        No data selected. Select a file tab above to view data.
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center', 
        color: '#666',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        No rows found in this CSV file.
      </div>
    );
  }

  // Combine CSV columns with evaluation columns
  const allColumns = [...data.columns, ...EVAL_COLUMNS];

  const handleRowClick = (rowId: number, e: React.MouseEvent) => {
    // Don't expand row if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('.column-menu, .annotation-buttons, .feedback-input') || 
        target.closest('[data-feedback-cell]')) {
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
    setLocalRowData(prev => ({
      ...prev,
      [rowId]: { ...prev[rowId], feedback: value }
    }));
  };

  const handleFeedbackBlur = async (rowId: number) => {
    if (onUpdateRow) {
      try {
        await onUpdateRow(rowId, undefined, localRowData[rowId]?.feedback);
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
          await onUpdateRow(rowId, undefined, localRowData[rowId]?.feedback);
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
    resizeStartWidthRef.current = columnWidths[column] || (EVAL_COLUMNS.includes(column) ? 200 : 120);
    setResizingColumn(column);
  };

  useEffect(() => {
    const handleResizeMove = (e: MouseEvent) => {
      if (!resizeColumnRef.current) return;
      
      const deltaX = e.clientX - resizeStartXRef.current;
      const newWidth = Math.max(80, resizeStartWidthRef.current + deltaX); // Minimum width 80px
      
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
            color: showPlaceholder ? '#999' : (displayOutput && displayOutput !== "—" ? '#212529' : '#999'), 
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
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
            {hasOutput && (
              <button
                onClick={(e) => handleClearOutput(rowId, e)}
                disabled={isRowRunning || isRunningAll}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: (isRowRunning || isRunningAll) ? '#ccc' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (isRowRunning || isRunningAll) ? 'not-allowed' : 'pointer',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title="Clear output for this row"
              >
                Clear
              </button>
            )}
          {currentPrompt && llmConfig && currentPrompt.content && (
            <button
              onClick={(e) => handleRunRow(rowId, e)}
                disabled={isRowRunning || isRunningAll}
              style={{
                padding: '0.25rem 0.5rem',
                  backgroundColor: (isRowRunning || isRunningAll) ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                  cursor: (isRowRunning || isRunningAll) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap',
                  flexShrink: 0,
              }}
              title="Run prompt for this row"
            >
                {(isRowRunning || isRunningAll) ? 'Running...' : 'Run'}
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
        backgroundColor: annotation === 1 ? '#28a745' : (isDisabled ? '#e9ecef' : '#f0f0f0'),
        color: annotation === 1 ? 'white' : (isDisabled ? '#adb5bd' : '#333'),
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontSize: '1rem',
        opacity: isDisabled ? 0.6 : 1,
      };
      
      const thumbsDownStyle: React.CSSProperties = {
        padding: '0.25rem 0.5rem',
        backgroundColor: annotation === 0 ? '#dc3545' : (isDisabled ? '#e9ecef' : '#f0f0f0'),
        color: annotation === 0 ? 'white' : (isDisabled ? '#adb5bd' : '#333'),
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontSize: '1rem',
        opacity: isDisabled ? 0.6 : 1,
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
          >
            👍
          </button>
          <button
            key={`thumb-down-${rowId}-${annotationKey}`}
            onClick={(e) => handleAnnotationClick(rowId, 0, e)}
            disabled={isDisabled}
            style={thumbsDownStyle}
          >
            👎
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
            placeholder="Enter feedback..."
            style={{
              width: '100%',
              padding: '0.25rem 0.5rem',
              border: '2px solid #007bff',
              borderRadius: '4px',
              fontSize: '0.85rem',
              outline: 'none',
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
            color: isDisabled ? '#adb5bd' : (feedbackValue ? '#212529' : '#999'),
            fontStyle: feedbackValue ? 'normal' : 'italic',
            opacity: isDisabled ? 0.6 : 1,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          {feedbackValue || (isDisabled ? "—" : "Click to add feedback...")}
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
        fontSize: '0.9rem',
        color: '#666',
      }}>
        {data.rows.length} rows • {data.columns.length} columns
      </div>
      <div style={{ 
        flex: 1,
        overflow: 'auto',
        border: '1px solid #ddd',
        borderRadius: '4px',
      }}>
        <table
          ref={tableRef}
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem',
            tableLayout: 'fixed',
          }}
        >
          <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
            <tr style={{ backgroundColor: '#f5f5f5', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
              <th
                style={{
                  padding: '0.5rem 0.75rem',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  backgroundColor: '#f5f5f5',
                  whiteSpace: 'nowrap',
                  width: '60px',
                  minWidth: '60px',
                  maxWidth: '60px',
                  verticalAlign: 'middle',
                }}
              >
                #
              </th>
              {allColumns.map((column) => {
                const isEvalColumn = EVAL_COLUMNS.includes(column);
                const columnWidth = columnWidths[column] || (isEvalColumn ? 200 : 120);
                return (
                  <th
                    key={column}
                    style={{
                      padding: '0.5rem 0.75rem',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      backgroundColor: '#f5f5f5',
                      position: 'relative',
                      whiteSpace: 'nowrap',
                      width: `${columnWidth}px`,
                      minWidth: `${columnWidth}px`,
                      maxWidth: `${columnWidth}px`,
                      zIndex: 1,
                      verticalAlign: 'middle',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      position: 'relative',
                      width: '100%',
                      paddingRight: !isEvalColumn ? '1.5rem' : '0',
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
                            border: '2px solid #007bff',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            outline: 'none',
                            textAlign: 'center',
                            minWidth: '100px',
                            maxWidth: '200px',
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
                            paddingRight: !isEvalColumn ? '0.5rem' : '0',
                          }}>
                            {column}
                          </span>
                          {!isEvalColumn && (
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
                                  color: '#666',
                                  borderRadius: '4px',
                                  lineHeight: '1',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#e0e0e0';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                              >
                                ⋯
                              </button>
                              {openMenuColumn === column && (
                                <div style={{
                                  position: 'absolute',
                                  top: '100%',
                                  right: 0,
                                  marginTop: '0.25rem',
                                  backgroundColor: 'white',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                  minWidth: '120px',
                                  zIndex: 100,
                                  display: 'flex',
                                  flexDirection: 'column',
                                }}>
                                  <button
                                    onClick={() => handleRenameColumn(column)}
                                    style={{
                                      width: '100%',
                                      padding: '0.5rem 0.75rem',
                                      textAlign: 'left',
                                      backgroundColor: 'white',
                                      border: 'none',
                                      borderBottom: '1px solid #eee',
                                      cursor: 'pointer',
                                      fontSize: '0.85rem',
                                      color: '#333',
                                      borderRadius: '4px 4px 0 0',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = 'white';
                                    }}
                                  >
                                    Rename
                                  </button>
                                  <button
                                    onClick={() => handleDropColumn(column)}
                                    style={{
                                      width: '100%',
                                      padding: '0.5rem 0.75rem',
                                      textAlign: 'left',
                                      backgroundColor: 'white',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontSize: '0.85rem',
                                      color: '#dc3545',
                                      borderRadius: '0 0 4px 4px',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = 'white';
                                    }}
                                  >
                                    Drop
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
                        right: '0',
                        top: 0,
                        bottom: 0,
                        width: '1px',
                        cursor: 'col-resize',
                        backgroundColor: resizingColumn === column ? '#007bff' : '#ddd',
                        zIndex: 2,
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (resizingColumn !== column) {
                          e.currentTarget.style.backgroundColor = '#999';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (resizingColumn !== column) {
                          e.currentTarget.style.backgroundColor = '#ddd';
                        }
                      }}
                    />
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
                      ? '#e7f3ff' 
                      : idx % 2 === 0 ? '#fff' : '#f9f9f9',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) {
                      const hoverColor = '#f0f0f0';
                      e.currentTarget.style.backgroundColor = hoverColor;
                      const numberCell = rowNumberCellRefs.current[row.id];
                      if (numberCell) {
                        numberCell.style.backgroundColor = hoverColor;
                      }
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) {
                      const baseColor = idx % 2 === 0 ? '#fff' : '#f9f9f9';
                      e.currentTarget.style.backgroundColor = baseColor;
                      const numberCell = rowNumberCellRefs.current[row.id];
                      if (numberCell) {
                        numberCell.style.backgroundColor = baseColor;
                      }
                    }
                  }}
                >
                  <td
                    ref={(el) => { rowNumberCellRefs.current[row.id] = el; }}
                    style={{
                      padding: isExpanded ? '1rem 0.75rem' : '0.5rem 0.75rem',
                      textAlign: 'center',
                      fontWeight: '500',
                      color: '#666',
                      backgroundColor: isExpanded 
                        ? '#e7f3ff' 
                        : idx % 2 === 0 ? '#fff' : '#f9f9f9',
                      whiteSpace: 'nowrap',
                      width: '60px',
                      minWidth: '60px',
                      maxWidth: '60px',
                      transition: 'background-color 0.2s',
                      verticalAlign: 'top',
                    }}
                  >
                    {idx + 1}
                  </td>
                  {allColumns.map((column) => {
                    const isEvalColumn = EVAL_COLUMNS.includes(column);
                    const isFeedbackColumn = column === "Feedback";
                    const columnWidth = columnWidths[column] || (isEvalColumn ? 200 : 120);
                    return (
                      <td
                        key={column}
                        style={{
                          padding: isExpanded ? '1rem 0.75rem' : '0.5rem 0.75rem',
                          overflow: isExpanded || isFeedbackColumn ? 'visible' : 'hidden',
                          textOverflow: isExpanded || isFeedbackColumn ? 'clip' : 'ellipsis',
                          whiteSpace: (isExpanded && !isEvalColumn) || isFeedbackColumn ? 'pre-wrap' : 'nowrap',
                          wordBreak: (isExpanded || isFeedbackColumn) ? 'break-word' : 'normal',
                          verticalAlign: 'top',
                          width: `${columnWidth}px`,
                          minWidth: `${columnWidth}px`,
                          maxWidth: `${columnWidth}px`,
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
