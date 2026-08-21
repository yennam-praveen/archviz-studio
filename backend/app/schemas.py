from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data: dict[str, Any]


class ProjectSummary(BaseModel):
    id: str
    name: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectOut(ProjectSummary):
    data: dict[str, Any]
