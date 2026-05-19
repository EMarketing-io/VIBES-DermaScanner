"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const STEPS = [
  { label: "Look Straight", hint: "Face the camera directly and keep your face centred in the frame.", arrow: "" },
  { label: "Turn Left",     hint: "Slowly turn your head to the LEFT and hold still for the shot.",  arrow: "←" },
  { label: "Turn Right",    hint: "Slowly turn your head to the RIGHT and hold still for the shot.", arrow: "→" },
];

type St = "idle" | "loading" | "ready" | "done" | "error";

export default function ScanPage() {
  const router = useRouter();
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [shots, setShots]           = useState(0);
  const [thumbs, setThumbs]         = useState<string[]>([]);
  const [captured, setCaptured]     = useState<string[]>([]);
  const [camReady, setCamReady]     = useState(false);
  const [camErr, setCamErr]         = useState(false);
  const [flashing, setFlashing]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [stText, setStText]         = useState("Starting camera…");
  const [stState, setStState]       = useState<St>("idle");

  const setStatus = useCallback((t: string, s: St) => { setStText(t); setStState(s); }, []);

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 1280 }, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setCamReady(true);
        setCamErr(false);
        setStatus("Camera ready — press Capture", "ready");
      } catch {
        setCamErr(true);
        setStatus("Camera blocked — upload an image below", "error");
      }
    })();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    if (shots >= 3 || !videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth || 1280; c.height = v.videoHeight || 1280;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const url = c.toDataURL("image/jpeg", 0.9);
    setFlashing(true);
    setTimeout(() => setFlashing(false), 350);
    const next = shots + 1;
    setCaptured(p => [...p, url]);
    setThumbs(p => [...p, url]);
    setShots(next);
    if (next < 3) setStatus(`Shot ${next} captured — get ready for next`, "ready");
    else setStatus("All 3 shots done!", "done");
  }

  function retake() {
    setCaptured([]); setThumbs([]); setShots(0);
    setStatus("Camera ready — press Capture", "ready");
  }

  async function analyze() {
    if (!captured.length && !uploadFile) { setError("Capture photos or upload an image first."); return; }
    setSubmitting(true); setError("");
    const fd = new FormData();
    if (uploadFile) { fd.append("face_images", uploadFile); }
    else { captured.forEach((img, i) => fd.append(`camera_image_${i + 1}`, img)); }
    try {
      const res = await fetch(`${API}/api/analyze`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Analysis failed." })); throw new Error(e.detail ?? "Analysis failed."); }
      const data = await res.json();
      localStorage.setItem("vibes_result", JSON.stringify(data));
      router.push("/result");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed. Try again."); setSubmitting(false);
    }
  }

  const step = Math.min(shots, 2);
  const done = shots >= 3;
  const cameraBlocked = camErr && !camReady;
  const canCapture = camReady && !done;

  return (
    <>
      {/* Loading overlay */}
      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(7,9,15,0.82)", backdropFilter: "blur(16px)" }}>
          <div className="rounded-3xl p-12 text-center" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", maxWidth: 300, width: "90%" }}>
            <div className="rings-wrap mx-auto mb-6">
              <div className="ring ring-1" /><div className="ring ring-2" /><div className="ring ring-3" />
              <div className="ring-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                </svg>
              </div>
            </div>
            <div className="font-black text-lg mb-1" style={{ color: "var(--text)" }}>Analyzing…</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>AI is scanning your skin &amp; hair</div>
          </div>
        </div>
      )}

      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <div className="max-w-7xl mx-auto px-6">

          {/* NAV */}
          <Navbar
            right={
              <Link href="/" className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-sub)" }}>
                Home
              </Link>
            }
          />

          {/* TWO-COLUMN GRID */}
          <div className="grid lg:grid-cols-2 gap-8 pb-12 items-start">

            {/* ── LEFT: Scanner ── */}
            <div>
              {/* Step progress */}
              <div className="flex items-center justify-center mb-3">
                {STEPS.map((s, i) => (
                  <div key={s.label} className="flex items-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 flex-shrink-0"
                        style={
                          i < shots
                            ? { background: "var(--green)", color: "#fff", boxShadow: "0 0 12px rgba(52,211,153,0.4)" }
                            : i === step
                            ? { background: "var(--grad)", color: "white", boxShadow: "0 0 16px rgba(124,58,237,0.45)" }
                            : { background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-muted)" }
                        }
                      >
                        {i < shots ? "✓" : i + 1}
                      </div>
                      <span className="text-[10px] font-semibold whitespace-nowrap"
                        style={{ color: i < shots ? "var(--green)" : i === step ? "var(--purple)" : "var(--text-muted)" }}>
                        {s.label}
                      </span>
                    </div>
                    {i < 2 && <div className={`step-connector ${i < shots ? "done" : ""}`} />}
                  </div>
                ))}
              </div>

              {/* Scanner */}
              <div className={`scanner-wrap ${camReady ? "camera-on" : ""}`} style={{ width: "100%", aspectRatio: "1" }}>
                <div className="scanner-inner">
                  <video ref={videoRef} autoPlay playsInline muted className="scan-video" />
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="scan-glow" />
                  <div className="scan-grid" />
                  <div className="scan-line" />

                  <svg className="demo-face-svg" width="160" height="200" viewBox="0 0 160 200" fill="none">
                    <ellipse cx="80" cy="100" rx="56" ry="77" stroke="rgba(139,92,246,0.45)" strokeWidth="1.5"/>
                    <ellipse cx="59" cy="80" rx="9" ry="5" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2"/>
                    <ellipse cx="101" cy="80" rx="9" ry="5" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2"/>
                    <path d="M73 100 Q80 108 87 100" stroke="rgba(139,92,246,0.3)" strokeWidth="1.2"/>
                    <path d="M63 128 Q80 138 97 128" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2"/>
                  </svg>

                  {/* Direction arrow */}
                  <div className={`dir-arrow ${!camErr && !done && STEPS[step]?.arrow ? "show" : ""}`}>
                    {STEPS[step]?.arrow}
                  </div>

                  {/* Corner accents */}
                  <div style={{ position:"absolute", width:20, height:20, top:12, left:12, borderTop:"2px solid var(--purple)", borderLeft:"2px solid var(--purple)", borderRadius:"4px 0 0 0", zIndex:10 }} />
                  <div style={{ position:"absolute", width:20, height:20, top:12, right:12, borderTop:"2px solid var(--pink)", borderRight:"2px solid var(--pink)", borderRadius:"0 4px 0 0", zIndex:10 }} />
                  <div style={{ position:"absolute", width:20, height:20, bottom:12, left:12, borderBottom:"2px solid var(--pink)", borderLeft:"2px solid var(--pink)", borderRadius:"0 0 0 4px", zIndex:10 }} />
                  <div style={{ position:"absolute", width:20, height:20, bottom:12, right:12, borderBottom:"2px solid var(--purple)", borderRight:"2px solid var(--purple)", borderRadius:"0 0 4px 0", zIndex:10 }} />

                  <div className="node node-1" /><div className="node node-2" />
                  <div className="node node-3" /><div className="node node-4" />

                  <div className={`cap-flash ${flashing ? "flash" : ""}`} />

                  <div className="scan-status">
                    <span className={`status-dot ${stState}`} />
                    <span>{stText}</span>
                  </div>

                  {!done && !cameraBlocked && (
                    <button
                      type="button"
                      onClick={capture}
                      disabled={!canCapture}
                      className="scanner-capture-btn"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                      </svg>
                      <span>{canCapture ? `Capture ${shots + 1}` : "Starting..."}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Thumbnails */}
              {thumbs.length > 0 && (
                <div className="flex gap-3 justify-center mt-4">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center"
                      style={{ background: "var(--bg-card)", border: `1px solid ${thumbs[i] ? "var(--border-accent)" : "var(--border)"}` }}>
                      {thumbs[i]
                        ? <img src={thumbs[i]} alt={`Shot ${i+1}`} className="w-full h-full object-cover" />
                        : <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>Shot {i+1}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── RIGHT: Controls ── */}
            <div className="flex flex-col gap-5 lg:pt-14">

              {/* Heading */}
              <div>
                <h1 className="text-3xl font-black tracking-tight mb-1" style={{ color: "var(--text)" }}>
                  {done ? "Ready to analyze" : cameraBlocked ? "Upload a photo" : `Step ${shots + 1} of 3`}
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {done
                    ? "All three angles captured. Hit Analyze to get your AI skin & hair report."
                    : cameraBlocked
                    ? "Camera permission was denied. Use the upload section below instead."
                    : STEPS[step].hint}
                </p>
              </div>

              {/* Analysis error */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold"
                  style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "var(--red)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </div>
              )}

              {/* ── Camera capture buttons — always visible ── */}
              <div className="flex gap-3">
                {done && (
                  <button onClick={retake}
                    className="flex items-center gap-2 px-5 rounded-2xl text-sm font-bold transition-all hover:-translate-y-0.5"
                    style={{ height: 52, background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-sub)" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                    </svg>
                    Retake
                  </button>
                )}

                {!done && !cameraBlocked && (
                  <button onClick={capture} disabled={!camReady}
                    className="grad-btn flex-1 flex items-center justify-center gap-2 rounded-2xl text-sm"
                    style={{ height: 52, boxShadow: "0 8px 24px rgba(124,58,237,0.3)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                    </svg>
                    {!camReady ? "Starting camera…" : `Capture Shot ${shots + 1}`}
                  </button>
                )}

                {done && (
                  <button onClick={analyze}
                    className="grad-btn flex-1 flex items-center justify-center gap-2 rounded-2xl text-sm"
                    style={{ height: 52, boxShadow: "0 8px 24px rgba(124,58,237,0.3)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    Analyze My Skin &amp; Hair
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  {cameraBlocked ? "upload a photo" : "or upload instead"}
                </span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>

              {/* Upload card */}
              <div className="rounded-3xl p-5" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
                <h2 className="text-sm font-black mb-1" style={{ color: "var(--text)" }}>Upload an Image</h2>
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Use a clear, well-lit front-facing selfie for best results.</p>

                <label className="flex items-center gap-3 p-4 rounded-2xl cursor-pointer mb-3 transition-all"
                  style={{ background: "var(--bg-card)", border: "1.5px dashed var(--border-accent)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    style={{ color: "var(--purple)", flexShrink: 0 }}>
                    <rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{uploadName || "Choose Face Image"}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>JPG, PNG, WEBP · Max 25MB</div>
                  </div>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); setUploadName(f.name); } }} />
                </label>

                <button onClick={analyze} disabled={!uploadFile}
                  className="grad-btn w-full flex items-center justify-center gap-2 rounded-2xl text-sm"
                  style={{ height: 48 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  Analyze Uploaded Image
                </button>
              </div>

              {/* Step guide — always shown when camera is available */}
              <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-xs font-bold mb-3"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {cameraBlocked ? "Photo tips" : "Capture guide"}
                </div>
                <div className="flex flex-col gap-3">
                  {cameraBlocked ? (
                    <>
                      {["Use a clear front-facing selfie in good lighting.", "Avoid filters or heavy editing.", "Make sure your full face is visible in frame."].map((tip, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                            style={{ background: "var(--grad)", color: "#fff" }}>{i + 1}</div>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{tip}</p>
                        </div>
                      ))}
                    </>
                  ) : (
                    STEPS.map((s, i) => (
                      <div key={s.label} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5"
                          style={
                            i < shots
                              ? { background: "var(--green)", color: "#fff" }
                              : i === step
                              ? { background: "var(--grad)", color: "#fff" }
                              : { background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-muted)" }
                          }>
                          {i < shots ? "✓" : i + 1}
                        </div>
                        <div>
                          <div className="text-xs font-bold" style={{ color: i === step ? "var(--text)" : "var(--text-muted)" }}>{s.label}</div>
                          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{s.hint}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                AI screening is for guidance only. Consult a certified dermatologist for diagnosis.
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
