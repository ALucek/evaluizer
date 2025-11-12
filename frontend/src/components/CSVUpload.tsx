import { useState } from 'react';
import { uploadCSV, CSVData } from '../services/api';

interface CSVUploadProps {
  onUploadSuccess: (data: CSVData) => void;
}

export default function CSVUpload({ onUploadSuccess }: CSVUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const data = await uploadCSV(file);
      onUploadSuccess(data);
      setFile(null);
      // Reset file input
      const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ 
      padding: '1.5rem', 
      border: '1px solid #ddd', 
      borderRadius: '8px',
      backgroundColor: '#fafafa',
    }}>
      <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Upload CSV File</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input
          id="csv-file-input"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ 
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.9rem',
          }}
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: uploading || !file ? 'not-allowed' : 'pointer',
            opacity: uploading || !file ? 0.6 : 1,
            fontSize: '1rem',
            fontWeight: '500',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!uploading && file) {
              e.currentTarget.style.backgroundColor = '#0056b3';
            }
          }}
          onMouseLeave={(e) => {
            if (!uploading && file) {
              e.currentTarget.style.backgroundColor = '#007bff';
            }
          }}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {error && (
          <div style={{ 
            marginTop: '0.5rem', 
            color: '#dc3545',
            fontSize: '0.9rem',
            padding: '0.5rem',
            backgroundColor: '#fee',
            borderRadius: '4px',
          }}>
            {error}
          </div>
        )}
        {file && (
          <div style={{ 
            marginTop: '0.5rem', 
            color: '#666',
            fontSize: '0.9rem',
          }}>
            Selected: <strong>{file.name}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
