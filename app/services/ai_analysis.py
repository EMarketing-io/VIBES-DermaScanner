import os
import base64
import json
from openai import OpenAI
from flask import current_app


def _dummy_result():
    return {
        "main_issue": "Analysis Unavailable",
        "severity": "Fallback",
        "confidence": 0,
        "skin_tone": "OpenAI did not return analysis",
        "summary": "OpenAI image analysis did not complete. Please check API key, billing, internet, or model access.",
        "tips": [
            "Use a gentle cleanser twice daily.",
            "Apply sunscreen daily.",
            "Avoid harsh scrubs."
        ],
        "chat": "OpenAI analysis failed. For proper treatment, Vibes has experienced doctors and good offers.",
        "problem_areas": [],
        "hair": {
            "main_issue": "Analysis Unavailable",
            "severity": "Fallback",
            "confidence": 0,
            "hair_type": "Could not determine",
            "summary": "Hair analysis did not complete.",
            "tips": [
                "Use a mild sulfate-free shampoo.",
                "Apply hair oil 1-2 times a week.",
                "Avoid excessive heat styling."
            ],
            "problem_areas": []
        }
    }


def _image_to_base64(image_path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


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
Analyze what is visible: hair loss/thinning, receding hairline, dandruff/flaky scalp, hair texture (dry/oily/frizzy/damaged/healthy), density (thin/medium/thick), breakage or split ends.
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
- main_issue (skin): short label e.g. "Mild Acne", "No major visible concern"
- severity: "Low", "Mild", "Moderate", or "Needs dermatologist review"
- confidence: 40–90 based on image clarity
- skin_tone: describe visible texture/tone (not ethnicity)
- summary (skin): 1-2 sentences specific to the image
- tips (skin): exactly 3 short safe tips
- chat: 2 sentences — first a safe suggestion, then recommend Vibes doctors
- hair.main_issue: short label e.g. "Mild Hair Thinning", "Healthy Hair"
- hair.hair_type: e.g. "Oily, straight, medium density" or "Dry, wavy, thin"
- hair.summary: 1-2 sentences specific to what is visible
- hair.tips: exactly 3 short safe hair care tips
"""


def analyze_with_openai(image_path):
    api_key = (current_app.config["OPENAI_API_KEY"] or "").strip()
    model = current_app.config["OPENAI_MODEL"]

    print(f"\n[OpenAI] key loaded: {bool(api_key)} | image: {image_path} | exists: {os.path.exists(image_path)}")

    if not api_key:
        print("[OpenAI] No API key — returning fallback")
        return _dummy_result()

    client = OpenAI(api_key=api_key)

    try:
        image_base64 = _image_to_base64(image_path)

        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a safe visual skin and hair screening assistant. Return only valid JSON."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": ANALYSIS_PROMPT},
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
            max_tokens=800,
            temperature=0.45
        )

        text = response.choices[0].message.content.strip()
        print(f"\n[OpenAI] raw response:\n{text}\n")

        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1 or end <= 0:
            print("[OpenAI] JSON parse failed — no braces found")
            return _dummy_result()

        data = json.loads(text[start:end])

        # Validate skin fields
        skin_required = ["main_issue", "severity", "confidence", "skin_tone", "summary", "tips", "chat", "problem_areas"]
        for key in skin_required:
            if key not in data:
                print(f"[OpenAI] Missing skin key: {key}")
                return _dummy_result()

        if not isinstance(data["tips"], list):
            data["tips"] = _dummy_result()["tips"]
        data["tips"] = data["tips"][:3]

        if not isinstance(data["problem_areas"], list):
            data["problem_areas"] = []
        skin_allowed = {"forehead", "under_eye", "left_cheek", "right_cheek", "chin"}
        data["problem_areas"] = [a for a in data["problem_areas"] if a in skin_allowed]

        # Validate / normalize hair section
        hair = data.get("hair", {})
        if not isinstance(hair, dict):
            hair = {}

        hair_defaults = _dummy_result()["hair"]
        for key in ["main_issue", "severity", "confidence", "hair_type", "summary", "tips", "problem_areas"]:
            if key not in hair:
                hair[key] = hair_defaults[key]

        if not isinstance(hair["tips"], list):
            hair["tips"] = hair_defaults["tips"]
        hair["tips"] = hair["tips"][:3]

        if not isinstance(hair["problem_areas"], list):
            hair["problem_areas"] = []
        hair_allowed = {"hairline", "scalp", "hair_overall"}
        hair["problem_areas"] = [a for a in hair["problem_areas"] if a in hair_allowed]

        data["hair"] = hair

        print(f"[OpenAI] skin areas: {data['problem_areas']} | hair areas: {hair['problem_areas']}")
        return data

    except Exception as e:
        print(f"[OpenAI] ERROR: {repr(e)}")
        current_app.logger.error(f"OpenAI analysis error: {repr(e)}")
        return _dummy_result()


def chat_with_openai(user_message):
    api_key = (current_app.config["OPENAI_API_KEY"] or "").strip()
    model = current_app.config["OPENAI_MODEL"]
    fallback = "Use gentle skincare and a mild shampoo for now. Vibes has experienced doctors and good offers."

    if not api_key:
        return fallback

    client = OpenAI(api_key=api_key)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a friendly skin and hair clinic assistant for Vibes. "
                        "Reply in maximum 3 short lines. Give 1-2 safe general suggestions only. "
                        "Never diagnose or suggest prescription medicines, steroids, or antibiotics. "
                        "Always end by mentioning Vibes has experienced doctors and good offers."
                    )
                },
                {"role": "user", "content": user_message}
            ],
            max_tokens=120,
            temperature=0.4
        )
        reply = response.choices[0].message.content.strip()
        return reply or fallback

    except Exception as e:
        print(f"[OpenAI chat] ERROR: {repr(e)}")
        return fallback


def get_doctors():
    return [
        {"name": "Dr. Aditi Sharma", "type": "Dermatologist", "rating": "4.9",
         "experience": "9 Years", "location": "Jaipur", "fee": "₹500"},
        {"name": "Dr. Neha Kapoor", "type": "Cosmetic Dermatologist", "rating": "4.8",
         "experience": "11 Years", "location": "Delhi", "fee": "₹800"},
        {"name": "Dr. Rohan Mehta", "type": "Skin & Hair Specialist", "rating": "4.7",
         "experience": "12 Years", "location": "Mumbai", "fee": "₹700"}
    ]
