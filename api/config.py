from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

ROOT = Path(__file__).resolve().parent
SCOPES = ("https://www.googleapis.com/auth/spreadsheets",)

load_dotenv(ROOT / ".env")


class Config:
    def __init__(self) -> None:
        self.sheet_id = os.getenv("GOOGLE_SHEET_ID", "").strip()
        self.sheet_name = os.getenv("GOOGLE_SHEET_NAME", "").strip()
        self.worksheet = os.getenv("GOOGLE_WORKSHEET", "Заявки").strip() or "Заявки"
        self.service_account_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
        self.service_account_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
        self.cors_origins = [
            item.strip()
            for item in os.getenv("API_CORS_ORIGINS", "").split(",")
            if item.strip()
        ]
        if "*" in self.cors_origins:
            raise ValueError("API_CORS_ORIGINS must list explicit origins")
        self.site_dir = ROOT.parent / "site" / "dist"

    def credentials(self) -> Credentials:
        if self.service_account_json:
            info = json.loads(self.service_account_json)
        elif self.service_account_file:
            info = json.loads(Path(self.service_account_file).read_text(encoding="utf-8"))
        else:
            default = ROOT / "credentials.json"
            if not default.exists():
                raise RuntimeError(
                    "Set GOOGLE_SERVICE_ACCOUNT_FILE or put credentials.json next to main.py"
                )
            info = json.loads(default.read_text(encoding="utf-8"))
        return Credentials.from_service_account_info(info, scopes=SCOPES)


config = Config()
