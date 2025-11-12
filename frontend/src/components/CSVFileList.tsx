import { useState, useEffect, useRef } from 'react';
import { CSVData, exportCSV } from '../services/api';

interface CSVFileListProps {
  files: CSVData[];
  selectedFileId: number | null;
  onSelectFile: (id: number) => void;
  onDeleteFile: (id: number) => void;
}

export default function CSVFileList({ files, selectedFileId, onSelectFile, onDeleteFile }: CSVFileListProps) {
  const [openMenuFileId, setOpenMenuFileId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const menuRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const buttonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

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
      await exportCSV(fileId, filename);
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

  if (files.length === 0) {
    return (
      <div style={{ 
        borderBottom: '2px solid #ddd',
        paddingBottom: '0.5rem',
        marginBottom: '1rem'
      }}>
        <div style={{ color: '#666', fontSize: '0.9rem' }}>No files uploaded yet</div>
      </div>
    );
  }

  return (
    <div style={{ 
      borderBottom: '2px solid #ddd',
      marginBottom: '1rem',
    }}>
      <div style={{ 
        display: 'flex', 
        gap: '0.25rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
      }}>
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
                backgroundColor: selectedFileId === file.id ? '#007bff' : '#f5f5f5',
                color: selectedFileId === file.id ? 'white' : '#333',
                border: 'none',
                borderBottom: selectedFileId === file.id ? '2px solid #007bff' : '2px solid transparent',
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontSize: '0.9rem',
                whiteSpace: 'nowrap',
                marginBottom: '-2px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                position: 'relative',
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
                  color: selectedFileId === file.id ? 'white' : '#666',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'background-color 0.2s',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1.5rem',
                  height: '1.5rem',
                  position: 'absolute',
                  right: '0.25rem',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = selectedFileId === file.id ? 'rgba(255,255,255,0.2)' : '#e0e0e0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="File options"
              >
                ⋯
              </button>
            </button>
            {openMenuFileId === file.id && menuPosition && (
              <div
                ref={(el) => { menuRefs.current[file.id] = el; }}
                style={{
                  position: 'fixed',
                  top: `${menuPosition.top}px`,
                  right: `${menuPosition.right}px`,
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  minWidth: '120px',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <button
                  onClick={(e) => handleExport(e, file.id, file.filename)}
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
                  Export
                </button>
                <button
                  onClick={(e) => handleDelete(e, file.id)}
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
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
