from __future__ import annotations

from fastapi import APIRouter

from config import OPENAI_CLIENT as client, OPENAI_MODEL
from schemas import ChatRequest

router = APIRouter(prefix="/api")


@router.post("/chat")
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
