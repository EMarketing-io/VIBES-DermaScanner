from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str


class LeadRequest(BaseModel):
    name: str
    phone: str
    email: str
    gender: str
    data: dict[str, Any]
