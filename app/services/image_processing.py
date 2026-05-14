import os
import random
import base64
import cv2
from werkzeug.utils import secure_filename
from flask import request, current_app


def allowed_file(filename):
    exts = current_app.config["ALLOWED_EXTENSIONS"]
    return "." in filename and filename.rsplit(".", 1)[1].lower() in exts


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


def safe_crop(image, x1, y1, x2, y2):
    h, w = image.shape[:2]
    x1, x2 = max(0, min(x1, w - 1)), max(0, min(x2, w))
    y1, y2 = max(0, min(y1, h - 1)), max(0, min(y2, h))
    if x2 <= x1 or y2 <= y1:
        return None
    return image[y1:y2, x1:x2]


def save_uploaded_image(upload_folder):
    for file in request.files.getlist("face_images"):
        if file and file.filename:
            if not allowed_file(file.filename):
                return None, "Only JPG, JPEG, PNG and WEBP images are allowed."
            name, _ = os.path.splitext(secure_filename(file.filename))
            filename = f"{name}_{random.randint(10000, 99999)}.jpg"
            save_path = os.path.join(upload_folder, filename)
            file.save(save_path)
            return filename, None
    return None, None


def save_camera_image(upload_folder):
    for key in ["camera_image_1", "camera_image_2", "camera_image_3"]:
        camera_image = request.form.get(key)
        if camera_image and camera_image.strip():
            try:
                image_data = camera_image.split(",", 1)[1] if "," in camera_image else camera_image
                filename = f"camera_{random.randint(10000, 99999)}.jpg"
                save_path = os.path.join(upload_folder, filename)
                with open(save_path, "wb") as f:
                    f.write(base64.b64decode(image_data))
                return filename, None
            except Exception:
                return None, "Camera image could not be processed. Please capture again."
    return None, None


def extract_problem_regions(image_path, face_coords, output_prefix, problem_areas, upload_folder):
    if not problem_areas:
        return []

    image = cv2.imread(image_path)
    if image is None:
        return []

    x, y, w, h = face_coords

    region_definitions = {
        "forehead": {
            "title": "Forehead Area",
            "concern": "AI detected possible visible concern",
            "box": (x + int(w * 0.20), y + int(h * 0.05), x + int(w * 0.80), y + int(h * 0.27))
        },
        "under_eye": {
            "title": "Under Eye Area",
            "concern": "AI detected possible visible concern",
            "box": (x + int(w * 0.15), y + int(h * 0.27), x + int(w * 0.85), y + int(h * 0.45))
        },
        "left_cheek": {
            "title": "Left Cheek",
            "concern": "AI detected possible visible concern",
            "box": (x + int(w * 0.03), y + int(h * 0.40), x + int(w * 0.45), y + int(h * 0.76))
        },
        "right_cheek": {
            "title": "Right Cheek",
            "concern": "AI detected possible visible concern",
            "box": (x + int(w * 0.55), y + int(h * 0.40), x + int(w * 0.97), y + int(h * 0.76))
        },
        "chin": {
            "title": "Chin Area",
            "concern": "AI detected possible visible concern",
            "box": (x + int(w * 0.25), y + int(h * 0.68), x + int(w * 0.75), y + int(h * 0.95))
        }
    }

    saved = []
    for area in problem_areas:
        if area not in region_definitions:
            continue
        region = region_definitions[area]
        crop = safe_crop(image, *region["box"])
        if crop is None or crop.size == 0:
            continue
        crop = cv2.resize(crop, (420, 300), interpolation=cv2.INTER_CUBIC)
        filename = f"{output_prefix}_{area}.jpg"
        cv2.imwrite(os.path.join(upload_folder, filename), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        saved.append({"title": region["title"], "concern": region["concern"], "file": filename})

    return saved


def extract_hair_regions(image_path, face_coords, output_prefix, problem_areas, upload_folder):
    if not problem_areas:
        return []

    image = cv2.imread(image_path)
    if image is None:
        return []

    x, y, w, h = face_coords

    region_definitions = {
        "hairline": {
            "title": "Hairline",
            "concern": "AI detected possible visible concern",
            "box": (x + int(w * 0.05), y - int(h * 0.22), x + int(w * 0.95), y + int(h * 0.10))
        },
        "scalp": {
            "title": "Scalp / Top",
            "concern": "AI detected possible visible concern",
            "box": (x + int(w * 0.10), y - int(h * 0.55), x + int(w * 0.90), y - int(h * 0.05))
        },
        "hair_overall": {
            "title": "Hair Texture & Density",
            "concern": "AI detected possible visible concern",
            "box": (x - int(w * 0.30), y - int(h * 0.60), x + int(w * 1.30), y + int(h * 0.25))
        }
    }

    saved = []
    for area in problem_areas:
        if area not in region_definitions:
            continue
        region = region_definitions[area]
        crop = safe_crop(image, *region["box"])
        if crop is None or crop.size == 0:
            continue
        crop = cv2.resize(crop, (420, 300), interpolation=cv2.INTER_CUBIC)
        filename = f"{output_prefix}_hair_{area}.jpg"
        cv2.imwrite(os.path.join(upload_folder, filename), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        saved.append({"title": region["title"], "concern": region["concern"], "file": filename})

    return saved
