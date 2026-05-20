from __future__ import annotations

import base64
import json
import os
import random
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from config import UPLOAD_FOLDER
from services.ai_analysis import analyze_with_openai
from services.doctors import get_doctors
from services.image_processing import (
    create_detection_image,
    create_face_crop_image,
    enhance_image,
    extract_all_face_regions,
    extract_hair_regions,
    resize_image_if_large,
)

router = APIRouter(prefix="/api")


@router.post("/analyze")
async def analyze(
    face_images:    Optional[UploadFile] = File(None),
    camera_image_1: Optional[str] = Form(None),
    camera_image_2: Optional[str] = Form(None),
    camera_image_3: Optional[str] = Form(None),
    patient_info:   Optional[str] = Form(None),
):
    filename: Optional[str] = None
    scanned_files: list[str] = []
    parsed_patient_info: dict[str, Any] = {}
    if patient_info:
        try:
            raw_patient_info = json.loads(patient_info)
            if isinstance(raw_patient_info, dict):
                parsed_patient_info = raw_patient_info
        except Exception:
            parsed_patient_info = {}

    # Save uploaded file
    if face_images and face_images.filename:
        ext = face_images.filename.rsplit(".", 1)[-1].lower()
        if ext not in {"png", "jpg", "jpeg", "webp"}:
            raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP allowed.")
        filename = f"upload_{random.randint(10000, 99999)}.jpg"
        content  = await face_images.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image too large. Max 25MB.")
        with open(os.path.join(UPLOAD_FOLDER, filename), "wb") as f:
            f.write(content)
        scanned_files = [filename, filename, filename]

    # Save every available camera image so all captured shots can be stored.
    if not filename:
        for index, val in enumerate([camera_image_1, camera_image_2, camera_image_3], start=1):
            if val and val.strip():
                try:
                    image_data = val.split(",", 1)[1] if "," in val else val
                    shot_file = f"camera_{random.randint(10000, 99999)}_shot{index}.jpg"
                    with open(os.path.join(UPLOAD_FOLDER, shot_file), "wb") as f:
                        f.write(base64.b64decode(image_data))
                    scanned_files.append(shot_file)
                    if not filename:
                        filename = shot_file
                except Exception:
                    raise HTTPException(status_code=400, detail="Camera image could not be processed.")

    if not filename:
        raise HTTPException(status_code=400, detail="Please upload or capture a clear selfie.")

    save_path = os.path.join(UPLOAD_FOLDER, filename)

    if not resize_image_if_large(save_path):
        raise HTTPException(status_code=400, detail="Image could not be read. Please try another image.")
    for extra_file in scanned_files:
        extra_path = os.path.join(UPLOAD_FOLDER, extra_file)
        if extra_file != filename and os.path.exists(extra_path):
            resize_image_if_large(extra_path)

    image_enhanced = enhance_image(save_path)

    name              = os.path.splitext(filename)[0]
    detected_filename = f"detected_{name}.jpg"
    detected_path     = os.path.join(UPLOAD_FOLDER, detected_filename)

    face_found, face_coords, face_count = create_detection_image(save_path, detected_path)
    if not face_found:
        raise HTTPException(status_code=422, detail="Face not detected. Please use a clear front-facing selfie.")
    if face_count != 1:
        raise HTTPException(status_code=422, detail="Please capture exactly one face in the guide. Remove other people from the frame.")

    face_filename = f"face_{name}.jpg"
    face_path = os.path.join(UPLOAD_FOLDER, face_filename)
    if not create_face_crop_image(save_path, face_coords, face_path):
        raise HTTPException(status_code=422, detail="Face crop failed. Please retake with your face centered in the guide.")

    result       = analyze_with_openai(face_path, parsed_patient_info)
    if result.get("analysis_source") != "openai":
        raise HTTPException(
            status_code=503,
            detail=result.get("analysis_error", "AI analysis is unavailable. Please check the backend OpenAI configuration."),
        )

    face_regions = extract_all_face_regions(save_path, face_coords, name, result.get("problem_areas", []))
    hair_regions = extract_hair_regions(save_path, face_coords, name, result.get("hair", {}).get("problem_areas", []))

    return {
        "result":         result,
        "analysis_source": result.get("analysis_source"),
        "skin_score":     result.get("skin_score"),
        "skin_age":       result.get("skin_age"),
        "summary_quote":  result.get("summary_quote"),
        "parameters":     result.get("parameters"),
        "top_concerns":   result.get("top_concerns"),
        "treatment_plan": result.get("treatment_plan"),
        "home_care":      result.get("home_care"),
        "concern_count":  result.get("concern_count"),
        "ai_insight":     result.get("ai_insight"),
        "patient_info":   parsed_patient_info,
        "image_file":     filename,
        "face_file":      face_filename,
        "scanned_files":  scanned_files or [filename, filename, filename],
        "detected_file":  detected_filename,
        "face_regions":   face_regions,
        "hair_regions":   hair_regions,
        "image_enhanced": image_enhanced,
        "doctors":        get_doctors(),
    }
