import os
import random
import base64
import json
import cv2
import requests

from flask import Flask, render_template, request, url_for, redirect, jsonify
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from openai import OpenAI

app = Flask(__name__)

UPLOAD_FOLDER = "static/uploads"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

OPENAI_MODEL = "gpt-4.1-mini"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

print("OPENAI KEY FOUND:", bool(OPENAI_API_KEY))

client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3"

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.errorhandler(RequestEntityTooLarge)
def handle_large_file(error):
    return render_template(
        "scan.html",
        error="Image is too large. Please upload a smaller image or use camera capture again."
    ), 413


def analyze_skin_dummy():
    return {
        "main_issue": "OPENAI FAILED - FALLBACK RESULT",
        "severity": "Fallback",
        "confidence": 0,
        "skin_tone": "OpenAI did not return analysis",
        "summary": "OpenAI image analysis did not complete. Please check API key, billing, internet, model access, or terminal logs.",
        "tips": [
            "Use a gentle cleanser twice daily.",
            "Apply sunscreen daily.",
            "Avoid harsh scrubs."
        ],
        "chat": "OpenAI analysis failed, so this is a fallback result. For proper treatment, Vibes has experienced doctors and good offers.",
        "problem_areas": []
    }


def image_to_base64(image_path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def analyze_skin_with_openai(image_path):
    print("\n========== OPENAI FUNCTION START ==========")
    print("Image path:", image_path)
    print("File exists:", os.path.exists(image_path))
    print("OpenAI client ready:", client is not None)

    if client is None:
        print("OpenAI client missing. Check OPENAI_API_KEY.")
        return analyze_skin_dummy()

    try:
        image_base64 = image_to_base64(image_path)

        prompt = """
You are an AI skin analysis system used in a premium dermatology clinic called Vibes.

Analyze the ACTUAL face image carefully.

IMPORTANT:
- Do NOT give the same generic answer for every face.
- If skin looks mostly normal/clear, say "No major visible concern".
- Only mention acne, pigmentation, dark circles, redness, dryness, oiliness, texture, marks, uneven tone IF visible.
- Do NOT exaggerate.
- Do NOT diagnose disease.
- This is screening only.

You must also return exact problem_areas where the visible concern appears.

Allowed problem_areas values:
- "forehead"
- "under_eye"
- "left_cheek"
- "right_cheek"
- "chin"

Rules for problem_areas:
- If no major visible concern, return []
- If acne/marks/pigmentation/uneven tone are visible on cheeks, return left_cheek and/or right_cheek
- If dark circles/tiredness visible, return under_eye
- If forehead texture/oiliness/marks visible, return forehead
- If chin acne/marks visible, return chin
- Only return areas where a visible concern actually appears

Return ONLY valid JSON in this exact structure:
{
  "main_issue": "",
  "severity": "",
  "confidence": 0,
  "skin_tone": "",
  "summary": "",
  "tips": [],
  "chat": "",
  "problem_areas": []
}

Field guidance:
- main_issue: short and specific
- severity: "Low", "Mild", "Moderate", or "Needs dermatologist review"
- confidence: 40 to 90 based on image clarity
- skin_tone: describe visible texture/tone, not ethnicity
- summary: 1-2 sentences, specific to the image
- tips: only 3 short safe tips
- chat: 2 short sentences. First give a normal suggestion, then recommend Vibes doctors and mention offers.
"""

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a safe visual skin screening assistant. Return only valid JSON."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=600,
            temperature=0.45
        )

        text = response.choices[0].message.content.strip()

        print("\n========== OPENAI RAW RESULT ==========")
        print(text)
        print("======================================\n")

        start = text.find("{")
        end = text.rfind("}") + 1

        if start == -1 or end <= 0:
            print("OpenAI JSON parse failed.")
            return analyze_skin_dummy()

        data = json.loads(text[start:end])

        required = [
            "main_issue",
            "severity",
            "confidence",
            "skin_tone",
            "summary",
            "tips",
            "chat",
            "problem_areas"
        ]

        for key in required:
            if key not in data:
                print("Missing key from OpenAI JSON:", key)
                return analyze_skin_dummy()

        if not isinstance(data["tips"], list):
            data["tips"] = analyze_skin_dummy()["tips"]

        data["tips"] = data["tips"][:3]

        if not isinstance(data["problem_areas"], list):
            data["problem_areas"] = []

        allowed = {"forehead", "under_eye", "left_cheek", "right_cheek", "chin"}
        data["problem_areas"] = [
            area for area in data["problem_areas"]
            if area in allowed
        ]

        print("OpenAI analysis success.")
        print("OPENAI PROBLEM AREAS:", data["problem_areas"])
        print("========== OPENAI FUNCTION END ==========\n")

        return data

    except Exception as e:
        print("OpenAI image analysis error:", repr(e))
        return analyze_skin_dummy()


def resize_image_if_large(image_path, max_width=900):
    image = cv2.imread(image_path)

    if image is None:
        return False

    h, w = image.shape[:2]

    if w > max_width:
        ratio = max_width / w
        new_height = int(h * ratio)
        image = cv2.resize(image, (max_width, new_height), interpolation=cv2.INTER_AREA)

    cv2.imwrite(image_path, image, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return True


def safe_crop(image, x1, y1, x2, y2):
    h, w = image.shape[:2]

    x1 = max(0, min(x1, w - 1))
    x2 = max(0, min(x2, w))
    y1 = max(0, min(y1, h - 1))
    y2 = max(0, min(y2, h))

    if x2 <= x1 or y2 <= y1:
        return None

    return image[y1:y2, x1:x2]


def extract_problem_regions_from_openai(image_path, face_coords, output_prefix, problem_areas):
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
            "box": (
                x + int(w * 0.20),
                y + int(h * 0.05),
                x + int(w * 0.80),
                y + int(h * 0.27)
            )
        },
        "under_eye": {
            "title": "Under Eye Area",
            "concern": "AI detected possible visible concern",
            "box": (
                x + int(w * 0.15),
                y + int(h * 0.27),
                x + int(w * 0.85),
                y + int(h * 0.45)
            )
        },
        "left_cheek": {
            "title": "Left Cheek",
            "concern": "AI detected possible visible concern",
            "box": (
                x + int(w * 0.03),
                y + int(h * 0.40),
                x + int(w * 0.45),
                y + int(h * 0.76)
            )
        },
        "right_cheek": {
            "title": "Right Cheek",
            "concern": "AI detected possible visible concern",
            "box": (
                x + int(w * 0.55),
                y + int(h * 0.40),
                x + int(w * 0.97),
                y + int(h * 0.76)
            )
        },
        "chin": {
            "title": "Chin Area",
            "concern": "AI detected possible visible concern",
            "box": (
                x + int(w * 0.25),
                y + int(h * 0.68),
                x + int(w * 0.75),
                y + int(h * 0.95)
            )
        }
    }

    saved_regions = []

    for area in problem_areas:
        if area not in region_definitions:
            continue

        region = region_definitions[area]
        x1, y1, x2, y2 = region["box"]

        crop = safe_crop(image, x1, y1, x2, y2)

        if crop is None or crop.size == 0:
            continue

        crop = cv2.resize(crop, (420, 300), interpolation=cv2.INTER_CUBIC)

        filename = f"{output_prefix}_{area}.jpg"
        path = os.path.join(UPLOAD_FOLDER, filename)

        cv2.imwrite(path, crop, [cv2.IMWRITE_JPEG_QUALITY, 92])

        saved_regions.append({
            "title": region["title"],
            "concern": region["concern"],
            "file": filename
        })

    return saved_regions


def create_3d_detection_image(image_path, output_path):
    image = cv2.imread(image_path)

    if image is None:
        return False, None

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.2, 6)

    if len(faces) == 0:
        return False, None

    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    main_face = faces[0]

    overlay = image.copy()

    for (x, y, w, h) in [main_face]:
        cx = x + w // 2
        cy = y + h // 2

        cv2.rectangle(overlay, (x, y), (x + w, y + h), (255, 185, 45), 2)

        for scale in [0.35, 0.48, 0.62]:
            cv2.ellipse(
                overlay,
                (cx, cy),
                (int(w * scale), int(h * scale)),
                0,
                0,
                360,
                (255, 185, 45),
                1,
                cv2.LINE_AA
            )

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


def get_doctors():
    return [
        {
            "name": "Dr. Aditi Sharma",
            "type": "Dermatologist",
            "rating": "4.9",
            "experience": "9 Years",
            "location": "Jaipur",
            "fee": "₹500"
        },
        {
            "name": "Dr. Neha Kapoor",
            "type": "Cosmetic Dermatologist",
            "rating": "4.8",
            "experience": "11 Years",
            "location": "Delhi",
            "fee": "₹800"
        },
        {
            "name": "Dr. Rohan Mehta",
            "type": "Skin & Hair Specialist",
            "rating": "4.7",
            "experience": "12 Years",
            "location": "Mumbai",
            "fee": "₹700"
        }
    ]


def save_uploaded_image():
    uploaded_files = request.files.getlist("face_images")

    for file in uploaded_files:
        if file and file.filename:
            if not allowed_file(file.filename):
                return None, "Only JPG, JPEG, PNG and WEBP images are allowed."

            original_filename = secure_filename(file.filename)
            name, ext = os.path.splitext(original_filename)

            filename = f"{name}_{random.randint(10000, 99999)}.jpg"
            save_path = os.path.join(UPLOAD_FOLDER, filename)

            file.save(save_path)

            return filename, None

    return None, None


def save_camera_image():
    camera_images = [
        request.form.get("camera_image_1"),
        request.form.get("camera_image_2"),
        request.form.get("camera_image_3")
    ]

    for camera_image in camera_images:
        if camera_image and camera_image.strip():
            try:
                image_data = camera_image.split(",", 1)[1] if "," in camera_image else camera_image

                filename = f"camera_{random.randint(10000, 99999)}.jpg"
                save_path = os.path.join(UPLOAD_FOLDER, filename)

                with open(save_path, "wb") as f:
                    f.write(base64.b64decode(image_data))

                return filename, None

            except Exception:
                return None, "Camera image could not be processed. Please capture again."

    return None, None


@app.route("/")
def home():
    return render_template("home.html")


@app.route("/scan")
def scan():
    return render_template("scan.html")


@app.route("/analyze", methods=["GET"])
def analyze_get():
    return redirect("/scan")


@app.route("/analyze", methods=["POST"])
def analyze():
    filename, error = save_uploaded_image()

    if error:
        return render_template("scan.html", error=error)

    if not filename:
        filename, error = save_camera_image()

    if error:
        return render_template("scan.html", error=error)

    if not filename:
        return render_template(
            "scan.html",
            error="Please upload or capture a clear selfie."
        )

    save_path = os.path.join(UPLOAD_FOLDER, filename)

    if not resize_image_if_large(save_path):
        return render_template(
            "scan.html",
            error="Image could not be read. Please try another image."
        )

    name, ext = os.path.splitext(filename)

    detected_filename = f"detected_{name}.jpg"
    detected_path = os.path.join(UPLOAD_FOLDER, detected_filename)

    face_found, face_coords = create_3d_detection_image(save_path, detected_path)

    if not face_found:
        return render_template(
            "scan.html",
            error="Face not detected clearly. Please upload or capture a clear front-facing selfie."
        )

    print("\nCALLING OPENAI ANALYSIS...")
    result = analyze_skin_with_openai(save_path)

    problem_areas = result.get("problem_areas", [])
    print("OPENAI PROBLEM AREAS:", problem_areas)

    regions = extract_problem_regions_from_openai(
        save_path,
        face_coords,
        name,
        problem_areas
    )

    return render_template(
        "result.html",
        result=result,
        image_url=url_for("static", filename=f"uploads/{filename}"),
        detected_url=url_for("static", filename=f"uploads/{detected_filename}"),
        regions=regions,
        doctors=get_doctors()
    )


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"reply": "Please type your question."})

    prompt = f"""
You are a friendly skin clinic assistant for Vibes.

Reply rules:
- Keep answer very short: maximum 3 lines.
- Give 1-2 normal safe solutions only.
- Do not give confirmed diagnosis.
- Do not suggest prescription medicines, steroids, antibiotics, or strong creams.
- End by saying Vibes has experienced doctors, treatment options, and good offers.

User question: {user_message}
"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.4,
                    "num_predict": 90
                }
            },
            timeout=25
        )

        if response.status_code != 200:
            return jsonify({
                "reply": "Use gentle skincare and sunscreen for now. For proper treatment, Vibes has experienced doctors and good offers."
            })

        result = response.json()
        reply = result.get("response", "").strip()

        if not reply:
            reply = "Use gentle skincare and sunscreen for now. For proper treatment, Vibes has experienced doctors and good offers."

        return jsonify({"reply": reply})

    except Exception:
        return jsonify({
            "reply": "Use gentle skincare and sunscreen for now. For proper treatment, Vibes has experienced doctors and good offers."
        })


if __name__ == "__main__":
    app.run(debug=True)