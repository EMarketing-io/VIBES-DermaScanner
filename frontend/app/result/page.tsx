"use client";

import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const img = (f: string) => `${API}/uploads/${f}`;

type Zone   = { title: string; area: string; has_issue: boolean; file: string };
type Hair   = { main_issue: string; severity: string; confidence: number; hair_type: string; summary: string; tips: string[]; problem_areas: string[] };
type Result = { main_issue: string; severity: string; confidence: number; skin_tone: string; summary: string; tips: string[]; chat: string; problem_areas: string[]; hair: Hair };
type Doctor = { name: string; type: string; rating: string; experience: string; location: string; fee: string };
type HairRegion = { title: string; concern: string; file: string };
type Data = { result: Result; image_file: string; scanned_files?: string[]; detected_file: string; face_regions: Zone[]; hair_regions: HairRegion[]; image_enhanced: boolean; doctors: Doctor[] };
type ImagePreview = { src: string; title: string; subtitle?: string };
type LeadForm = { name: string; phone: string; email: string; gender: string };

const SEV_STYLE: Record<string, { bg: string; color: string }> = {
  low:      { bg: "rgba(52,211,153,0.1)",  color: "var(--green)" },
  mild:     { bg: "rgba(251,191,36,0.1)",  color: "var(--amber)" },
  moderate: { bg: "rgba(251,113,0,0.1)",   color: "#fb7c00" },
  review:   { bg: "rgba(248,113,113,0.1)", color: "var(--red)" },
  fallback: { bg: "var(--bg-card)",        color: "var(--text-muted)" },
};

function SevBadge({ sev }: { sev: string }) {
  const key = sev.toLowerCase().replace(/needs.*/, "review");
  const s = SEV_STYLE[key] ?? SEV_STYLE.fallback;
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold flex-shrink-0"
      style={{ background: s.bg, color: s.color }}>
      {sev}
    </span>
  );
}

function ConfBar({ value, accent }: { value: number; accent?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold w-20 flex-shrink-0" style={{ color: "var(--text-muted)" }}>Confidence</span>
      <div className="conf-track flex-1">
        <div className="conf-fill" style={{ width: `${value}%`, background: accent ?? "var(--grad)" }} />
      </div>
      <span className="text-sm font-black w-9 text-right" style={{ color: "var(--text)" }}>{value}%</span>
    </div>
  );
}

function Tip({ n, text, accent }: { n: number; text: string; accent?: string }) {
  return (
    <div className="flex gap-3 items-start p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0"
        style={{ background: accent ?? "var(--grad)" }}>{n}</div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-sub)" }}>{text}</p>
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const [data, setData]     = useState<Data | null>(null);
  const [tab, setTab]       = useState<"skin" | "hair">("skin");
  const [chatIn, setChatIn] = useState("");
  const [msgs, setMsgs]     = useState<{ role: "user" | "bot"; text: string }[]>([{ role: "bot", text: "Ask me anything — e.g. What should I do for forehead acne?" }]);
  const [chatBusy, setChatBusy] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [leadSuccess, setLeadSuccess] = useState("");
  const [leadForm, setLeadForm] = useState<LeadForm>({ name: "", phone: "", email: "", gender: "" });
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = localStorage.getItem("vibes_result");
    if (!raw) { router.push("/scan"); return; }
    try { setData(JSON.parse(raw)); } catch { router.push("/scan"); }
  }, [router]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs]);

  useEffect(() => {
    if (!data?.image_file) return;
    const saved = localStorage.getItem(`vibes_lead_${data.image_file}`);
    if (!saved) {
      setLeadSubmitted(false);
      setLeadOpen(true);
      return;
    }
    try {
      const savedForm = JSON.parse(saved) as LeadForm;
      setLeadForm(savedForm);
      setLeadSubmitted(true);
      setLeadOpen(false);
    } catch {
      setLeadSubmitted(false);
      setLeadOpen(true);
    }
  }, [data]);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview]);

  async function chat() {
    const text = chatIn.trim();
    if (!text || chatBusy) return;
    setMsgs(m => [...m, { role: "user" as "user" | "bot", text }]);
    setChatIn(""); setChatBusy(true);
    try {
      const res  = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      const json = await res.json();
      setMsgs(m => [...m, { role: "bot" as "user" | "bot", text: json.reply }]);
    } catch {
      setMsgs(m => [...m, { role: "bot" as "user" | "bot", text: "Chat unavailable right now." }]);
    } finally { setChatBusy(false); }
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || leadSaving) return;

    const name = leadForm.name.trim();
    const phone = leadForm.phone.trim();
    const email = leadForm.email.trim();
    const gender = leadForm.gender.trim();

    if (!name) { setLeadError("Please enter your name."); return; }
    if (!/^\d{10}$/.test(phone)) { setLeadError("Enter a valid 10 digit phone number."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setLeadError("Enter a valid email address."); return; }
    if (!gender) { setLeadError("Please select gender."); return; }

    setLeadSaving(true);
    setLeadError("");
    setLeadSuccess("");
    try {
      const res = await fetch(`${API}/api/submit-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, gender, data }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail ?? "Could not save details.");
      const savedForm = { name, phone, email, gender };
      localStorage.setItem(`vibes_lead_${data.image_file}`, JSON.stringify(savedForm));
      setLeadForm(savedForm);
      setLeadSubmitted(true);
      setLeadSuccess("Details saved. Your PDF report is ready to download.");
    } catch (e: unknown) {
      setLeadError(e instanceof Error ? e.message : "Could not save details.");
    } finally {
      setLeadSaving(false);
    }
  }

  async function downloadPdf() {
    if (!data || pdfBusy) return;

    const name = leadForm.name.trim();
    const phone = leadForm.phone.trim();
    const email = leadForm.email.trim();
    const gender = leadForm.gender.trim();
    if (!name || !/^\d{10}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !gender) {
      setLeadOpen(true);
      setLeadSubmitted(false);
      setLeadError("Please complete your details before downloading the PDF.");
      return;
    }

    setPdfBusy(true);
    setLeadError("");
    try {
      const res = await fetch(`${API}/api/report-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, gender, data }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.detail ?? "Could not generate PDF.");
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${name.replace(/[^a-z0-9_-]+/gi, "_") || "Vibes"}_DermaScan_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (e: unknown) {
      setLeadOpen(true);
      setLeadError(e instanceof Error ? e.message : "Could not generate PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="rings-wrap"><div className="ring ring-1"/><div className="ring ring-2"/><div className="ring ring-3"/>
        <div className="ring-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/></svg></div>
      </div>
    </div>
  );

  const { result: r, detected_file, face_regions, hair_regions, image_enhanced, doctors } = data;

  return (
    <div className="min-h-screen">
      {preview && (
        <div className="image-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${preview.title} image preview`} onClick={() => setPreview(null)}>
          <div className="image-modal-panel" onClick={e => e.stopPropagation()}>
            <div className="image-modal-header">
              <div className="min-w-0">
                <h2>{preview.title}</h2>
                {preview.subtitle && <p>{preview.subtitle}</p>}
              </div>
              <button type="button" className="image-modal-close" aria-label="Close image preview" onClick={() => setPreview(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
            <div className="image-modal-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.src} alt={preview.title} />
            </div>
          </div>
        </div>
      )}

      {leadOpen && (
        <div className="lead-modal-backdrop" role="dialog" aria-modal="true" aria-label="Scan details form">
          <form className="lead-modal-panel" onSubmit={submitLead}>
            <div className="lead-modal-head">
              <div>
                <span>Vibes DermaScan</span>
                <h2>{leadSubmitted ? "Details saved" : "Enter your details"}</h2>
                <p>{leadSubmitted ? "Your scan report is ready. Download the PDF with all images and analysis details." : "Your scan images and highlighted problem areas will be saved with this record."}</p>
              </div>
              <button type="button" className="lead-modal-close" aria-label="Close details form" onClick={() => setLeadOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            <div className="lead-form-grid">
              <label className="lead-field">
                <span>Name</span>
                <input
                  value={leadForm.name}
                  onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Enter full name"
                  autoComplete="name"
                  disabled={leadSubmitted}
                />
              </label>

              <label className="lead-field">
                <span>Phone</span>
                <div className="phone-input-wrap">
                  <strong>+91</strong>
                  <input
                    value={leadForm.phone}
                    onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    placeholder="10 digit number"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    disabled={leadSubmitted}
                  />
                </div>
              </label>

              <label className="lead-field">
                <span>Email</span>
                <input
                  value={leadForm.email}
                  onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="name@example.com"
                  type="email"
                  autoComplete="email"
                  disabled={leadSubmitted}
                />
              </label>

              <label className="lead-field">
                <span>Gender</span>
                <select
                  value={leadForm.gender}
                  onChange={e => setLeadForm(f => ({ ...f, gender: e.target.value }))}
                  disabled={leadSubmitted}
                >
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>
            </div>

            {leadSuccess && <div className="lead-success">{leadSuccess}</div>}
            {leadError && <div className="lead-error">{leadError}</div>}

            {leadSubmitted ? (
              <button type="button" className="grad-btn lead-submit" disabled={pdfBusy} onClick={downloadPdf}>
                {pdfBusy ? "Preparing PDF..." : "Download PDF Report"}
              </button>
            ) : (
              <button type="submit" className="grad-btn lead-submit" disabled={leadSaving}>
                {leadSaving ? "Saving..." : "Save Details"}
              </button>
            )}
          </form>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 pb-12">

        <Navbar right={
          <div className="result-nav-actions">
            <button
              type="button"
              onClick={leadSubmitted ? downloadPdf : () => { setLeadError(""); setLeadOpen(true); }}
              className="px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-sub)" }}
              disabled={pdfBusy}
            >
              {leadSubmitted ? (pdfBusy ? "Preparing..." : "Download PDF") : "Fill Details"}
            </button>
            <Link href="/scan" className="grad-btn px-4 py-2 rounded-xl text-sm" style={{ background: "var(--grad)", display:"inline-block" }}>
              New Scan
            </Link>
          </div>
        } />

        {/* ── TOP GRID ── */}
        <div className="grid lg:grid-cols-2 gap-5 mb-5">

          {/* Scanner */}
          <div className="glass rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(124,58,237,0.12)", color: "var(--purple)" }}>
                AI Detection View
              </span>
              {image_enhanced && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(251,191,36,0.1)", color: "var(--amber)" }}>
                  ☀ Auto-enhanced
                </span>
              )}
            </div>

            <div className="scanner-wrap" style={{ width: "100%", aspectRatio: "1" }}>
              <div className="scanner-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img(detected_file)} alt="Detected face"
                  className="absolute inset-0 w-full h-full object-cover" style={{ zIndex: 3 }} />
                <button
                  type="button"
                  className="image-preview-hotspot"
                  aria-label="Open detected face image preview"
                  onClick={() => setPreview({ src: img(detected_file), title: "AI Detection View", subtitle: "Full detected face image" })}
                />
                <div className="scan-glow" />
                <div className="scan-line" />
                <div className="scan-grid" />
                <div className="node node-1" /><div className="node node-2" />
                <div className="node node-3" /><div className="node node-4" />
                <div className="scan-status"><span className="status-dot done" /><span>Scan Complete</span></div>
              </div>
            </div>

            <p className="text-xs font-semibold mt-3" style={{ color: "var(--green)" }}>
              ✓ Face detected — AI has screened skin and hair
            </p>
          </div>

          {/* Tabbed analysis */}
          <div className="glass rounded-3xl p-6 flex flex-col">

            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-xl mb-5 flex-shrink-0"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {(["skin", "hair"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={tab === t
                    ? { background: "var(--grad)", color: "white", boxShadow: "0 4px 16px rgba(124,58,237,0.3)" }
                    : { color: "var(--text-muted)", background: "transparent" }}>
                  {t === "skin" ? "○ Skin Analysis" : "♫ Hair Analysis"}
                </button>
              ))}
            </div>

            {/* Skin */}
            {tab === "skin" && (
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-start gap-3 flex-wrap">
                  <h1 className="text-3xl font-black tracking-tight flex-1 grad-text" style={{ lineHeight: 1.1 }}>{r.main_issue}</h1>
                  <SevBadge sev={r.severity} />
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-sub)" }}>{r.summary}</p>
                <ConfBar value={r.confidence} />
                <div className="p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Skin / Texture</div>
                  <div className="text-sm font-black" style={{ color: "var(--text)" }}>{r.skin_tone}</div>
                </div>
                <div className="flex gap-3 p-3.5 rounded-xl" style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.18)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ background: "var(--grad)" }}>AI</div>
                  <p className="text-xs leading-relaxed font-medium" style={{ color: "var(--text-sub)" }}>{r.chat}</p>
                </div>
                <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)", color: "var(--amber)" }}>
                  AI screening only — not a medical diagnosis. Consult a certified dermatologist.
                </div>
                <div className="flex gap-2 mt-auto">
                  <button className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold" style={{ background: "var(--grad)" }}>Book Skin Consult</button>
                  <Link href="/scan" className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-sub)" }}>Scan Again</Link>
                </div>
              </div>
            )}

            {/* Hair */}
            {tab === "hair" && (
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-start gap-3 flex-wrap">
                  <h1 className="text-3xl font-black tracking-tight flex-1 grad-text-2" style={{ lineHeight: 1.1 }}>{r.hair.main_issue}</h1>
                  <SevBadge sev={r.hair.severity} />
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-sub)" }}>{r.hair.summary}</p>
                <ConfBar value={r.hair.confidence} accent="var(--grad)" />
                <div className="p-3 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Hair Type</div>
                  <div className="text-sm font-black" style={{ color: "var(--text)" }}>{r.hair.hair_type}</div>
                </div>
                <div className="flex gap-3 p-3.5 rounded-xl" style={{ background: "rgba(219,39,119,0.08)", border: "1px solid rgba(219,39,119,0.18)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0" style={{ background: "var(--grad)" }}>AI</div>
                  <p className="text-xs leading-relaxed font-medium" style={{ color: "var(--text-sub)" }}>{r.chat}</p>
                </div>
                <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)", color: "var(--amber)" }}>
                  AI screening only — not a diagnosis. Consult a certified trichologist.
                </div>
                <div className="flex gap-2 mt-auto">
                  <button className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold" style={{ background: "var(--grad)" }}>Book Hair Consult</button>
                  <Link href="/scan" className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-sub)" }}>Scan Again</Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── FACE ZONES ── */}
        <div className="glass rounded-3xl p-6 mb-5">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--text)" }}>Face Zone Analysis</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>All {face_regions.length} zones mapped — concerns highlighted</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "var(--green)" }} />Clear</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "var(--amber)" }} />Concern</span>
            </div>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {face_regions.map(z => (
              <button
                key={z.area}
                type="button"
                className={`zone-card image-popup-card ${z.has_issue ? "concern" : "clear"}`}
                onClick={() => setPreview({
                  src: img(z.file),
                  title: z.title,
                  subtitle: z.has_issue ? "Concern highlighted" : "Clear zone",
                })}
              >
                <div style={{ height: 110, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img(z.file)} alt={z.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-2.5 flex items-center justify-between gap-1">
                  <span className="text-xs font-bold" style={{ color: "var(--text)" }}>{z.title}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={z.has_issue
                      ? { background: "rgba(251,191,36,0.12)", color: "var(--amber)" }
                      : { background: "rgba(52,211,153,0.1)", color: "var(--green)" }}>
                    {z.has_issue ? "●" : "✓"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── TIPS ── */}
        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <div className="glass rounded-3xl p-6">
            <h2 className="text-base font-black mb-1" style={{ color: "var(--text)" }}>Skin Care Tips</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Safe suggestions — consult a dermatologist for treatment</p>
            <div className="flex flex-col gap-2">{r.tips.map((t, i) => <Tip key={i} n={i+1} text={t} />)}</div>
          </div>
          <div className="glass rounded-3xl p-6">
            <h2 className="text-base font-black mb-1" style={{ color: "var(--text)" }}>Hair Care Tips</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Safe suggestions — consult a trichologist for treatment</p>
            <div className="flex flex-col gap-2">{r.hair.tips.map((t, i) => <Tip key={i} n={i+1} text={t} accent="var(--grad)" />)}</div>
          </div>
        </div>

        {/* ── HAIR ZONES (conditional) ── */}
        {hair_regions.length > 0 && (
          <div className="glass rounded-3xl p-6 mb-5">
            <h2 className="text-base font-black mb-1" style={{ color: "var(--text)" }}>Hair &amp; Scalp Zones</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Zoomed regions where concerns were detected</p>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              {hair_regions.map(hr => (
                <button
                  key={hr.file}
                  type="button"
                  className="image-popup-card rounded-2xl overflow-hidden"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)" }}
                  onClick={() => setPreview({ src: img(hr.file), title: hr.title, subtitle: hr.concern })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img(hr.file)} alt={hr.title} className="w-full object-cover" style={{ height: 130 }} />
                  <div className="p-3">
                    <div className="text-sm font-bold mb-0.5" style={{ color: "var(--text)" }}>{hr.title}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{hr.concern}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── DOCTORS ── */}
        <div className="glass rounded-3xl p-6 mb-5">
          <div className="text-xs font-bold mb-1 px-2.5 py-1 rounded-full inline-block" style={{ background: "rgba(124,58,237,0.12)", color: "var(--purple)" }}>
            Recommended Next Step
          </div>
          <h2 className="text-lg font-black mt-3 mb-1" style={{ color: "var(--text)" }}>Book a Specialist</h2>
          <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>Vibes has experienced dermatologists and trichologists near you.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {doctors.map(d => (
              <div key={d.name} className="rounded-2xl p-5 transition-all hover:-translate-y-1"
                style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-xl mb-3"
                  style={{ background: "var(--grad)" }}>{d.name[3]}</div>
                <div className="font-black text-sm mb-0.5" style={{ color: "var(--text)" }}>{d.name}</div>
                <div className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{d.type}</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[`★ ${d.rating}`, d.experience, `📍 ${d.location}`].map(l => (
                    <span key={l} className="text-[10px] font-semibold px-2 py-0.5 rounded-lg"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-sub)" }}>{l}</span>
                  ))}
                </div>
                <div className="text-xs mb-3" style={{ color: "var(--text-sub)" }}>
                  Consult: <strong style={{ color: "var(--purple)" }}>{d.fee}</strong>
                </div>
                <button className="w-full py-2 rounded-xl text-xs font-bold text-white" style={{ background: "var(--grad)" }}>Book</button>
              </div>
            ))}
          </div>
        </div>

        {/* ── CHAT ── */}
        <div className="glass rounded-3xl p-6">
          <div className="text-xs font-bold mb-1 px-2.5 py-1 rounded-full inline-block" style={{ background: "rgba(124,58,237,0.12)", color: "var(--purple)" }}>
            AI Assistant
          </div>
          <h2 className="text-lg font-black mt-3 mb-5" style={{ color: "var(--text)" }}>Ask Follow-up Questions</h2>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: "var(--bg-card2)", borderBottom: "1px solid var(--border)" }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black" style={{ background: "var(--grad)" }}>AI</div>
              <span className="text-sm font-bold" style={{ color: "var(--text)" }}>Skin &amp; Hair Assistant</span>
            </div>
            <div ref={chatRef} className="p-4 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 260, background: "var(--bg-card)" }}>
              {msgs.map((m, i) => (
                <div key={i} className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed font-medium ${m.role === "user" ? "ml-auto" : ""}`}
                  style={m.role === "user"
                    ? { background: "var(--grad)", color: "white", borderBottomRightRadius: 4 }
                    : { background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-sub)", borderBottomLeftRadius: 4 }}>
                  {m.text}
                </div>
              ))}
              {chatBusy && (
                <div className="px-3.5 py-2.5 rounded-2xl text-xs max-w-[78%]"
                  style={{ background: "var(--bg-card2)", border: "1px solid var(--border)", color: "var(--text-muted)", borderBottomLeftRadius: 4 }}>
                  Thinking…
                </div>
              )}
            </div>
            <div className="p-3 flex gap-2" style={{ background: "var(--bg-card2)", borderTop: "1px solid var(--border)" }}>
              <input value={chatIn} onChange={e => setChatIn(e.target.value)} onKeyDown={e => e.key === "Enter" && chat()}
                placeholder="Ask about skin or hair…" className="flex-1 px-3.5 py-2.5 rounded-xl text-xs outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text)", fontFamily: "inherit" }} />
              <button onClick={chat} disabled={chatBusy} className="grad-btn px-4 py-2.5 rounded-xl text-xs">Send</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
