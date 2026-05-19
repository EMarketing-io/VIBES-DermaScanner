from __future__ import annotations

import os
import random
import base64
import json
import hashlib
import re
from io import BytesIO
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from typing import Any, Optional
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

app = FastAPI(title="Vibes DermaScan API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "uploads"
CACHE_FILE    = "cache/analysis_cache.json"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs("cache", exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_FOLDER), name="uploads")

OPENAI_MODEL   = "gpt-4.1-mini"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
print("OPENAI KEY FOUND:", bool(OPENAI_API_KEY))
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

GOOGLE_SHEET_RANGE = os.getenv("GOOGLE_SHEET_RANGE", "Sheet1!A:N")

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


# ─────────────────── HELPERS ───────────────────

def safe_crop(image, x1, y1, x2, y2):
    h, w = image.shape[:2]
    x1, x2 = max(0, min(x1, w - 1)), max(0, min(x2, w))
    y1, y2 = max(0, min(y1, h - 1)), max(0, min(y2, h))
    if x2 <= x1 or y2 <= y1:
        return None
    return image[y1:y2, x1:x2]


# ─────────────────── IMAGE PROCESSING ───────────────────

def resize_image_if_large(image_path, max_width=900):
    image = cv2.imread(image_path)
    if image is None:
        return False
    h, w = image.shape[:2]
    if w > max_width:
        ratio = max_width / w
        image = cv2.resize(image, (max_width, int(h * ratio)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(image_path, image, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return True


def enhance_image(image_path):
    try:
        img = Image.open(image_path).convert("RGB")
        arr = np.array(img)
        brightness = float(arr.mean())
        enhanced = False
        if brightness < 110:
            factor = min(1.55, 110 / max(brightness, 1))
            img = ImageEnhance.Brightness(img).enhance(factor)
            enhanced = True
        img = ImageEnhance.Contrast(img).enhance(1.15)
        img = ImageEnhance.Sharpness(img).enhance(1.3)
        img.save(image_path, "JPEG", quality=92)
        return enhanced
    except Exception:
        return False


def create_detection_image(image_path, output_path):
    image = cv2.imread(image_path)
    if image is None:
        return False, None
    gray  = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.2, 6)
    if len(faces) == 0:
        return False, None

    faces     = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    main_face = faces[0]
    overlay   = image.copy()

    for (x, y, w, h) in [main_face]:
        cx, cy = x + w // 2, y + h // 2
        cv2.rectangle(overlay, (x, y), (x + w, y + h), (255, 185, 45), 2)
        for scale in [0.35, 0.48, 0.62]:
            cv2.ellipse(overlay, (cx, cy), (int(w * scale), int(h * scale)),
                        0, 0, 360, (255, 185, 45), 1, cv2.LINE_AA)
        for _ in range(80):
            px = random.randint(x + 10, max(x + 11, x + w - 10))
            py = random.randint(y + 10, max(y + 11, y + h - 10))
            cv2.circle(overlay, (px, py), 2, (255, 255, 255), -1, cv2.LINE_AA)
            cv2.circle(overlay, (px, py), 6, (0, 210, 255), 1, cv2.LINE_AA)
        points = [
            (cx, y + int(h * 0.18)),
            (x + int(w * 0.25), y + int(h * 0.38)),
            (x + int(w * 0.75), y + int(h * 0.38)),
            (cx, y + int(h * 0.55)),
            (x + int(w * 0.35), y + int(h * 0.75)),
            (x + int(w * 0.65), y + int(h * 0.75)),
        ]
        for p in points:
            cv2.circle(overlay, p, 8, (0, 255, 255), 2, cv2.LINE_AA)
        for i in range(len(points) - 1):
            cv2.line(overlay, points[i], points[i + 1], (0, 255, 255), 1, cv2.LINE_AA)

    final = cv2.addWeighted(overlay, 0.82, image, 0.18, 0)
    cv2.imwrite(output_path, final, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return True, main_face


FACE_ZONE_ORDER = ["forehead", "under_eye", "nose", "left_cheek", "right_cheek", "chin"]

def extract_all_face_regions(image_path, face_coords, output_prefix, problem_areas):
    image = cv2.imread(image_path)
    if image is None:
        return []
    x, y, w, h = face_coords
    boxes = {
        "forehead":    (x + int(w * 0.18), y + int(h * 0.04), x + int(w * 0.82), y + int(h * 0.28)),
        "under_eye":   (x + int(w * 0.12), y + int(h * 0.25), x + int(w * 0.88), y + int(h * 0.48)),
        "nose":        (x + int(w * 0.33), y + int(h * 0.37), x + int(w * 0.67), y + int(h * 0.67)),
        "left_cheek":  (x + int(w * 0.02), y + int(h * 0.38), x + int(w * 0.46), y + int(h * 0.77)),
        "right_cheek": (x + int(w * 0.54), y + int(h * 0.38), x + int(w * 0.98), y + int(h * 0.77)),
        "chin":        (x + int(w * 0.24), y + int(h * 0.67), x + int(w * 0.76), y + int(h * 0.96)),
    }
    titles = {
        "forehead": "Forehead", "under_eye": "Eyes", "nose": "Nose",
        "left_cheek": "Left Cheek", "right_cheek": "Right Cheek", "chin": "Chin",
    }
    saved = []
    for area in FACE_ZONE_ORDER:
        crop = safe_crop(image, *boxes[area])
        if crop is None or crop.size == 0:
            continue
        crop     = cv2.resize(crop, (420, 300), interpolation=cv2.INTER_CUBIC)
        filename = f"{output_prefix}_{area}.jpg"
        cv2.imwrite(os.path.join(UPLOAD_FOLDER, filename), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        has_issue = area in problem_areas
        saved.append({
            "title": titles[area], "area": area,
            "has_issue": has_issue, "file": filename,
        })
    return saved


def extract_hair_regions(image_path, face_coords, output_prefix, problem_areas):
    if not problem_areas:
        return []
    image = cv2.imread(image_path)
    if image is None:
        return []
    x, y, w, h = face_coords
    region_definitions = {
        "hairline":     {"title": "Hairline",              "box": (x + int(w * 0.05), y - int(h * 0.22), x + int(w * 0.95), y + int(h * 0.10))},
        "scalp":        {"title": "Scalp / Top",           "box": (x + int(w * 0.10), y - int(h * 0.55), x + int(w * 0.90), y - int(h * 0.05))},
        "hair_overall": {"title": "Hair Texture & Density","box": (x - int(w * 0.30), y - int(h * 0.60), x + int(w * 1.30), y + int(h * 0.25))},
    }
    saved = []
    for area in problem_areas:
        if area not in region_definitions:
            continue
        region = region_definitions[area]
        crop   = safe_crop(image, *region["box"])
        if crop is None or crop.size == 0:
            continue
        crop     = cv2.resize(crop, (420, 300), interpolation=cv2.INTER_CUBIC)
        filename = f"{output_prefix}_hair_{area}.jpg"
        cv2.imwrite(os.path.join(UPLOAD_FOLDER, filename), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        saved.append({"title": region["title"], "concern": "AI detected possible concern", "file": filename})
    return saved


# ─────────────────── CACHE ───────────────────

def _image_hash(image_path):
    with open(image_path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

def _load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_cache(cache):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass


# ─────────────────── GOOGLE SHEETS ───────────────────

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


# ─────────────────── PDF REPORT ───────────────────

PAGE_W, PAGE_H = 1240, 1754
MARGIN = 80


def _font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


FONT_TITLE = _font(42, True)
FONT_H1 = _font(30, True)
FONT_H2 = _font(24, True)
FONT_BODY = _font(20)
FONT_SMALL = _font(16)
FONT_BOLD = _font(20, True)


def _new_pdf_page() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    page = Image.new("RGB", (PAGE_W, PAGE_H), "#f8fafc")
    draw = ImageDraw.Draw(page)
    return page, draw


def _wrap(draw: ImageDraw.ImageDraw, text: Any, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = str(text or "").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _draw_wrapped(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: Any, font: ImageFont.ImageFont, fill: str, max_width: int, line_gap: int = 8) -> int:
    x, y = xy
    for line in _wrap(draw, text, font, max_width):
        draw.text((x, y), line, font=font, fill=fill)
        y += font.size + line_gap
    return y


def _section(draw: ImageDraw.ImageDraw, y: int, title: str) -> int:
    draw.text((MARGIN, y), title, font=FONT_H1, fill="#0f172a")
    y += 48
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#dbe3ef", width=3)
    return y + 28


def _image_file_path(filename: Any) -> Optional[str]:
    if not filename:
        return None
    path = os.path.join(UPLOAD_FOLDER, str(filename))
    return path if os.path.exists(path) else None


def _draw_image_card(page: Image.Image, draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str, filename: Any) -> int:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=22, fill="#ffffff", outline="#dbe3ef", width=2)
    image_box = (x + 16, y + 56, x + w - 16, y + h - 18)
    draw.text((x + 18, y + 18), title, font=FONT_BOLD, fill="#111827")
    path = _image_file_path(filename)
    if path:
        try:
            image = Image.open(path).convert("RGB")
            image.thumbnail((image_box[2] - image_box[0], image_box[3] - image_box[1]))
            ix = image_box[0] + ((image_box[2] - image_box[0]) - image.width) // 2
            iy = image_box[1] + ((image_box[3] - image_box[1]) - image.height) // 2
            page.paste(image, (ix, iy))
        except Exception:
            draw.text((image_box[0], image_box[1]), "Image unavailable", font=FONT_BODY, fill="#64748b")
    else:
        draw.text((image_box[0], image_box[1]), "Image unavailable", font=FONT_BODY, fill="#64748b")
    return y + h


def _problem_label(area: Any) -> str:
    labels = {
        "forehead": "Forehead",
        "under_eye": "Eyes",
        "nose": "Nose",
        "left_cheek": "Left Cheek",
        "right_cheek": "Right Cheek",
        "chin": "Chin",
        "hairline": "Hairline",
        "scalp": "Scalp",
        "hair_overall": "Hair Overall",
    }
    return labels.get(str(area), str(area).replace("_", " ").title())


def _generate_pdf_report(body: LeadRequest) -> BytesIO:
    data = body.data
    result = data.get("result", {}) if isinstance(data.get("result"), dict) else {}
    hair = result.get("hair", {}) if isinstance(result.get("hair"), dict) else {}
    face_regions = data.get("face_regions", []) if isinstance(data.get("face_regions"), list) else []
    hair_regions = data.get("hair_regions", []) if isinstance(data.get("hair_regions"), list) else []
    scanned_files = data.get("scanned_files") or []
    if not isinstance(scanned_files, list):
        scanned_files = []
    if not scanned_files and data.get("image_file"):
        scanned_files = [data.get("image_file")] * 3
    while len(scanned_files) < 3:
        scanned_files.append(scanned_files[0] if scanned_files else data.get("image_file", ""))

    pages: list[Image.Image] = []
    page, draw = _new_pdf_page()
    pages.append(page)

    y = 70
    draw.rounded_rectangle((MARGIN, y, PAGE_W - MARGIN, y + 130), radius=30, fill="#ffffff", outline="#e2e8f0", width=2)
    draw.text((MARGIN + 34, y + 28), "Vibes DermaScan Report", font=FONT_TITLE, fill="#0f172a")
    draw.text((MARGIN + 34, y + 82), "AI skin and hair screening summary", font=FONT_BODY, fill="#64748b")
    y += 178

    y = _section(draw, y, "Details")
    details = [
        ("Name", body.name.strip()),
        ("Phone", f"+91{body.phone.strip()}"),
        ("Email", body.email.strip()),
        ("Gender", body.gender.strip()),
        ("Skin Result", result.get("main_issue", "")),
        ("Skin Accuracy", f"{result.get('confidence', 0)}%"),
        ("Hair Result", hair.get("main_issue", "")),
        ("Hair Accuracy", f"{hair.get('confidence', 0)}%"),
    ]
    for idx, (label, value) in enumerate(details):
        col = idx % 2
        row = idx // 2
        x = MARGIN + col * 540
        yy = y + row * 84
        draw.text((x, yy), label, font=FONT_SMALL, fill="#64748b")
        _draw_wrapped(draw, (x, yy + 26), value, FONT_BOLD, "#111827", 480)
    y += 380

    y = _section(draw, y, "Scanned Images")
    card_w, card_h = 340, 300
    for i, file in enumerate(scanned_files[:3]):
        x = MARGIN + i * (card_w + 30)
        _draw_image_card(page, draw, x, y, card_w, card_h, f"Scanned Img {i + 1}", file)
    y += card_h + 70

    if y > PAGE_H - 520:
        page, draw = _new_pdf_page()
        pages.append(page)
        y = 70

    y = _section(draw, y, "Face Zone Images")
    card_w, card_h = 330, 250
    for i, zone in enumerate(face_regions):
        if not isinstance(zone, dict):
            continue
        if y + card_h > PAGE_H - 80:
            page, draw = _new_pdf_page()
            pages.append(page)
            y = _section(draw, 70, "Face Zone Images")
        x = MARGIN + (i % 3) * (card_w + 30)
        row_y = y + (i % 6 // 3) * (card_h + 34)
        _draw_image_card(page, draw, x, row_y, card_w, card_h, str(zone.get("title", "Zone")), zone.get("file"))
        if i % 6 == 5:
            y += (card_h + 34) * 2
    if face_regions:
        y += (card_h + 34) * (1 if len(face_regions) % 6 <= 3 and len(face_regions) % 6 else 0)
        if len(face_regions) % 6 > 3:
            y += (card_h + 34) * 2
    y += 30

    if hair_regions:
        if y + 330 > PAGE_H - 80:
            page, draw = _new_pdf_page()
            pages.append(page)
            y = 70
        y = _section(draw, y, "Hair and Scalp Images")
        for i, region in enumerate(hair_regions):
            if not isinstance(region, dict):
                continue
            if y + card_h > PAGE_H - 80:
                page, draw = _new_pdf_page()
                pages.append(page)
                y = _section(draw, 70, "Hair and Scalp Images")
            x = MARGIN + (i % 3) * (card_w + 30)
            _draw_image_card(page, draw, x, y, card_w, card_h, str(region.get("title", "Hair Region")), region.get("file"))
            if i % 3 == 2:
                y += card_h + 34
        y += card_h + 64

    if y + 500 > PAGE_H - 80:
        page, draw = _new_pdf_page()
        pages.append(page)
        y = 70
    y = _section(draw, y, "Problems and Accuracy")
    skin_areas = result.get("problem_areas", []) if isinstance(result.get("problem_areas"), list) else []
    hair_areas = hair.get("problem_areas", []) if isinstance(hair.get("problem_areas"), list) else []
    problems = [_problem_label(area) for area in [*skin_areas, *hair_areas]] or ["No major visible concern"]
    y = _draw_wrapped(draw, (MARGIN, y), f"Problem Areas: {', '.join(problems)}", FONT_BOLD, "#0f172a", PAGE_W - 2 * MARGIN)
    y += 24
    y = _draw_wrapped(draw, (MARGIN, y), f"Skin: {result.get('main_issue', '')} ({result.get('confidence', 0)}% accuracy)", FONT_BODY, "#334155", PAGE_W - 2 * MARGIN)
    y = _draw_wrapped(draw, (MARGIN, y + 8), result.get("summary", ""), FONT_BODY, "#475569", PAGE_W - 2 * MARGIN)
    y += 26
    y = _draw_wrapped(draw, (MARGIN, y), f"Hair: {hair.get('main_issue', '')} ({hair.get('confidence', 0)}% accuracy)", FONT_BODY, "#334155", PAGE_W - 2 * MARGIN)
    y = _draw_wrapped(draw, (MARGIN, y + 8), hair.get("summary", ""), FONT_BODY, "#475569", PAGE_W - 2 * MARGIN)

    y += 38
    draw.text((MARGIN, y), "Recommended Tips", font=FONT_H2, fill="#0f172a")
    y += 38
    tips = [*(result.get("tips", []) if isinstance(result.get("tips"), list) else []), *(hair.get("tips", []) if isinstance(hair.get("tips"), list) else [])]
    for tip in tips[:6]:
        y = _draw_wrapped(draw, (MARGIN + 24, y), f"- {tip}", FONT_BODY, "#475569", PAGE_W - 2 * MARGIN - 24)

    footer = "AI screening is for guidance only. Consult a certified dermatologist or trichologist for diagnosis."
    for page in pages:
        d = ImageDraw.Draw(page)
        d.line((MARGIN, PAGE_H - 82, PAGE_W - MARGIN, PAGE_H - 82), fill="#dbe3ef", width=2)
        d.text((MARGIN, PAGE_H - 58), footer, font=FONT_SMALL, fill="#64748b")

    output = BytesIO()
    pages[0].save(output, format="PDF", save_all=True, append_images=pages[1:], resolution=150)
    output.seek(0)
    return output


# ─────────────────── AI ANALYSIS ───────────────────

ANALYSIS_PROMPT = """
You are an AI skin and hair analysis system used in a premium dermatology and trichology clinic called Vibes.

Analyze the ACTUAL face and hair visible in the image carefully.

IMPORTANT:
- Do NOT give generic answers. Analyze what is actually visible.
- Do NOT exaggerate. Do NOT diagnose disease. This is screening only.
- If something looks normal/clear, say so.

--- SKIN ANALYSIS ---
Only mention acne, pigmentation, dark circles, redness, dryness, oiliness, texture, marks, uneven tone IF visible.
Skin problem_areas allowed values: "forehead", "under_eye", "left_cheek", "right_cheek", "chin"
If no major skin concern, return problem_areas as [].

--- HAIR ANALYSIS ---
Analyze what is visible: hair loss/thinning, receding hairline, dandruff/flaky scalp, hair texture (dry/oily/frizzy/damaged/healthy), density.
Hair problem_areas allowed values: "hairline", "scalp", "hair_overall"
Only include a hair area if a visible concern actually appears there.
If hair looks healthy, return hair problem_areas as [].

Return ONLY valid JSON in this exact structure (no extra text):
{
  "main_issue": "",
  "severity": "",
  "confidence": 0,
  "skin_tone": "",
  "summary": "",
  "tips": [],
  "chat": "",
  "problem_areas": [],
  "hair": {
    "main_issue": "",
    "severity": "",
    "confidence": 0,
    "hair_type": "",
    "summary": "",
    "tips": [],
    "problem_areas": []
  }
}

Field guidance:
- main_issue (skin): e.g. "Mild Acne", "No major visible concern"
- severity: "Low", "Mild", "Moderate", or "Needs dermatologist review"
- confidence: 40-90 based on image clarity
- skin_tone: describe visible texture/tone (not ethnicity)
- summary: 1-2 sentences specific to the image
- tips: exactly 3 short safe tips
- chat: 2 sentences — safe suggestion then recommend Vibes doctors
- hair.main_issue: e.g. "Mild Hair Thinning", "Healthy Hair"
- hair.hair_type: e.g. "Oily, straight, medium density"
- hair.summary: 1-2 sentences specific to what is visible
- hair.tips: exactly 3 short safe hair care tips
"""

def _dummy_result():
    return {
        "main_issue": "Analysis Unavailable",
        "severity": "Fallback",
        "confidence": 0,
        "skin_tone": "Could not determine",
        "summary": "OpenAI analysis did not complete. Please check your API key.",
        "tips": ["Use a gentle cleanser twice daily.", "Apply sunscreen daily.", "Avoid harsh scrubs."],
        "chat": "OpenAI analysis failed. For proper treatment, Vibes has experienced doctors and good offers.",
        "problem_areas": [],
        "hair": {
            "main_issue": "Analysis Unavailable",
            "severity": "Fallback",
            "confidence": 0,
            "hair_type": "Could not determine",
            "summary": "Hair analysis did not complete.",
            "tips": ["Use a mild sulfate-free shampoo.", "Apply hair oil 1-2 times a week.", "Avoid excessive heat styling."],
            "problem_areas": [],
        },
    }


def analyze_with_openai(image_path):
    print(f"\n[AI] key={bool(OPENAI_API_KEY)} | file={image_path}")
    if not client:
        return _dummy_result()

    img_hash = _image_hash(image_path)
    cache    = _load_cache()
    if img_hash in cache:
        print(f"[Cache] HIT {img_hash[:10]}…")
        return cache[img_hash]

    try:
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode("utf-8")

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You are a safe visual skin and hair screening assistant. Return only valid JSON."},
                {"role": "user", "content": [
                    {"type": "text", "text": ANALYSIS_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "high"}},
                ]},
            ],
            max_tokens=800,
            temperature=0.45,
        )

        text  = response.choices[0].message.content.strip()
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start == -1 or end <= 0:
            return _dummy_result()

        data = json.loads(text[start:end])

        for key in ["main_issue", "severity", "confidence", "skin_tone", "summary", "tips", "chat", "problem_areas"]:
            if key not in data:
                return _dummy_result()

        data["tips"] = (data["tips"] if isinstance(data["tips"], list) else _dummy_result()["tips"])[:3]
        skin_allowed = {"forehead", "under_eye", "left_cheek", "right_cheek", "chin"}
        data["problem_areas"] = [a for a in data.get("problem_areas", []) if a in skin_allowed]

        hair          = data.get("hair", {})
        hair_defaults = _dummy_result()["hair"]
        if not isinstance(hair, dict):
            hair = {}
        for key in ["main_issue", "severity", "confidence", "hair_type", "summary", "tips", "problem_areas"]:
            if key not in hair:
                hair[key] = hair_defaults[key]
        hair["tips"] = (hair["tips"] if isinstance(hair["tips"], list) else hair_defaults["tips"])[:3]
        hair_allowed = {"hairline", "scalp", "hair_overall"}
        hair["problem_areas"] = [a for a in hair.get("problem_areas", []) if a in hair_allowed]
        data["hair"] = hair

        cache[img_hash] = data
        _save_cache(cache)
        return data

    except Exception as e:
        print(f"[AI] ERROR: {repr(e)}")
        return _dummy_result()


# ─────────────────── DOCTORS ───────────────────

def get_doctors():
    return [
        {"name": "Dr. Aditi Sharma", "type": "Dermatologist",         "rating": "4.9", "experience": "9 Years",  "location": "Jaipur", "fee": "₹500"},
        {"name": "Dr. Neha Kapoor",  "type": "Cosmetic Dermatologist", "rating": "4.8", "experience": "11 Years", "location": "Delhi",  "fee": "₹800"},
        {"name": "Dr. Rohan Mehta",  "type": "Skin & Hair Specialist", "rating": "4.7", "experience": "12 Years", "location": "Mumbai", "fee": "₹700"},
    ]


# ─────────────────── ROUTES ───────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "openai": bool(OPENAI_API_KEY)}


@app.post("/api/analyze")
async def analyze(
    face_images:    Optional[UploadFile] = File(None),
    camera_image_1: Optional[str] = Form(None),
    camera_image_2: Optional[str] = Form(None),
    camera_image_3: Optional[str] = Form(None),
):
    filename: Optional[str] = None
    scanned_files: list[str] = []

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

    face_found, face_coords = create_detection_image(save_path, detected_path)
    if not face_found:
        raise HTTPException(status_code=422, detail="Face not detected. Please use a clear front-facing selfie.")

    result       = analyze_with_openai(save_path)
    face_regions = extract_all_face_regions(save_path, face_coords, name, result.get("problem_areas", []))
    hair_regions = extract_hair_regions(save_path, face_coords, name, result.get("hair", {}).get("problem_areas", []))

    return {
        "result":         result,
        "image_file":     filename,
        "scanned_files":  scanned_files or [filename, filename, filename],
        "detected_file":  detected_filename,
        "face_regions":   face_regions,
        "hair_regions":   hair_regions,
        "image_enhanced": image_enhanced,
        "doctors":        get_doctors(),
    }


class ChatRequest(BaseModel):
    message: str


class LeadRequest(BaseModel):
    name: str
    phone: str
    email: str
    gender: str
    data: dict[str, Any]


@app.post("/api/submit-lead")
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


@app.post("/api/report-pdf")
def report_pdf(body: LeadRequest):
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", body.name.strip() or "vibes_scan").strip("_")
    pdf = _generate_pdf_report(body)
    headers = {"Content-Disposition": f'attachment; filename="{name}_Vibes_DermaScan_Report.pdf"'}
    return StreamingResponse(pdf, media_type="application/pdf", headers=headers)


@app.post("/api/chat")
def chat(body: ChatRequest):
    user_message = body.message.strip()
    if not user_message:
        return {"reply": "Please type your question."}

    fallback = "Use gentle skincare and a mild shampoo for now. Vibes has experienced doctors and great offers."

    if not client:
        return {"reply": fallback}

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": (
                    "You are a friendly skin and hair clinic assistant for Vibes. "
                    "Reply in maximum 3 short lines. Give 1-2 safe general suggestions only. "
                    "Never diagnose or suggest prescription medicines. "
                    "Always end by mentioning Vibes has experienced doctors and good offers."
                )},
                {"role": "user", "content": user_message},
            ],
            max_tokens=120,
            temperature=0.4,
        )
        reply = response.choices[0].message.content.strip()
        return {"reply": reply or fallback}
    except Exception as e:
        print(f"[Chat] ERROR: {repr(e)}")
        return {"reply": fallback}
