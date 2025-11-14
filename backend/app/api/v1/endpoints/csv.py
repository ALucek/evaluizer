from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import csv
import json
import io
import zipfile
from typing import List, Optional

from app.database import get_db
from app.models.csv_data import CSVFile, CSVRow
from app.models.evaluation import Evaluation
from app.models.prompt import Prompt
from app.models.judge import JudgeConfig, JudgeResult
from app.models.function_eval import FunctionEvalConfig, FunctionEvalResult
from app.utils import parse_json_safe, get_or_404
from app.schemas.csv_data import CSVFileResponse, CSVFileWithRowsResponse, CSVRowResponse, DropColumnsRequest, RenameColumnRequest

router = APIRouter()


@router.post("/upload", response_model=CSVFileResponse)
async def upload_csv(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
) -> CSVFileResponse:
    """Upload a CSV file and store it in the database"""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV file")
    
    try:
        # Read CSV file
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="CSV file is empty")
        
        csv_string_io = io.StringIO(contents.decode('utf-8'))
        reader = csv.DictReader(csv_string_io)
        
        # Get column names (original columns only, no eval columns)
        columns = reader.fieldnames
        if not columns:
            raise HTTPException(status_code=400, detail="CSV file is empty or invalid")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV file must be UTF-8 encoded")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading CSV file: {str(e)}")
    
    # Create CSVFile record
    csv_file_record = CSVFile(
        filename=file.filename,
        columns=json.dumps(list(columns))
    )
    db.add(csv_file_record)
    db.flush()  # Get the ID
    
    # Read and store rows (original data only)
    rows = []
    try:
        for row_dict in reader:
            row = CSVRow(
                csv_file_id=csv_file_record.id,
                row_data=json.dumps(row_dict)
            )
            rows.append(row)
        
        db.add_all(rows)
        db.commit()
        db.refresh(csv_file_record)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error storing CSV data: {str(e)}")
    
    return CSVFileResponse(
        id=csv_file_record.id,
        filename=csv_file_record.filename,
        uploaded_at=csv_file_record.uploaded_at,
        columns=parse_json_safe(csv_file_record.columns, []),
        row_count=len(rows)
    )


@router.get("/", response_model=List[CSVFileResponse])
async def list_csv_files(db: Session = Depends(get_db)) -> List[CSVFileResponse]:
    """List all uploaded CSV files"""
    csv_files = db.query(CSVFile).all()
    result = []
    for csv_file in csv_files:
        row_count = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_file.id).count()
        result.append(CSVFileResponse(
            id=csv_file.id,
            filename=csv_file.filename,
            uploaded_at=csv_file.uploaded_at,
            columns=parse_json_safe(csv_file.columns, []),
            row_count=row_count
        ))
    return result


@router.get("/{csv_id}", response_model=CSVFileWithRowsResponse)
async def get_csv_data(
    csv_id: int, 
    db: Session = Depends(get_db)
) -> CSVFileWithRowsResponse:
    """Get CSV data with all rows"""
    csv_file = get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    rows = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_id).all()
    
    return CSVFileWithRowsResponse(
        id=csv_file.id,
        filename=csv_file.filename,
        uploaded_at=csv_file.uploaded_at,
        columns=parse_json_safe(csv_file.columns, []),
        row_count=len(rows),
        rows=[
            CSVRowResponse(
                id=row.id,
                csv_file_id=row.csv_file_id,
                row_data=parse_json_safe(row.row_data, {})
            )
            for row in rows
        ]
    )


@router.delete("/{csv_id}")
async def delete_csv(
    csv_id: int, 
    db: Session = Depends(get_db)
) -> dict[str, str | int]:
    """Delete a CSV file and all its rows, evaluations, and prompts"""
    csv_file = get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    # Delete prompts associated with this CSV file
    db.query(Prompt).filter(Prompt.csv_file_id == csv_id).delete()
    
    # Delete the CSVFile record (rows and evaluations will be deleted automatically due to cascade)
    db.delete(csv_file)
    db.commit()
    
    return {"message": "CSV file deleted successfully", "id": csv_id}


@router.post("/{csv_id}/drop-columns", response_model=CSVFileResponse)
async def drop_columns(
    csv_id: int, 
    request: DropColumnsRequest, 
    db: Session = Depends(get_db)
) -> CSVFileResponse:
    """Drop columns from a CSV dataset"""
    csv_file = get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    current_columns = parse_json_safe(csv_file.columns, [])
    
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
    try:
        rows = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_id).all()
        for row in rows:
            row_dict = parse_json_safe(row.row_data, {})
            # Remove dropped columns from row data
            for col in request.columns:
                row_dict.pop(col, None)
            row.row_data = json.dumps(row_dict)
        
        db.commit()
        db.refresh(csv_file)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating rows: {str(e)}")
    
    row_count = len(rows)
    return CSVFileResponse(
        id=csv_file.id,
        filename=csv_file.filename,
        uploaded_at=csv_file.uploaded_at,
        columns=new_columns,
        row_count=row_count
    )


@router.post("/{csv_id}/rename-column", response_model=CSVFileResponse)
async def rename_column(
    csv_id: int, 
    request: RenameColumnRequest, 
    db: Session = Depends(get_db)
) -> CSVFileResponse:
    """Rename a column in a CSV dataset"""
    csv_file = get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    current_columns = parse_json_safe(csv_file.columns, [])
    
    # Validate that the column to rename exists
    if request.old_name not in current_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Column not found: {request.old_name}"
        )
    
    # Validate that the new name doesn't already exist
    if request.new_name in current_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Column already exists: {request.new_name}"
        )
    
    # Validate that new name is not empty
    if not request.new_name.strip():
        raise HTTPException(
            status_code=400,
            detail="New column name cannot be empty"
        )
    
    # Update columns list
    new_columns = [col if col != request.old_name else request.new_name for col in current_columns]
    csv_file.columns = json.dumps(new_columns)
    
    # Update all rows to rename the column key
    try:
        rows = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_id).all()
        for row in rows:
            row_dict = parse_json_safe(row.row_data, {})
            # Rename the column key in row data
            if request.old_name in row_dict:
                row_dict[request.new_name] = row_dict.pop(request.old_name)
            row.row_data = json.dumps(row_dict)
        
        db.commit()
        db.refresh(csv_file)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating rows: {str(e)}")
    
    row_count = len(rows)
    return CSVFileResponse(
        id=csv_file.id,
        filename=csv_file.filename,
        uploaded_at=csv_file.uploaded_at,
        columns=new_columns,
        row_count=row_count
    )


@router.get("/{csv_id}/export")
async def export_csv_with_evaluations(
    csv_id: int, 
    prompt_id: Optional[int] = None,
    db: Session = Depends(get_db)
) -> StreamingResponse:
    """Export CSV file with all evaluation data (output, annotation, feedback), judge scores, and function eval scores, plus prompt as a ZIP file"""
    csv_file = get_or_404(db, CSVFile, csv_id, "CSV file not found")
    
    # Get all rows
    rows = db.query(CSVRow).filter(CSVRow.csv_file_id == csv_id).order_by(CSVRow.id).all()
    
    # Get all evaluations for this CSV file
    evaluations = db.query(Evaluation).filter(Evaluation.csv_file_id == csv_id).all()
    eval_map = {eval.csv_row_id: eval for eval in evaluations}
    
    # Get all judge configs for this CSV file (sorted by creation date, oldest first)
    judge_configs = db.query(JudgeConfig).filter(
        JudgeConfig.csv_file_id == csv_id
    ).order_by(JudgeConfig.created_at).all()
    
    # Get all judge results for this CSV file
    judge_results = db.query(JudgeResult).filter(
        JudgeResult.csv_file_id == csv_id
    ).all()
    
    # Build map of scores by row_id and config_id for quick lookup
    scores_by_row_and_config: dict[int, dict[int, float]] = {}
    for result in judge_results:
        if result.csv_row_id not in scores_by_row_and_config:
            scores_by_row_and_config[result.csv_row_id] = {}
        scores_by_row_and_config[result.csv_row_id][result.config_id] = result.score
    
    # Get all function eval configs for this CSV file (sorted by creation date, oldest first)
    function_eval_configs = db.query(FunctionEvalConfig).filter(
        FunctionEvalConfig.csv_file_id == csv_id
    ).order_by(FunctionEvalConfig.created_at).all()
    
    # Get all function eval results for this CSV file
    function_eval_results = db.query(FunctionEvalResult).filter(
        FunctionEvalResult.csv_file_id == csv_id
    ).all()
    
    # Build map of function eval scores by row_id and config_id for quick lookup
    function_scores_by_row_and_config: dict[int, dict[int, float]] = {}
    for result in function_eval_results:
        if result.csv_row_id not in function_scores_by_row_and_config:
            function_scores_by_row_and_config[result.csv_row_id] = {}
        function_scores_by_row_and_config[result.csv_row_id][result.config_id] = result.score
    
    # Get prompt - use provided prompt_id if available, otherwise get first prompt for CSV file
    if prompt_id:
        prompt = get_or_404(db, Prompt, prompt_id, "Prompt not found")
    else:
        prompt = db.query(Prompt).filter(Prompt.csv_file_id == csv_id).first()
    
    prompt_content = prompt.content if prompt else ""
    
    # Get original columns
    original_columns = parse_json_safe(csv_file.columns, [])
    
    # Build fieldnames: original columns + evaluation columns + judge columns + function eval columns
    judge_column_names = [config.name for config in judge_configs]
    function_eval_column_names = [config.name for config in function_eval_configs]
    fieldnames = original_columns + ["Output", "Annotation", "Feedback"] + judge_column_names + function_eval_column_names
    
    # Create CSV with original columns + evaluation columns + judge columns
    csv_output = io.StringIO()
    writer = csv.DictWriter(csv_output, fieldnames=fieldnames)
    writer.writeheader()
    
    # Write each row with its evaluation data and judge scores
    for row in rows:
        row_dict = parse_json_safe(row.row_data, {})
        evaluation = eval_map.get(row.id)
        
        # Add evaluation columns
        row_dict["Output"] = evaluation.output if evaluation and evaluation.output else ""
        row_dict["Annotation"] = (
            evaluation.annotation if evaluation and evaluation.annotation is not None
            else ""
        )
        row_dict["Feedback"] = evaluation.feedback if evaluation and evaluation.feedback else ""
        
        # Add judge scores for each judge config
        row_scores = scores_by_row_and_config.get(row.id, {})
        for config in judge_configs:
            score = row_scores.get(config.id)
            row_dict[config.name] = f"{score:.2f}" if score is not None else ""
        
        # Add function eval scores for each function eval config
        row_function_scores = function_scores_by_row_and_config.get(row.id, {})
        for config in function_eval_configs:
            score = row_function_scores.get(config.id)
            row_dict[config.name] = f"{score:.2f}" if score is not None else ""
        
        writer.writerow(row_dict)
    
    # Prepare CSV content
    csv_output.seek(0)
    csv_content = csv_output.getvalue()
    
    # Generate filenames
    base_filename = csv_file.filename.rsplit('.', 1)[0] if '.' in csv_file.filename else csv_file.filename
    csv_filename = f"{base_filename}_export.csv"
    prompt_filename = f"{base_filename}_prompt.txt"
    zip_filename = f"{base_filename}_export.zip"
    
    # Create ZIP file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add CSV file to ZIP
        zip_file.writestr(csv_filename, csv_content.encode('utf-8'))
        
        # Add prompt file to ZIP
        zip_file.writestr(prompt_filename, prompt_content.encode('utf-8'))
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_filename}"}
    )
