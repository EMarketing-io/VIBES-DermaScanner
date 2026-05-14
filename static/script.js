let video = document.getElementById("video");
let canvas = document.getElementById("canvas");

let captureCount = 0;
let maxCaptures = 3;
let cameraStream = null;

async function startCamera() {
    try {
        video = document.getElementById("video");
        canvas = document.getElementById("canvas");

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 900 },
                height: { ideal: 900 },
                facingMode: "user"
            },
            audio: false
        });

        video.srcObject = cameraStream;
        await video.play();

        let scanner = document.querySelector(".square-face-scanner");
        if (scanner) {
            scanner.classList.add("camera-on");
        }

        updateCaptureStatus();

    } catch (error) {
        console.error(error);
        alert("Camera permission denied or camera not found.");
    }
}

function captureImage() {
    if (!video || !video.srcObject) {
        alert("Please start camera first.");
        return;
    }

    if (captureCount >= maxCaptures) {
        alert("You already captured 3 images. Now click Analyze Capture.");
        return;
    }

    canvas.width = video.videoWidth || 900;
    canvas.height = video.videoHeight || 900;

    let ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let imageData = canvas.toDataURL("image/jpeg", 0.8);

    captureCount++;

    let cameraInput = document.getElementById("camera_image_" + captureCount);

    if (cameraInput) {
        cameraInput.value = imageData;
    }

    updateCaptureStatus();

    alert("Image " + captureCount + " captured successfully.");
}

function updateCaptureStatus() {
    let status = document.querySelector(".scanner-status");

    if (status) {
        if (captureCount === 0) {
            status.innerHTML = `<span></span> AI Face Scanner Ready`;
        } else {
            status.innerHTML = `<span></span> ${captureCount}/3 Images Captured`;
        }
    }
}

/* CHATBOT */
async function sendChat() {
    let input = document.getElementById("chatInput");
    let messages = document.getElementById("chatMessages");

    if (!input || !messages) return;

    let text = input.value.trim();

    if (!text) {
        alert("Please type your question.");
        return;
    }

    messages.innerHTML += `<div class="user-msg">${text}</div>`;
    input.value = "";

    messages.innerHTML += `<div class="bot-msg loading" id="loadingMsg">Thinking...</div>`;
    messages.scrollTop = messages.scrollHeight;

    try {
        let res = await fetch("/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message: text })
        });

        let data = await res.json();

        let loading = document.getElementById("loadingMsg");
        if (loading) loading.remove();

        messages.innerHTML += `<div class="bot-msg">${data.reply}</div>`;
        messages.scrollTop = messages.scrollHeight;

    } catch (error) {
        let loading = document.getElementById("loadingMsg");
        if (loading) loading.remove();

        messages.innerHTML += `<div class="bot-msg">Chatbot is not connected. Please make sure Ollama is running.</div>`;
        messages.scrollTop = messages.scrollHeight;
    }
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        let input = document.getElementById("chatInput");

        if (document.activeElement === input) {
            e.preventDefault();
            sendChat();
        }
    }
});

document.addEventListener("DOMContentLoaded", function () {
    updateCaptureStatus();
});