from __future__ import annotations

import os
import random

import cv2
import numpy as np
from PIL import Image, ImageEnhance

from config import UPLOAD_FOLDER

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


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
        return False, None, 0
    gray  = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.2, 6)
    if len(faces) == 0:
        return False, None, 0

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
    return True, main_face, len(faces)


def create_face_crop_image(image_path, face_coords, output_path):
    image = cv2.imread(image_path)
    if image is None or face_coords is None:
        return False

    x, y, w, h = face_coords
    pad_x = int(w * 0.72)
    pad_top = int(h * 0.62)
    pad_bottom = int(h * 0.82)
    crop = safe_crop(image, x - pad_x, y - pad_top, x + w + pad_x, y + h + pad_bottom)
    if crop is None or crop.size == 0:
        return False

    crop = cv2.resize(crop, (900, 1100), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(output_path, crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return True


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
