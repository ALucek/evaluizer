import { useState, useEffect, useRef } from 'react';
import { Prompt } from '../services/api';

interface PromptEditorProps {
  prompt: Prompt | null | undefined;
  versions: Prompt[];
  columns: string[];
  onSave: (prompt: string, createNewVersion: boolean, name?: string) => Promise<void>;
  onVersionSelect: (versionId: number) => void;
  onVersionNameUpdate?: (versionId: number, newName: string | null) => Promise<void>;
  onVersionDelete?: (versionId: number) => Promise<void>;
}

export default function PromptEditor({ prompt, versions, columns, onSave, onVersionSelect, onVersionNameUpdate, onVersionDelete }: PromptEditorProps) {
  const [value, setValue] = useState(prompt?.content || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
  const [editingVersionName, setEditingVersionName] = useState<string>('');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const buttonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => {
    setValue(prompt?.content || '');
  }, [prompt]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId !== null) {
        const menuElement = menuRefs.current[openMenuId];
        const buttonElement = buttonRefs.current[openMenuId];
        if (menuElement && !menuElement.contains(event.target as Node) &&
            buttonElement && !buttonElement.contains(event.target as Node)) {
          setOpenMenuId(null);
          setMenuPosition(null);
        }
      }
    };

    if (openMenuId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openMenuId]);

  // Validate prompt template in real-time
  const validatePrompt = () => {
    if (!value.trim()) {
      return { isValid: false, message: 'Prompt cannot be empty' };
    }

    // Extract all column names from template
    const columnMatches = value.match(/\{\{([^}]+)\}\}/g) || [];
    const columnNames = columnMatches.map(match => match.replace(/[{}]/g, '').trim());
    
    if (columnNames.length === 0) {
      return { isValid: false, message: 'Prompt must include at least one column variable (e.g., {{column_name}})' };
    }

    // Check if all referenced columns exist
    const missingColumns = columnNames.filter(col => !columns.includes(col));
    if (missingColumns.length > 0) {
      return { 
        isValid: false, 
        message: `Invalid columns: ${missingColumns.join(', ')}. Available: ${columns.join(', ')}` 
      };
    }

    return { isValid: true, message: null };
  };

  const validation = validatePrompt();

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const handleSave = async (createNewVersion: boolean) => {
    if (!validation.isValid) {
      return; // Button is disabled, but double-check
    }

    setIsSaving(true);
    try {
      await onSave(value, createNewVersion);
    } catch (err) {
      // Shouldn't happen due to validation, but handle gracefully
      console.error('Failed to save prompt:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEditName = (version: Prompt) => {
    setEditingVersionId(version.id);
    setEditingVersionName(version.name || `Version ${version.version}`);
  };

  const handleCancelEditName = () => {
    setEditingVersionId(null);
    setEditingVersionName('');
  };

  const handleSaveVersionName = async (versionId: number) => {
    if (!onVersionNameUpdate) return;
    
    try {
      const trimmedName = editingVersionName.trim();
      await onVersionNameUpdate(versionId, trimmedName || null);
      setEditingVersionId(null);
      setEditingVersionName('');
    } catch (err) {
      console.error('Failed to update version name:', err);
    }
  };

  const insertVariable = (columnName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const variable = `{{${columnName}}}`;
    const newValue = value.substring(0, start) + variable + value.substring(end);
    
    setValue(newValue);

    // Focus and set cursor position after inserted variable
    setTimeout(() => {
      if (textarea) {
        const newPos = start + variable.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  return (
    <div style={{
      padding: '1.5rem',
      border: '1px solid #ddd',
      borderRadius: '8px',
      backgroundColor: '#fafafa',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    }}>
      <div>
        <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Prompt Template</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
          Use <code style={{ backgroundColor: '#fff3cd', padding: '2px 4px', borderRadius: '3px' }}>{'{{column_name}}'}</code> to insert column values
        </p>
      </div>

      {versions.length > 0 && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '6px',
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#495057' }}>
            Versions:
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            maxHeight: '150px',
            overflowY: 'auto',
          }}>
            {versions.map((v) => (
              <div
                key={v.id}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: prompt?.id === v.id ? '#007bff' : 'white',
                  border: `1px solid ${prompt?.id === v.id ? '#007bff' : '#dee2e6'}`,
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                {editingVersionId === v.id ? (
                  <div style={{ flex: 1, display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={editingVersionName}
                      onChange={(e) => setEditingVersionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveVersionName(v.id);
                        } else if (e.key === 'Escape') {
                          handleCancelEditName();
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '0.25rem 0.5rem',
                        border: '1px solid #007bff',
                        borderRadius: '3px',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveVersionName(v.id)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={handleCancelEditName}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      ✗
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onVersionSelect(v.id)}
                      style={{
                        flex: 1,
                        padding: 0,
                        backgroundColor: 'transparent',
                        color: prompt?.id === v.id ? 'white' : '#495057',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (prompt?.id !== v.id) {
                          e.currentTarget.style.opacity = '0.7';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      <div style={{ fontWeight: prompt?.id === v.id ? '600' : '500' }}>
                        {v.name || `Version ${v.version}`}
                      </div>
                      {v.created_at && (
                        <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
                          {new Date(v.created_at).toLocaleString()}
                        </div>
                      )}
                    </button>
                    {(onVersionNameUpdate || onVersionDelete) && (
                      <>
                        <button
                          ref={(el) => { buttonRefs.current[v.id] = el; }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuId === v.id) {
                              setOpenMenuId(null);
                              setMenuPosition(null);
                            } else {
                              const button = buttonRefs.current[v.id];
                              if (button) {
                                const rect = button.getBoundingClientRect();
                                setMenuPosition({
                                  top: rect.bottom + 4,
                                  right: window.innerWidth - rect.right,
                                });
                              }
                              setOpenMenuId(v.id);
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: 'transparent',
                            color: prompt?.id === v.id ? 'white' : '#495057',
                            border: `1px solid ${prompt?.id === v.id ? 'rgba(255,255,255,0.3)' : '#dee2e6'}`,
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            opacity: 0.7,
                            minWidth: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = '1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '0.7';
                          }}
                          title="More options"
                        >
                          ⋯
                        </button>
                        {openMenuId === v.id && menuPosition && (
                          <div
                            ref={(el) => { menuRefs.current[v.id] = el; }}
                            style={{
                              position: 'fixed',
                              top: `${menuPosition.top}px`,
                              right: `${menuPosition.right}px`,
                              backgroundColor: 'white',
                              border: '1px solid #dee2e6',
                              borderRadius: '4px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                              zIndex: 1000,
                              minWidth: '120px',
                              overflow: 'hidden',
                            }}
                          >
                            {onVersionNameUpdate && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditName(v);
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem 0.75rem',
                                  backgroundColor: 'transparent',
                                  color: '#495057',
                                  border: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                              >
                                Rename
                              </button>
                            )}
                            {onVersionDelete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onVersionDelete) {
                                    onVersionDelete(v.id);
                                  }
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem 0.75rem',
                                  backgroundColor: 'transparent',
                                  color: '#dc3545',
                                  border: 'none',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  borderTop: onVersionNameUpdate ? '1px solid #dee2e6' : 'none',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fee';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {columns.length > 0 && (
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#666' }}>
            Available Columns:
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}>
            {columns.map((col) => (
              <button
                key={col}
                onClick={() => insertVariable(col)}
                style={{
                  padding: '0.25rem 0.5rem',
                  backgroundColor: '#e9ecef',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: '#495057',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d0d7de';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#e9ecef';
                }}
              >
                {col}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Validation indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: validation.isValid ? '#d4edda' : '#f8d7da',
        color: validation.isValid ? '#155724' : '#721c24',
        borderRadius: '4px',
        fontSize: '0.85rem',
        border: `1px solid ${validation.isValid ? '#c3e6cb' : '#f5c6cb'}`,
      }}>
        <span style={{ fontSize: '1rem' }}>
          {validation.isValid ? '✓' : '✗'}
        </span>
        <span>
          {validation.isValid 
            ? 'Valid prompt template' 
            : validation.message || 'Invalid prompt template'}
        </span>
      </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder="Enter your prompt template here...&#10;Example: Analyze the following: {{question}}"
          style={{
          width: '100%',
          minHeight: '200px',
          padding: '0.75rem',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontSize: '0.9rem',
          fontFamily: 'monospace',
          lineHeight: '1.5',
          boxSizing: 'border-box',
            resize: 'vertical',
            outline: 'none',
          }}
        />

      {prompt && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving || !validation.isValid}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              backgroundColor: validation.isValid ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isSaving || !validation.isValid) ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              opacity: (isSaving || !validation.isValid) ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Update Prompt'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving || !validation.isValid}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              backgroundColor: validation.isValid ? '#007bff' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isSaving || !validation.isValid) ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              opacity: (isSaving || !validation.isValid) ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'New Prompt'}
          </button>
        </div>
      )}

      {!prompt && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving || !validation.isValid}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              backgroundColor: validation.isValid ? '#007bff' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (isSaving || !validation.isValid) ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              opacity: (isSaving || !validation.isValid) ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Save Prompt'}
          </button>
        </div>
      )}
    </div>
  );
}
