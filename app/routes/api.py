from flask import Blueprint, request, jsonify
from app.services.ai_analysis import chat_with_openai

api_bp = Blueprint("api", __name__)


@api_bp.route("/chat", methods=["POST"])
def chat():
    data = request.get_json() or {}
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"reply": "Please type your question."})

    reply = chat_with_openai(user_message)
    return jsonify({"reply": reply})
