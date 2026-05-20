from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import Request

from config import GOOGLE_SHEET_RANGE


def _upload_link(filename: Optional[str], request: Request) -> str:
    if not filename:
        return ""
    base_url = os.getenv("PUBLIC_API_URL") or str(request.base_url).rstrip("/")
    return f"{base_url}/uploads/{filename}"


def _get_sheets_service():
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise RuntimeError("Google Sheets dependencies are not installed.") from exc

    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    raw_credentials = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    credentials_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    if raw_credentials:
        info = json.loads(raw_credentials)
        if "private_key" in info:
            info["private_key"] = info["private_key"].replace("\\n", "\n")
        credentials = Credentials.from_service_account_info(info, scopes=scopes)
    elif credentials_file:
        credentials = Credentials.from_service_account_file(credentials_file, scopes=scopes)
    else:
        raise RuntimeError("Google Sheets credentials are not configured.")

    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


def _append_lead_row(row: list[str]):
    sheet_id = os.getenv("GOOGLE_SHEET_ID", "")
    if not sheet_id:
        raise RuntimeError("GOOGLE_SHEET_ID is not configured.")

    service = _get_sheets_service()
    service.spreadsheets().values().append(
        spreadsheetId=sheet_id,
        range=GOOGLE_SHEET_RANGE,
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute()
