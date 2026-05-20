from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from schemas import LeadRequest
from services.pdf_report import _generate_pdf_report
from services.sheets import _append_lead_row, _upload_link

router = APIRouter(prefix="/api")


@router.post("/submit-lead")
def submit_lead(body: LeadRequest, request: Request):
    name = body.name.strip()
    phone = body.phone.strip()
    email = body.email.strip()
    gender = body.gender.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if not re.fullmatch(r"\d{10}", phone):
        raise HTTPException(status_code=400, detail="Enter a valid 10 digit Indian phone number.")
    if not re.fullmatch(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if not gender:
        raise HTTPException(status_code=400, detail="Gender is required.")

    data = body.data
    zones = {
        zone.get("area"): _upload_link(zone.get("file"), request)
        for zone in data.get("face_regions", [])
        if isinstance(zone, dict)
    }

    scanned_files = data.get("scanned_files") or []
    if not isinstance(scanned_files, list):
        scanned_files = []
    if not scanned_files and data.get("image_file"):
        scanned_files = [data.get("image_file")] * 3
    while len(scanned_files) < 3:
        scanned_files.append(scanned_files[0] if scanned_files else data.get("image_file", ""))
    scanned_links = [_upload_link(str(file), request) for file in scanned_files[:3]]

    result = data.get("result", {}) if isinstance(data.get("result"), dict) else {}
    hair = result.get("hair", {}) if isinstance(result.get("hair"), dict) else {}
    skin_areas = result.get("problem_areas", [])
    hair_areas = hair.get("problem_areas", [])
    if not isinstance(skin_areas, list):
        skin_areas = []
    if not isinstance(hair_areas, list):
        hair_areas = []
    problem_areas = ", ".join([*(str(area) for area in skin_areas), *(str(area) for area in hair_areas)]) or "None"

    row = [
        name,
        f"+91{phone}",
        email,
        gender,
        zones.get("forehead", ""),
        zones.get("under_eye", ""),
        zones.get("nose", ""),
        zones.get("left_cheek", ""),
        zones.get("right_cheek", ""),
        zones.get("chin", ""),
        scanned_links[0],
        scanned_links[1],
        scanned_links[2],
        problem_areas,
    ]

    try:
        _append_lead_row(row)
    except Exception as exc:
        print(f"[Sheets] ERROR: {repr(exc)}")
        raise HTTPException(status_code=503, detail=str(exc) or "Could not save to Google Sheets.")

    return {"ok": True}


@router.post("/report-pdf")
def report_pdf(body: LeadRequest):
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", body.name.strip() or "vibes_scan").strip("_")
    pdf = _generate_pdf_report(body)
    headers = {"Content-Disposition": f'attachment; filename="{name}_Vibes_DermaScan_Report.pdf"'}
    return StreamingResponse(pdf, media_type="application/pdf", headers=headers)
