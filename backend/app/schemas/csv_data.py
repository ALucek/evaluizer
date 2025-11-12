from pydantic import BaseModel
from datetime import datetime
from typing import List, Dict, Any, Optional


class CSVFileResponse(BaseModel):
    id: int
    filename: str
    uploaded_at: datetime
    columns: List[str]
    row_count: int
    
    class Config:
        from_attributes = True


class CSVRowResponse(BaseModel):
    id: int
    csv_file_id: int
    row_data: Dict[str, Any]
    
    class Config:
        from_attributes = True


class CSVFileWithRowsResponse(BaseModel):
    id: int
    filename: str
    uploaded_at: datetime
    columns: List[str]
    row_count: int
    rows: List[CSVRowResponse]
    
    class Config:
        from_attributes = True


class DropColumnsRequest(BaseModel):
    columns: List[str]


class RenameColumnRequest(BaseModel):
    old_name: str
    new_name: str
