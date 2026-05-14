import random
import cv2

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def create_detection_image(image_path, output_path):
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
