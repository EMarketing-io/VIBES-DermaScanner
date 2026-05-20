from __future__ import annotations

import base64
import hashlib
import json
from typing import Any, Optional

from config import OPENAI_API_KEY, OPENAI_CLIENT as client, OPENAI_MODEL
from services.cache import _image_hash, _load_cache, _save_cache


ANALYSIS_PROMPT = """
You are an AI skin analysis system used in a premium dermatology clinic called Vibes.

Analyze the ACTUAL face visible in the image carefully.

IMPORTANT:
- Do NOT give generic answers. Analyze what is actually visible.
- Do NOT exaggerate. Do NOT diagnose disease. This is screening only.
- If something looks normal/clear, say so.
- Higher scores are better. All parameter scores must be integers from 0 to 100.
- Factor the provided patient context into treatment and safety wording when relevant.

--- SKIN ANALYSIS ---
Only mention acne, pigmentation, dark circles, redness, dryness, oiliness, texture, marks, uneven tone IF visible.
Skin problem_areas allowed values: "forehead", "under_eye", "left_cheek", "right_cheek", "chin"
If no major skin concern, return problem_areas as [].

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
  "skin_score": 0,
  "skin_age": 0,
  "summary_quote": "",
  "parameters": {
    "pigmentation": 0,
    "fine_lines": 0,
    "texture": 0,
    "pores": 0,
    "acne": 0,
    "scars_marks": 0,
    "redness": 0,
    "dark_circles": 0,
    "puffiness": 0,
    "hydration": 0,
    "firmness": 0,
    "dullness": 0
  },
  "top_concerns": [
    {"name": "", "score": 0, "description": "", "severity": ""}
  ],
  "treatment_plan": [
    {"name": "", "details": "", "type": "PRIMARY"}
  ],
  "home_care": [
    {"emoji": "", "name": "", "instruction": ""}
  ],
  "concern_count": 0,
  "ai_insight": "",
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
- skin_score: overall visible skin score, 0-100, higher is better
- skin_age: estimated visible skin age as an integer
- skin_tone: describe visible texture/tone (not ethnicity)
- summary: 1-2 sentences specific to the image
- summary_quote: one concise sentence suitable as an italic report quote
- parameters: include all 12 required keys with integer scores
- top_concerns: exactly 3 lowest-scoring concerns sorted ascending by score
- treatment_plan: 2-4 VIBES clinic treatments; type must be PRIMARY or SUPPORTIVE
- home_care: exactly 4 items: SPF 50, Hyaluronic acid serum, Vitamin C 10%, Retinol 0.3%
- concern_count: number of parameters below 70
- ai_insight: one sentence for a heat-map caption
- tips: exactly 3 short safe tips
- chat: 2 sentences — safe suggestion then recommend Vibes doctors
- Keep the hair object for backwards compatibility. If hair is not clearly visible, return neutral healthy/fallback hair values.
"""

PARAMETER_KEYS = [
    "pigmentation", "fine_lines", "texture", "pores", "acne", "scars_marks",
    "redness", "dark_circles", "puffiness", "hydration", "firmness", "dullness",
]

PARAMETER_LABELS = {
    "pigmentation": "Pigmentation",
    "fine_lines": "Fine lines",
    "texture": "Texture",
    "pores": "Pores",
    "acne": "Acne",
    "scars_marks": "Scars/marks",
    "redness": "Redness",
    "dark_circles": "Dark circles",
    "puffiness": "Puffiness",
    "hydration": "Hydration",
    "firmness": "Firmness",
    "dullness": "Dullness",
}


def _clamp_score(value: Any, fallback: int) -> int:
    try:
        score = int(round(float(value)))
    except Exception:
        score = fallback
    return max(0, min(100, score))


def _severity_from_score(score: int) -> str:
    if score >= 85:
        return "EXCELLENT"
    if score >= 70:
        return "GOOD"
    if score >= 55:
        return "MILD"
    return "MODERATE"


def _patient_age(patient_info: Optional[dict[str, Any]]) -> int:
    if not patient_info:
        return 32
    return _clamp_score(patient_info.get("age"), 32)


def _default_parameters(base_score: int) -> dict[str, int]:
    offsets = [-8, -12, -5, -3, 10, -7, 2, -15, -4, 3, -6, -10]
    return {
        key: _clamp_score(base_score + offsets[index], max(45, min(88, base_score)))
        for index, key in enumerate(PARAMETER_KEYS)
    }


def _default_home_care(patient_info: Optional[dict[str, Any]] = None) -> list[dict[str, str]]:
    retinol_note = "Use at night 2-3 times weekly; avoid if pregnant or breastfeeding."
    if patient_info and patient_info.get("pregnant"):
        retinol_note = "Avoid during pregnancy or breastfeeding unless cleared by your dermatologist."
    return [
        {"emoji": "🛡️", "name": "SPF 50", "instruction": "Apply every morning and reapply every 2-3 hours when outdoors."},
        {"emoji": "💧", "name": "Hyaluronic acid serum", "instruction": "Use on damp skin before moisturiser for hydration support."},
        {"emoji": "🍊", "name": "Vitamin C 10%", "instruction": "Apply in the morning under sunscreen to support brightness."},
        {"emoji": "🌙", "name": "Retinol 0.3%", "instruction": retinol_note},
    ]


def _build_top_concerns(parameters: dict[str, int]) -> list[dict[str, Any]]:
    concerns = []
    for key, score in sorted(parameters.items(), key=lambda item: item[1])[:3]:
        label = PARAMETER_LABELS.get(key, key.replace("_", " ").title())
        concerns.append({
            "name": label,
            "score": score,
            "description": f"{label} scored {score}/100 and should be reviewed during your VIBES consultation.",
            "severity": _severity_from_score(score),
        })
    return concerns


def _default_treatment_plan(top_concerns: list[dict[str, Any]]) -> list[dict[str, str]]:
    primary = top_concerns[0]["name"] if top_concerns else "skin clarity"
    return [
        {
            "name": "VIBES Skin Clarity Protocol",
            "details": f"Targets {primary.lower()}, uneven tone and texture across 4-6 dermatologist-guided sessions.",
            "type": "PRIMARY",
        },
        {
            "name": "Hydration Barrier Support",
            "details": "Supportive treatment to improve visible dullness, hydration and skin comfort.",
            "type": "SUPPORTIVE",
        },
        {
            "name": "Targeted Brightening Review",
            "details": "Doctor-led review for pigmentation, dark circles and post-acne marks.",
            "type": "SUPPORTIVE",
        },
    ]


def _normalise_analysis(data: dict[str, Any], patient_info: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    defaults = _dummy_result(patient_info)
    data["analysis_source"] = "openai"

    for key in ["main_issue", "severity", "confidence", "skin_tone", "summary", "tips", "chat", "problem_areas"]:
        if key not in data:
            data[key] = defaults[key]

    data["confidence"] = _clamp_score(data.get("confidence"), defaults["confidence"])
    data["tips"] = (data["tips"] if isinstance(data.get("tips"), list) else defaults["tips"])[:3]
    skin_allowed = {"forehead", "under_eye", "left_cheek", "right_cheek", "chin"}
    data["problem_areas"] = [a for a in data.get("problem_areas", []) if a in skin_allowed]

    base_score = _clamp_score(data.get("skin_score"), data["confidence"] or 63)
    raw_parameters = data.get("parameters") if isinstance(data.get("parameters"), dict) else {}
    fallback_parameters = _default_parameters(base_score)
    parameters = {
        key: _clamp_score(raw_parameters.get(key), fallback_parameters[key])
        for key in PARAMETER_KEYS
    }
    data["parameters"] = parameters
    data["skin_score"] = _clamp_score(data.get("skin_score"), round(sum(parameters.values()) / len(parameters)))
    data["skin_age"] = _clamp_score(data.get("skin_age"), _patient_age(patient_info) + round((72 - data["skin_score"]) / 4))
    data["summary_quote"] = str(data.get("summary_quote") or defaults["summary_quote"])

    top_concerns = data.get("top_concerns")
    if not isinstance(top_concerns, list) or len(top_concerns) < 3:
        top_concerns = _build_top_concerns(parameters)
    cleaned_concerns = []
    for concern in top_concerns[:3]:
        if not isinstance(concern, dict):
            continue
        name = str(concern.get("name") or "Visible concern")
        score = _clamp_score(concern.get("score"), 60)
        cleaned_concerns.append({
            "name": name,
            "score": score,
            "description": str(concern.get("description") or f"{name} scored {score}/100 and should be reviewed in consultation."),
            "severity": str(concern.get("severity") or _severity_from_score(score)).upper(),
        })
    while len(cleaned_concerns) < 3:
        cleaned_concerns = _build_top_concerns(parameters)
    data["top_concerns"] = cleaned_concerns[:3]

    treatment_plan = data.get("treatment_plan")
    if not isinstance(treatment_plan, list) or not treatment_plan:
        treatment_plan = _default_treatment_plan(data["top_concerns"])
    data["treatment_plan"] = [
        {
            "name": str(item.get("name", "VIBES Treatment Review")),
            "details": str(item.get("details", "Doctor-curated treatment recommendation after in-clinic consultation.")),
            "type": str(item.get("type", "SUPPORTIVE")).upper() if str(item.get("type", "")).upper() in {"PRIMARY", "SUPPORTIVE"} else "SUPPORTIVE",
        }
        for item in treatment_plan[:4]
        if isinstance(item, dict)
    ] or _default_treatment_plan(data["top_concerns"])

    home_care = data.get("home_care")
    if not isinstance(home_care, list) or len(home_care) < 4:
        home_care = _default_home_care(patient_info)
    data["home_care"] = [
        {
            "emoji": str(item.get("emoji", "")),
            "name": str(item.get("name", "")),
            "instruction": str(item.get("instruction", "")),
        }
        for item in home_care[:4]
        if isinstance(item, dict)
    ] or _default_home_care(patient_info)

    data["concern_count"] = _clamp_score(data.get("concern_count"), sum(1 for score in parameters.values() if score < 70))
    data["ai_insight"] = str(
        data.get("ai_insight")
        or f"{data['concern_count']} areas requiring intervention detected across your facial zones. Markers indicate the approximate location of each concern; severity is colour-coded above."
    )

    hair = data.get("hair", {})
    hair_defaults = defaults["hair"]
    if not isinstance(hair, dict):
        hair = {}
    for key in ["main_issue", "severity", "confidence", "hair_type", "summary", "tips", "problem_areas"]:
        if key not in hair:
            hair[key] = hair_defaults[key]
    hair["confidence"] = _clamp_score(hair.get("confidence"), hair_defaults["confidence"])
    hair["tips"] = (hair["tips"] if isinstance(hair.get("tips"), list) else hair_defaults["tips"])[:3]
    hair_allowed = {"hairline", "scalp", "hair_overall"}
    hair["problem_areas"] = [a for a in hair.get("problem_areas", []) if a in hair_allowed]
    data["hair"] = hair
    return data


def _dummy_result(patient_info: Optional[dict[str, Any]] = None):
    base_score = 63
    parameters = _default_parameters(base_score)
    top_concerns = _build_top_concerns(parameters)
    return {
        "main_issue": "Analysis Unavailable",
        "severity": "Fallback",
        "confidence": 0,
        "skin_tone": "Could not determine",
        "summary": "OpenAI analysis did not complete. Please check your API key.",
        "tips": ["Use a gentle cleanser twice daily.", "Apply sunscreen daily.", "Avoid harsh scrubs."],
        "chat": "OpenAI analysis failed. For proper treatment, Vibes has experienced doctors and good offers.",
        "problem_areas": [],
        "analysis_source": "fallback",
        "analysis_error": "OpenAI analysis did not complete.",
        "skin_score": base_score,
        "skin_age": _patient_age(patient_info) + 2,
        "summary_quote": "Indicative analysis based on visible features. A few areas warrant attention - see the detailed breakdown below.",
        "parameters": parameters,
        "top_concerns": top_concerns,
        "treatment_plan": _default_treatment_plan(top_concerns),
        "home_care": _default_home_care(patient_info),
        "concern_count": sum(1 for score in parameters.values() if score < 70),
        "ai_insight": "Several areas requiring intervention were estimated from visible facial zones. Markers indicate approximate concern locations.",
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


def analyze_with_openai(image_path, patient_info: Optional[dict[str, Any]] = None):
    print(f"\n[AI] key={bool(OPENAI_API_KEY)} | file={image_path}")
    if not client:
        result = _dummy_result(patient_info)
        result["analysis_error"] = "OPENAI_API_KEY is not configured on the backend."
        return result

    img_hash = _image_hash(image_path)
    patient_hash = hashlib.md5(json.dumps(patient_info or {}, sort_keys=True).encode("utf-8")).hexdigest()[:10]
    cache_key = f"{img_hash}:{patient_hash}"
    cache    = _load_cache()
    if cache_key in cache:
        print(f"[Cache] HIT {cache_key[:21]}…")
        return _normalise_analysis(cache[cache_key], patient_info)

    try:
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode("utf-8")

        patient_context = json.dumps(patient_info or {}, ensure_ascii=False)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You are a safe visual skin and hair screening assistant. Return only valid JSON."},
                {"role": "user", "content": [
                    {"type": "text", "text": f"{ANALYSIS_PROMPT}\n\nPATIENT CONTEXT JSON:\n{patient_context}"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "high"}},
                ]},
            ],
            max_tokens=1800,
            temperature=0.45,
        )

        text  = response.choices[0].message.content.strip()
        start = text.find("{")
        end   = text.rfind("}") + 1
        if start == -1 or end <= 0:
            result = _dummy_result(patient_info)
            result["analysis_error"] = "OpenAI returned a response that was not valid JSON."
            return result

        data = json.loads(text[start:end])
        data = _normalise_analysis(data, patient_info)

        cache[cache_key] = data
        _save_cache(cache)
        return data

    except Exception as e:
        print(f"[AI] ERROR: {repr(e)}")
        result = _dummy_result(patient_info)
        result["analysis_error"] = f"OpenAI request failed: {str(e)}"
        return result
