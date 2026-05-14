/* ===================== CAMERA & GUIDED CAPTURE ===================== */

const ANGLE_STEPS = [
    {
        label: "Look Straight",
        instruction: "Face the camera directly — keep your face centred",
        arrow: ""
    },
    {
        label: "Turn Left",
        instruction: "Slowly turn your head to the LEFT and hold",
        arrow: "←"
    },
    {
        label: "Turn Right",
        instruction: "Slowly turn your head to the RIGHT and hold",
        arrow: "→"
    }
];

let captureCount = 0;
let cameraStream  = null;

async function startCamera() {
    const video = document.getElementById("video");
    if (!video) return;

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 1280 }, facingMode: "user" },
            audio: false
        });

        video.srcObject = cameraStream;
        await video.play();

        document.querySelector(".square-scanner")?.classList.add("camera-on");
        updateAngleUI();

    } catch {
        setStatus("Camera blocked — please allow access");
        setInstruction("Grant camera permission then refresh the page.");
        document.getElementById("statusDot")?.classList.add("dot-error");
    }
}

function captureImage() {
    const video  = document.getElementById("video");
    const canvas = document.getElementById("canvas");

    if (!video?.srcObject) return;
    if (captureCount >= 3) return;

    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 1280;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    captureCount++;
    const input = document.getElementById(`camera_image_${captureCount}`);
    if (input) input.value = canvas.toDataURL("image/jpeg", 0.90);

    // Flash effect
    const flash = document.getElementById("captureFlash");
    if (flash) {
        flash.classList.add("flashing");
        setTimeout(() => flash.classList.remove("flashing"), 350);
    }

    // Mark step done
    document.getElementById(`step${captureCount}`)?.classList.add("done");

    if (captureCount < 3) {
        updateAngleUI();
    } else {
        // All 3 done
        setStatus("3/3 Shots Captured — Ready!");
        setInstruction("All angles captured. Click Analyze to get your results.");
        setArrow("✓");

        document.getElementById("captureBtn").style.display  = "none";
        document.getElementById("analyzeBtn").style.display  = "inline-flex";
        document.getElementById("retakeBtn").style.display   = "inline-flex";

        // Mark last step done
        document.getElementById("step3")?.classList.add("done");
    }
}

function updateAngleUI() {
    const step = ANGLE_STEPS[captureCount];    // captureCount is NEXT shot index (0-based)
    setStatus(`Shot ${captureCount + 1} of 3 — ${step.label}`);
    setInstruction(step.instruction);
    setArrow(step.arrow);

    const btn = document.getElementById("captureBtn");
    if (btn) btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
        </svg>
        Capture Shot ${captureCount + 1}`;
}

function retakeCaptures() {
    captureCount = 0;

    ["camera_image_1", "camera_image_2", "camera_image_3"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    [1, 2, 3].forEach(i => {
        const s = document.getElementById(`step${i}`);
        if (s) { s.classList.remove("done", "active"); }
    });
    document.getElementById("step1")?.classList.add("active");

    document.getElementById("captureBtn").style.display  = "inline-flex";
    document.getElementById("analyzeBtn").style.display  = "none";
    document.getElementById("retakeBtn").style.display   = "none";

    updateAngleUI();
}

function setStatus(text) {
    const el = document.getElementById("scannerStatusText");
    if (el) el.textContent = text;
}

function setInstruction(text) {
    const el = document.getElementById("angleInstruction");
    if (el) el.textContent = text;
}

function setArrow(symbol) {
    const el = document.getElementById("angleArrow");
    if (el) el.textContent = symbol;
}

/* ===================== LOADING OVERLAY ===================== */
function showLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (!overlay) return;
    overlay.classList.add("visible");

    // Animate steps: step 1 active immediately, step 2 after 2s, step 3 after 5s
    const steps = [
        { id: "lstep1", delay: 0 },
        { id: "lstep2", delay: 2200 },
        { id: "lstep3", delay: 5000 }
    ];

    steps.forEach(({ id, delay }, i) => {
        setTimeout(() => {
            if (i > 0) document.getElementById(steps[i - 1].id)?.classList.replace("active", "done");
            document.getElementById(id)?.classList.add("active");
        }, delay);
    });
}

/* ===================== FILE PREVIEW ===================== */
document.addEventListener("DOMContentLoaded", () => {
    // Auto-start camera
    startCamera();

    // Intercept both form submits to show loading
    document.querySelectorAll("form").forEach(form => {
        form.addEventListener("submit", () => showLoading());
    });

    // File preview
    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (!file) return;

            const preview = document.getElementById("filePreview");
            const img     = document.getElementById("previewImg");
            const nameEl  = document.getElementById("fileName");

            const reader = new FileReader();
            reader.onload = e => {
                if (img)     img.src = e.target.result;
                if (nameEl)  nameEl.textContent = file.name;
                if (preview) preview.style.display = "flex";
            };
            reader.readAsDataURL(file);
        });
    }
});

/* ===================== CHAT ===================== */
async function sendChat() {
    const input    = document.getElementById("chatInput");
    const messages = document.getElementById("chatMessages");
    if (!input || !messages) return;

    const text = input.value.trim();
    if (!text) return;

    appendMessage(messages, text, "user");
    input.value = "";

    const loadingId = "loading_" + Date.now();
    appendMessage(messages, "Thinking…", "bot", loadingId);

    try {
        const res  = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text })
        });

        document.getElementById(loadingId)?.remove();
        const data = await res.json();
        appendMessage(messages, data.reply, "bot");

    } catch {
        document.getElementById(loadingId)?.remove();
        appendMessage(messages, "Chat is unavailable right now.", "bot");
    }
}

function appendMessage(container, text, role, id) {
    const wrap   = document.createElement("div");
    wrap.className = `msg msg-${role}`;
    if (id) wrap.id = id;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = role === "bot" ? "AI" : "Me";

    const bubble = document.createElement("div");
    bubble.className = "msg-text";
    bubble.textContent = text;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
}

document.addEventListener("keydown", e => {
    if (e.key === "Enter" && document.activeElement?.id === "chatInput") {
        e.preventDefault();
        sendChat();
    }
});
