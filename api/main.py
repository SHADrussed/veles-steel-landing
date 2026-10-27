from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import lru_cache

import re

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel, ConfigDict, Field, field_validator

from gspread.utils import ValueInputOption

import gspread

from .config import config


MSK = timezone(timedelta(hours=3))
HEADERS = [
    "Дата",
    "Источник",
    "ФИО",
    "Телефон",
    "Почта",
    "Заказ",
    "Примечание",
]
PHONE_RE = re.compile(r"\+?[0-9 ()-]+")
EMAIL_RE = re.compile(r"[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+")


class LeadIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=10, max_length=30)
    email: str = Field(..., min_length=5, max_length=160)
    order: str = Field(..., min_length=1, max_length=500)
    note: str = Field(default="", max_length=2000)
    source: str = Field(default="landing", max_length=40)

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str) -> str:
        if not PHONE_RE.fullmatch(value) or not 10 <= len(re.sub(r"\D", "", value)) <= 15:
            raise ValueError("Укажите телефон: от 10 до 15 цифр")
        return value

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        if not EMAIL_RE.fullmatch(value):
            raise ValueError("Укажите корректную почту")
        return value


def _clean(value: str) -> str:
    return " ".join((value or "").split())


@lru_cache(maxsize=1)
def _worksheet():
    if not config.sheet_id and not config.sheet_name:
        raise RuntimeError("Set GOOGLE_SHEET_ID or GOOGLE_SHEET_NAME in .env")

    client = gspread.authorize(config.credentials())
    client.set_timeout(10)
    book = client.open_by_key(config.sheet_id) if config.sheet_id else client.open(config.sheet_name)
    try:
        ws = book.worksheet(config.worksheet)
    except gspread.WorksheetNotFound:
        ws = book.add_worksheet(title=config.worksheet, rows=2000, cols=len(HEADERS))

    existing = ws.row_values(1)
    if not existing:
        ws.update(range_name="A1:G1", values=[HEADERS])
    elif existing[: len(HEADERS)] != HEADERS:
        raise RuntimeError("Worksheet headers differ; review configuration before writing")
    return ws


def worksheet():
    try:
        return _worksheet()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Проблемы с подключением к Google Sheets") from exc


app = FastAPI(title="Velesteel leads", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/leads")
def create_lead(lead: LeadIn, ws=Depends(worksheet)):
    name = _clean(lead.name)
    phone = _clean(lead.phone)
    email = _clean(lead.email)

    row = [
        datetime.now(MSK).strftime("%d.%m.%Y %H:%M"),
        _clean(lead.source) or "landing",
        name,
        phone,
        email,
        _clean(lead.order),
        _clean(lead.note),
    ]
    try:
        ws.append_row(row, value_input_option=ValueInputOption.raw)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Проблемы с подключением к Google Sheets",
        ) from exc
    return {"ok": True}


if config.site_dir.exists():
    app.mount("/", StaticFiles(directory=str(config.site_dir), html=True), name="site")
