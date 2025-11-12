from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
import csv
import json
import io
from typing import List

from app.database import get_db
from app.models.csv_data import CSVFile, CSVRow
from app.schemas.csv_data import CSVFileResponse, CSVFileWithRowsResponse, CSVRowResponse, DropColumnsRequest

router = APIRouter()


@router.post("/upload", response_model=CSVFileResponse)
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a CSV file and store it in the database"""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    # Read CSV file
    contents = await file.read()
    csv_file = io.StringIO(contents.decode('utf-8'))
    reader = csv.DictReader(csv_file)
    
    # Get column names (original columns only, no eval columns)
    columns = reader.fieldnames
    if not columns:
        raise HTTPException(status_code=400, detail="CSV file is empty or invalid")
    
    # Create CSVFile record
    csv_file = CSVFile(
        filename=file.filename,
        columns=json.dumps(list(columns))
    )
    db.add(csv_file)
    db.flush()  # Get the ID
    
    # Read and store rows (original data only)
    rows = []
    for row_dict in reader:
        row = CSVRow(
            csv_file_id=csv_file.id,
            row_data=json.dumps(row_dict)
        )
        rows.append(row)
    
    db.add_all(rows)
    db.commit()
    db.refresh(csv_file)
    
    return CSVFileResponse(
        id=csv_file.id,
        filename=csv_file.filename,
        uploaded_at=csv_file.uploaded_at,
        columns=json.loads(csv_file.columns),
        row_count=len(rows)
    )


@router.get("/", response_model=List[CSVFileResponse])
async def list_csv_files(db: Session = Depends(get_db)):
    """List all uploaded CSV files"""
    csv_files = db.query(CSVFile).all()
    result = []
    for csv_file in csv_files:
        row_count = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_file.id).count()
        result.append(CSVFileResponse(
            id=csv_file.id,
            filename=csv_file.filename,
            uploaded_at=csv_file.uploaded_at,
            columns=json.loads(csv_file.columns),
            row_count=row_count
        ))
    return result


@router.get("/{csv_id}", response_model=CSVFileWithRowsResponse)
async def get_csv_data(csv_id: int, db: Session = Depends(get_db)):
    """Get CSV data with all rows"""
    csv_file = db.query(CSVFile).filter(CSVFile.id == csv_id).first()
    if not csv_file:
        raise HTTPException(status_code=404, detail="CSV file not found")
    
    rows = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_id).all()
    
    return CSVFileWithRowsResponse(
        id=csv_file.id,
        filename=csv_file.filename,
        uploaded_at=csv_file.uploaded_at,
        columns=json.loads(csv_file.columns),
        rows=[
            CSVRowResponse(
                id=row.id,
                csv_file_id=row.csv_file_id,
                row_data=json.loads(row.row_data)
            )
            for row in rows
        ]
    )


@router.delete("/{csv_id}")
async def delete_csv(csv_id: int, db: Session = Depends(get_db)):
    """Delete a CSV file and all its rows"""
    csv_file = db.query(CSVFile).filter(CSVFile.id == csv_id).first()
    if not csv_file:
        raise HTTPException(status_code=404, detail="CSV file not found")
    
    # Delete the CSVFile record (rows and evaluations will be deleted automatically due to cascade)
    db.delete(csv_file)
    db.commit()
    
    return {"message": "CSV file deleted successfully", "id": csv_id}


@router.post("/{csv_id}/drop-columns", response_model=CSVFileResponse)
async def drop_columns(csv_id: int, request: DropColumnsRequest, db: Session = Depends(get_db)):
    """Drop columns from a CSV dataset"""
    csv_file = db.query(CSVFile).filter(CSVFile.id == csv_id).first()
    if not csv_file:
        raise HTTPException(status_code=404, detail="CSV file not found")
    
    current_columns = json.loads(csv_file.columns)
    
    # Validate that columns to drop exist
    invalid_columns = [col for col in request.columns if col not in current_columns]
    if invalid_columns:
        raise HTTPException(
            status_code=400, 
            detail=f"Columns not found: {', '.join(invalid_columns)}"
        )
    
    # Check that we're not dropping all columns
    if len(request.columns) >= len(current_columns):
        raise HTTPException(
            status_code=400,
            detail="Cannot drop all columns. At least one column must remain."
        )
    
    # Update columns list
    new_columns = [col for col in current_columns if col not in request.columns]
    csv_file.columns = json.dumps(new_columns)
    
    # Update all rows to remove the dropped columns
    rows = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_id).all()
    for row in rows:
        row_dict = json.loads(row.row_data)
        # Remove dropped columns from row data
        for col in request.columns:
            row_dict.pop(col, None)
        row.row_data = json.dumps(row_dict)
    
    db.commit()
    db.refresh(csv_file)
    
    row_count = len(rows)
    return CSVFileResponse(
        id=csv_file.id,
        filename=csv_file.filename,
        uploaded_at=csv_file.uploaded_at,
        columns=new_columns,
        row_count=row_count
    )
