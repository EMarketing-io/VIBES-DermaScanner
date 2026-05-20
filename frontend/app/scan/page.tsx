"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const instructions = [
  {
    icon: "smile",
    title: "Clean, makeup-free face",
    desc: "Remove all makeup and cleanse your face beforehand.",
  },
  {
    icon: "sun",
    title: "Bright, even lighting",
    desc: "Natural daylight near a window works best.",
  },
  {
    icon: "lines",
    title: "Hair pulled back",
    desc: "Clear your forehead, cheeks and jawline.",
  },
  {
    icon: "clock",
    title: "No filters, no beauty mode",
    desc: "Turn off all smart enhancements on your phone camera.",
  },
];

const checklist = [
  "Detecting facial landmarks",
  "Mapping pigmentation & dark spots",
  "Measuring fine lines & texture",
  "Evaluating hydration & firmness",
  "Matching VIBES treatments",
];

const captureSteps = [
  { title: "Front", instruction: "Look straight into the guide. Keep your full face centered." },
  { title: "Slight left", instruction: "Turn only a little to your left. Keep both eyes mostly visible inside the guide." },
  { title: "Slight right", instruction: "Turn only a little to your right. Keep both eyes mostly visible inside the guide." },
];

type Mode = "instructions" | "camera" | "review" | "loading";
type DistanceStatus =
  | "searching"
  | "ok"
  | "too_close"
  | "too_far"
  | "move_left"
  | "move_right"
  | "raise_face"
  | "lower_face"
  | "multiple_faces"
  | "no_face"
  | "unsupported";
type FaceDetection = { boundingBox: { width: number; height: number; x?: number; y?: number } };
type FaceDetectorInstance = { detect: (source: CanvasImageSource) => Promise<FaceDetection[]> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorInstance;
type FaceGuide = { centerX: number; centerY: number; ratio: number };

declare global {
  interface Window {
    FaceDetector?: FaceDetectorConstructor;
  }
}

const distanceCopy: Record<DistanceStatus, string> = {
  searching: "Finding face",
  ok: "Perfect distance",
  too_close: "Move back slightly",
  too_far: "Move closer",
  move_left: "Move left",
  move_right: "Move right",
  raise_face: "Raise face",
  lower_face: "Lower face",
  multiple_faces: "Only one face",
  no_face: "Center face in guide",
  unsupported: "Center face in guide",
};

const guidanceCopy: Record<DistanceStatus, string> = {
  searching: "Hold still while we locate your face.",
  ok: "Perfect. Hold steady and capture this photo.",
  too_close: "Step back until your full face and chin fit inside the outline.",
  too_far: "Move closer until your face fills most of the outline.",
  move_left: "Move your face slightly left on the screen.",
  move_right: "Move your face slightly right on the screen.",
  raise_face: "Lift your face upward into the center of the outline.",
  lower_face: "Lower your face slightly into the center of the outline.",
  multiple_faces: "Only one person should be visible in the frame.",
  no_face: "Bring your face into the outline and face the camera.",
  unsupported: "Use the outline visually. When your face is centered, capture.",
};

function captureStepHint(index: number) {
  if (index === 1) return "Only a small left turn is needed. Do not turn to a side profile.";
  if (index === 2) return "Only a small right turn is needed. Do not turn to a side profile.";
  return "Face the camera directly for the first photo.";
}

function canCaptureForShot(status: DistanceStatus, shotIndex: number) {
  if (status === "unsupported") return true;
  if (shotIndex === 0) return status === "ok";
  return !["multiple_faces", "too_close", "too_far"].includes(status);
}

function Icon({ name }: { name: string }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7 } as const;
  if (name === "camera") {
    return <svg {...common}><path d="M7 7h2l1.4-2h3.2L15 7h2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3Z"/><circle cx="12" cy="13" r="3.3"/></svg>;
  }
  if (name === "upload") {
    return <svg {...common}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>;
  }
  if (name === "sun") {
    return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
  }
  if (name === "lines") {
    return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
  }
  if (name === "clock") {
    return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M8.5 10h.01M15.5 10h.01M8.8 14.5c1.7 1.6 4.7 1.6 6.4 0"/></svg>;
}

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<Mode>("instructions");
  const [photos, setPhotos] = useState<string[]>([]);
  const [currentShot, setCurrentShot] = useState(0);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [distanceStatus, setDistanceStatus] = useState<DistanceStatus>("searching");
  const [faceGuide, setFaceGuide] = useState<FaceGuide | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
    setDistanceStatus("searching");
    setFaceGuide(null);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (mode !== "camera" || !cameraReady) return;

    const Detector = window.FaceDetector;
    if (!Detector) {
      setDistanceStatus("unsupported");
      return;
    }

    let cancelled = false;
    const detector = new Detector({ fastMode: true, maxDetectedFaces: 2 });

    async function checkDistance() {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        const faces = await detector.detect(video);
        if (cancelled) return;
        if (!faces.length) {
          setDistanceStatus("no_face");
          return;
        }
        if (faces.length > 1) {
          setDistanceStatus("multiple_faces");
          return;
        }

        const face = faces[0].boundingBox;
        const faceHeight = face.height;
        const frameHeight = video.videoHeight || faceHeight;
        const frameWidth = video.videoWidth || face.width;
        const centerX = ((face.x ?? 0) + face.width / 2) / frameWidth;
        const centerY = ((face.y ?? 0) + face.height / 2) / frameHeight;
        const ratio = faceHeight / frameHeight;
        setFaceGuide({ centerX, centerY, ratio });
        if (centerX < 0.32) setDistanceStatus("move_right");
        else if (centerX > 0.66) setDistanceStatus("move_left");
        else if (centerY < 0.2) setDistanceStatus("lower_face");
        else if (centerY > 0.76) setDistanceStatus("raise_face");
        else if (ratio < 0.16) setDistanceStatus("too_far");
        else if (ratio > 0.74) setDistanceStatus("too_close");
        else setDistanceStatus("ok");
      } catch {
        if (!cancelled) {
          setFaceGuide(null);
          setDistanceStatus("unsupported");
        }
      }
    }

    checkDistance();
    const interval = window.setInterval(checkDistance, 650);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cameraReady, mode]);

  async function startCamera() {
    setError("");
    setDistanceStatus("searching");
    setFaceGuide(null);
    setPhotos([]);
    setCurrentShot(0);
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 1280 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setError("Camera permission was blocked. Please upload a clear photo instead.");
      setMode("instructions");
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return;
    const canUseCapture = canCaptureForShot(distanceStatus, currentShot);
    if (!canUseCapture) {
      setError(
        currentShot === 0
          ? "Center one face inside the guide until it turns green before capturing."
          : "Keep one face inside the guide, not too close or too far, then capture the slight angle."
      );
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 1280;
    const cropW = Math.round(vw * 0.64);
    const cropH = Math.round(vh * 0.84);
    const sx = Math.round((vw - cropW) / 2);
    const sy = Math.round((vh - cropH) / 2);
    canvas.width = 900;
    canvas.height = 1100;
    canvas.getContext("2d")?.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
    const nextPhoto = canvas.toDataURL("image/jpeg", 0.92);
    const nextPhotos = [...photos, nextPhoto].slice(0, 3);
    setPhotos(nextPhotos);
    setError("");
    localStorage.setItem("vibes_photo", nextPhotos[0]);
    if (nextPhotos.length >= 3) {
      stopCamera();
      setMode("review");
      return;
    }
    setCurrentShot(nextPhotos.length);
    setDistanceStatus("searching");
  }

  function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const nextPhoto = String(reader.result || "");
      setPhotos([nextPhoto, nextPhoto, nextPhoto]);
      localStorage.setItem("vibes_photo", nextPhoto);
      stopCamera();
      setMode("review");
    };
    reader.readAsDataURL(file);
  }

  async function analyzePhoto() {
    if (photos.length < 3) {
      setError("Please capture all three guided photos before continuing.");
      return;
    }
    setError("");
    setMode("loading");

    const form = new FormData();
    photos.slice(0, 3).forEach((shot, index) => {
      form.append(`camera_image_${index + 1}`, shot);
    });
    form.append("patient_info", localStorage.getItem("vibes_patient_info") ?? "{}");

    try {
      const res = await fetch(`${API}/api/analyze`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? "Analysis failed. Please try again.");
      localStorage.setItem("vibes_result", JSON.stringify(data));
      localStorage.setItem("vibes_photo", photos[0]);
      router.push("/result");
    } catch (event: unknown) {
      setError(event instanceof Error ? event.message : "Analysis failed. Please try again.");
      setMode("review");
    }
  }

  if (mode === "review") {
    return (
      <main className="min-h-screen bg-white">
        <header className="flex items-center justify-between px-6 py-6">
          <Link href="/" className="font-serif-display text-2xl font-semibold" style={{ color: "var(--text)" }}>
            VIBES
          </Link>
        </header>

        <section className="clinical-shell flex min-h-[calc(100vh-180px)] flex-col justify-center py-8">
          <div className="mx-auto mb-8 text-center">
            <div className="step-label">Three photos captured</div>
            <h1 className="font-serif-display mt-2 text-4xl font-semibold" style={{ color: "var(--text)" }}>
              Review your guided scan.
            </h1>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {photos.slice(0, 3).map((shot, index) => (
              <div key={index} className="clinical-card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot} alt={`${captureSteps[index].title} scan photo`} className="aspect-[4/5] w-full object-cover" />
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{captureSteps[index].title}</span>
                  <span className="section-kicker">0{index + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="mx-auto max-w-xl px-6 text-center text-sm font-semibold" style={{ color: "var(--accent)" }}>{error}</p>}

        <footer className="clinical-shell flex items-center justify-between border-t py-7" style={{ borderColor: "var(--border)" }}>
          <button type="button" className="text-link" onClick={() => { setPhotos([]); setCurrentShot(0); localStorage.removeItem("vibes_photo"); setMode("instructions"); }}>
            Retake
          </button>
          <button type="button" className="text-link primary" onClick={analyzePhoto}>
            Use these photos
          </button>
        </footer>
      </main>
    );
  }

  if (mode === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <div className="relative mb-12 h-64 w-64">
          <div
            className="absolute -inset-10 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(181,84,28,0.18) 0%, rgba(255,255,255,0.82) 52%, rgba(255,255,255,0) 72%)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[0]} alt="Analyzing selected face" className="relative h-64 w-64 rounded-full object-cover" />
        </div>

        <div className="grid gap-4 text-left">
          {checklist.map((item, index) => (
            <div
              key={item}
              className="flex items-center gap-3 text-sm font-semibold opacity-0"
              style={{ color: "var(--text-sub)", animation: `checklistFade 420ms ease forwards`, animationDelay: `${index * 800}ms` }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
              {item}
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (mode === "camera") {
    const guideOk = canCaptureForShot(distanceStatus, currentShot);
    const guideColor = guideOk ? "var(--green)" : "var(--accent)";
    const captureEnabled = cameraReady && guideOk;

    return (
      <main className="h-screen overflow-hidden bg-white">
        <div className="clinical-shell h-full">
          <Navbar />
          <section className="mx-auto flex h-[calc(100vh-96px)] max-w-6xl flex-col justify-between pb-6 pt-2">
            <div className="grid min-h-0 flex-1 items-center gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
              <div
                className="relative overflow-hidden border bg-black"
                style={{
                  borderColor: "var(--border)",
                  width: "min(100%, 640px)",
                  height: "min(62vh, 520px)",
                }}
              >
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-[46%]"
                  style={{
                    border: `4px solid ${guideColor}`,
                    boxShadow: `0 0 0 999px rgba(0, 0, 0, 0.22), 0 0 28px ${guideOk ? "rgba(61,123,90,0.45)" : "rgba(181,84,28,0.45)"}`,
                  }}
                />
                {distanceStatus === "move_left" && (
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-5xl font-bold" style={{ color: guideColor }}>←</div>
                )}
                {distanceStatus === "move_right" && (
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-5xl font-bold" style={{ color: guideColor }}>→</div>
                )}
                {distanceStatus === "raise_face" && (
                  <div className="absolute left-1/2 top-16 -translate-x-1/2 text-5xl font-bold" style={{ color: guideColor }}>↑</div>
                )}
                {distanceStatus === "lower_face" && (
                  <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-5xl font-bold" style={{ color: guideColor }}>↓</div>
                )}
                <div
                  className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.12em]"
                  style={{
                    background: "rgba(255,255,255,0.92)",
                    color: guideColor,
                    border: `1px solid ${guideColor}`,
                  }}
                >
                  {distanceCopy[distanceStatus]}
                </div>
                {faceGuide && distanceStatus !== "ok" && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "rgba(255,255,255,0.86)", color: "var(--text-sub)" }}>
                    x {Math.round(faceGuide.centerX * 100)} · y {Math.round(faceGuide.centerY * 100)} · size {Math.round(faceGuide.ratio * 100)}
                  </div>
                )}
                <div className="absolute bottom-4 left-4 right-4 border bg-white/90 p-3 text-center backdrop-blur-sm md:hidden" style={{ borderColor: guideColor }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: guideColor }}>{distanceCopy[distanceStatus]}</div>
                  <div className="mt-1 text-xs font-semibold" style={{ color: "var(--text-sub)" }}>{guidanceCopy[distanceStatus]}</div>
                </div>
              </div>
              <aside className="clinical-card p-5">
                <div className="section-kicker">Photo {currentShot + 1} of 3</div>
                <h1 className="font-serif-display mt-2 text-4xl font-semibold leading-none" style={{ color: "var(--text)" }}>
                  {captureSteps[currentShot]?.title}
                </h1>
                <p className="mt-4 text-sm leading-6" style={{ color: "var(--text-sub)" }}>
                  {captureSteps[currentShot]?.instruction}
                </p>

                <div className="mt-5 border-l-2 bg-[#f9f7f4] p-4" style={{ borderColor: guideColor }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: guideColor }}>Guidance</div>
                  <div className="mt-2 text-base font-bold" style={{ color: "var(--text)" }}>{distanceCopy[distanceStatus]}</div>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-sub)" }}>{guidanceCopy[distanceStatus]}</p>
                </div>

                <div className="mt-4 border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>Angle guide</div>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-sub)" }}>{captureStepHint(currentShot)}</p>
                </div>

                <div className="mt-6 grid gap-3">
                  {captureSteps.map((step, index) => (
                    <div
                      key={step.title}
                      className="flex items-center justify-between border p-3"
                      style={{
                        borderColor: index < photos.length ? "var(--green)" : index === currentShot ? "var(--accent)" : "var(--border)",
                        color: index < photos.length ? "var(--green)" : index === currentShot ? "var(--accent)" : "var(--text-sub)",
                      }}
                    >
                      <span className="text-xs font-bold uppercase tracking-[0.12em]">{step.title}</span>
                      <span className="text-xs font-bold">{index < photos.length ? "Done" : `0${index + 1}`}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="aspect-[4/5] overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                      {photos[index] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photos[index]} alt={`${captureSteps[index].title} captured`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                          0{index + 1}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </aside>
              <canvas ref={canvasRef} className="hidden" />
            </div>
            {error && <p className="mt-4 text-sm font-semibold" style={{ color: "var(--accent)" }}>{error}</p>}
            <footer className="flex flex-shrink-0 items-center justify-between border-t pt-5" style={{ borderColor: "var(--border)" }}>
              <button type="button" className="text-link" onClick={() => { stopCamera(); setMode("instructions"); }}>
                ← Back
              </button>
              <div className="flex items-center gap-5">
                {!captureEnabled && cameraReady && (
                  <button type="button" className="text-link" onClick={() => setDistanceStatus("unsupported")}>
                    Looks centered
                  </button>
                )}
                <button
                  type="button"
                  className="text-link primary disabled:opacity-40"
                  onClick={capturePhoto}
                  disabled={!captureEnabled}
                  title={distanceStatus === "ok" ? "Capture" : distanceCopy[distanceStatus]}
                >
                  Capture {currentShot + 1}/3 →
                </button>
              </div>
            </footer>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="clinical-page">
      <div className="clinical-shell">
        <Navbar />

        <section className="mx-auto flex min-h-[calc(100vh-104px)] max-w-4xl flex-col justify-center py-10">
          <div className="step-label mb-6">Step 2 of 3</div>
          <h1 className="display-heading max-w-3xl">
            Before we <span className="accent-italic">capture</span> your photo.
          </h1>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {instructions.map((item) => (
              <div key={item.title} className="clinical-card flex gap-4 p-5">
                <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
                  <Icon name={item.icon} />
                </div>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>{item.title}</h2>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-sub)" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="mt-6 text-sm font-semibold" style={{ color: "var(--accent)" }}>{error}</p>}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button type="button" className="clinical-card flex items-center gap-4 p-6 text-left transition hover:-translate-y-0.5" onClick={startCamera}>
              <span className="flex h-12 w-12 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
                <Icon name="camera" />
              </span>
              <span>
                <span className="block text-base font-bold" style={{ color: "var(--text)" }}>Use Camera</span>
                <span className="mt-1 block text-sm" style={{ color: "var(--text-sub)" }}>Capture live</span>
              </span>
            </button>

            <label className="clinical-card flex cursor-pointer items-center gap-4 p-6 text-left transition hover:-translate-y-0.5">
              <span className="flex h-12 w-12 items-center justify-center border" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
                <Icon name="upload" />
              </span>
              <span>
                <span className="block text-base font-bold" style={{ color: "var(--text)" }}>Upload Photo</span>
                <span className="mt-1 block text-sm" style={{ color: "var(--text-sub)" }}>From your device</span>
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
            </label>
          </div>

          <footer className="mt-14 flex items-center justify-between border-t pt-7" style={{ borderColor: "var(--border)" }}>
            <Link href="/onboarding" className="text-link">
              ← Back
            </Link>
          </footer>
        </section>
      </div>
    </main>
  );
}
