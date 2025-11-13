import { useState, useEffect, useRef, useCallback } from 'react';
import { CSVData, exportCSV, uploadCSV } from '../services/api';

interface CSVFileListProps {
  files: CSVData[];
  selectedFileId: number | null;
  currentPromptId: number | null | undefined;
  onSelectFile: (id: number) => void;
  onDeleteFile: (id: number) => void;
  onUploadSuccess: (data: CSVData) => void;
}

export default function CSVFileList({ files, selectedFileId, currentPromptId, onSelectFile, onDeleteFile, onUploadSuccess }: CSVFileListProps) {
  const [openMenuFileId, setOpenMenuFileId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const buttonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuFileId !== null) {
        const menuElement = menuRefs.current[openMenuFileId];
        const buttonElement = buttonRefs.current[openMenuFileId];
        if (menuElement && !menuElement.contains(event.target as Node) &&
            buttonElement && !buttonElement.contains(event.target as Node)) {
          setOpenMenuFileId(null);
          setMenuPosition(null);
        }
      }
    };

    if (openMenuFileId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuFileId]);

  const handleMenuToggle = (e: React.MouseEvent, fileId: number) => {
    e.stopPropagation(); // Prevent selecting the file when clicking menu
    
    if (openMenuFileId === fileId) {
      setOpenMenuFileId(null);
      setMenuPosition(null);
    } else {
      const button = buttonRefs.current[fileId];
      if (button) {
        const rect = button.getBoundingClientRect();
        setMenuPosition({
          top: rect.bottom + 4, // Position below the button with small gap
          right: window.innerWidth - rect.right, // Calculate from right edge
        });
      }
      setOpenMenuFileId(fileId);
    }
  };

  const handleExport = async (e: React.MouseEvent, fileId: number, filename: string) => {
    e.stopPropagation();
    setOpenMenuFileId(null);
    setMenuPosition(null);
    try {
      await exportCSV(fileId, filename, currentPromptId || undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export CSV file');
    }
  };

  const handleDelete = (e: React.MouseEvent, fileId: number) => {
    e.stopPropagation();
    setOpenMenuFileId(null);
    setMenuPosition(null);
    if (window.confirm('Are you sure you want to delete this CSV file?')) {
      onDeleteFile(fileId);
    }
  };

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await uploadCSV(file);
      onUploadSuccess(data);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  }, [onUploadSuccess]);

  return (
    <div style={{ 
      borderBottom: '1px solid var(--border-primary)',
      marginBottom: '1rem',
    }}>
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        alignItems: 'center',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '0',
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.4 : 1,
            fontSize: '1.125rem',
            fontWeight: '700',
            fontFamily: 'monospace',
            transition: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '2.5rem',
            height: '2rem',
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => {
            if (!uploading) {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (!uploading) {
              e.currentTarget.style.borderColor = 'var(--border-primary)';
            }
          }}
          title={uploading ? 'Uploading...' : 'Upload CSV file'}
        >
          {uploading ? '...' : '+'}
        </button>
        {files.map((file) => (
            <div
            key={file.id}
            style={{
              position: 'relative',
              display: 'inline-flex',
            }}
          >
            <button
              ref={(el) => { buttonRefs.current[file.id] = el; }}
              onClick={() => onSelectFile(file.id)}
              style={{
                padding: '0.5rem 1rem',
                paddingRight: '2.5rem',
                backgroundColor: selectedFileId === file.id ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
                color: selectedFileId === file.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none',
                borderBottom: selectedFileId === file.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                borderRadius: '0',
                cursor: 'pointer',
                transition: 'none',
                fontSize: '0.8125rem',
                fontWeight: selectedFileId === file.id ? '700' : '500',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                marginBottom: '-2px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                position: 'relative',
                textTransform: 'uppercase',
              }}
            >
              <span>{file.filename}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuToggle(e, file.id);
                }}
                style={{
                  padding: '0',
                  backgroundColor: 'transparent',
                  color: selectedFileId === file.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  border: 'none',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'none',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.5rem',
                  height: '1.5rem',
                  position: 'absolute',
                  right: '0.25rem',
                  fontWeight: '700',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.outline = '1px solid var(--accent-primary)';
                  e.currentTarget.style.outlineOffset = '-1px';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.outline = 'none';
                  e.currentTarget.style.color = selectedFileId === file.id ? 'var(--text-primary)' : 'var(--text-tertiary)';
                }}
                title="File options"
              >
                ...
              </button>
            </button>
            {openMenuFileId === file.id && menuPosition && (
              <div
                ref={(el) => { menuRefs.current[file.id] = el; }}
                style={{
                  position: 'fixed',
                  top: `${menuPosition.top}px`,
                  right: `${menuPosition.right}px`,
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '0',
                  boxShadow: 'none',
                  minWidth: '140px',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={(e) => handleExport(e, file.id, file.filename)}
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
                  EXPORT
                </button>
                <button
                  onClick={(e) => handleDelete(e, file.id)}
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
                  DELETE
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
