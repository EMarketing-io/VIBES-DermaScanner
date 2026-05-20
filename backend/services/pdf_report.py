from __future__ import annotations

import os
from io import BytesIO
from typing import Any, Optional

from PIL import Image, ImageDraw, ImageFont

from config import UPLOAD_FOLDER
from schemas import LeadRequest


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
