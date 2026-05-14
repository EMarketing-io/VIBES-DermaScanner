import os
from flask import Blueprint, render_template, request, url_for, redirect, current_app
from werkzeug.exceptions import RequestEntityTooLarge

from app.services.image_processing import (
    save_uploaded_image, save_camera_image,
    resize_image_if_large, extract_problem_regions, extract_hair_regions
)
from app.services.face_detection import create_detection_image
from app.services.ai_analysis import analyze_with_openai, get_doctors

main_bp = Blueprint("main", __name__)


@main_bp.errorhandler(RequestEntityTooLarge)
def handle_large_file(error):
    return render_template("scan.html",
                           error="Image is too large. Please upload a smaller image or capture again."), 413


@main_bp.route("/")
def home():
    return render_template("home.html")


@main_bp.route("/scan")
def scan():
    return render_template("scan.html")


@main_bp.route("/analyze", methods=["GET"])
def analyze_get():
    return redirect("/scan")


@main_bp.route("/analyze", methods=["POST"])
def analyze():
    upload_folder = current_app.config["UPLOAD_FOLDER"]

    filename, error = save_uploaded_image(upload_folder)
    if error:
        return render_template("scan.html", error=error)

    if not filename:
        filename, error = save_camera_image(upload_folder)

    if error:
        return render_template("scan.html", error=error)

    if not filename:
        return render_template("scan.html", error="Please upload or capture a clear selfie.")

    save_path = os.path.join(upload_folder, filename)

    if not resize_image_if_large(save_path):
        return render_template("scan.html", error="Image could not be read. Please try another image.")

    name = os.path.splitext(filename)[0]
    detected_filename = f"detected_{name}.jpg"
    detected_path = os.path.join(upload_folder, detected_filename)

    face_found, face_coords = create_detection_image(save_path, detected_path)
    if not face_found:
        return render_template("scan.html",
                               error="Face not detected clearly. Please upload a clear front-facing selfie.")

    result = analyze_with_openai(save_path)

    skin_regions = extract_problem_regions(save_path, face_coords, name,
                                           result.get("problem_areas", []), upload_folder)

    hair_regions = extract_hair_regions(save_path, face_coords, name,
                                        result.get("hair", {}).get("problem_areas", []), upload_folder)

    return render_template(
        "result.html",
        result=result,
        image_url=url_for("static", filename=f"uploads/{filename}"),
        detected_url=url_for("static", filename=f"uploads/{detected_filename}"),
        regions=skin_regions,
        hair_regions=hair_regions,
        doctors=get_doctors()
    )
