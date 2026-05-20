"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const uploadUrl = (file: string) => `${API}/uploads/${file}`;

const PARAMETER_LABELS: Record<string, string> = {
  pigmentation: "Pigmentation",
  fine_lines: "Fine lines",
  texture: "Texture",
  pores: "Pores",
  acne: "Acne",
  scars_marks: "Scars/marks",
  redness: "Redness",
  dark_circles: "Dark circles",
  puffiness: "Puffiness",
  hydration: "Hydration",
  firmness: "Firmness",
  dullness: "Dullness",
};

const PARAMETER_KEYS = Object.keys(PARAMETER_LABELS);

type Hair = {
  main_issue?: string;
  severity?: string;
  confidence?: number;
  hair_type?: string;
  summary?: string;
  tips?: string[];
  problem_areas?: string[];
};

type LegacyResult = {
  analysis_source?: string;
  main_issue?: string;
  severity?: string;
  confidence?: number;
  skin_tone?: string;
  summary?: string;
  tips?: string[];
  chat?: string;
  problem_areas?: string[];
  hair?: Hair;
  skin_score?: number;
  skin_age?: number;
  summary_quote?: string;
  parameters?: Record<string, number>;
  top_concerns?: Concern[];
  treatment_plan?: Treatment[];
  home_care?: HomeCare[];
  concern_count?: number;
  ai_insight?: string;
};

type Concern = {
  name: string;
  score: number;
  description: string;
  severity: string;
};

type Treatment = {
  name: string;
  details: string;
  type: "PRIMARY" | "SUPPORTIVE" | string;
};

type HomeCare = {
  emoji: string;
  name: string;
  instruction: string;
};

type Data = {
  result?: LegacyResult;
  analysis_source?: string;
  image_file?: string;
  face_file?: string;
  detected_file?: string;
  skin_score?: number;
  skin_age?: number;
  summary_quote?: string;
  parameters?: Record<string, number>;
  top_concerns?: Concern[];
  treatment_plan?: Treatment[];
  home_care?: HomeCare[];
  concern_count?: number;
  ai_insight?: string;
  [key: string]: unknown;
};

type PatientInfo = {
  name?: string;
  age?: string;
  pregnant?: boolean;
  cosmetic_procedure?: boolean;
};

type LeadForm = {
  name: string;
  phone: string;
  email: string;
  gender: string;
};

const defaultHomeCare: HomeCare[] = [
  { emoji: "🛡️", name: "SPF 50", instruction: "Apply every morning and reapply every 2-3 hours when outdoors." },
  { emoji: "💧", name: "Hyaluronic acid serum", instruction: "Use on damp skin before moisturiser for hydration support." },
  { emoji: "🍊", name: "Vitamin C 10%", instruction: "Apply in the morning under sunscreen to support brightness." },
  { emoji: "🌙", name: "Retinol 0.3%", instruction: "Use at night 2-3 times weekly, avoiding pregnancy or breastfeeding." },
];

function scoreSeverity(score: number) {
  if (score >= 85) return "EXCELLENT";
  if (score >= 70) return "GOOD";
  if (score >= 55) return "MILD";
  return "MODERATE";
}

function severityClass(label: string) {
  const key = label.toLowerCase();
  if (key.includes("excellent")) return "severity-excellent";
  if (key.includes("good")) return "severity-good";
  if (key.includes("mild")) return "severity-mild";
  return "severity-moderate";
}

function clampScore(value: unknown, fallback: number) {
  const num = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normaliseParameters(data: Data | null) {
  const raw = data?.parameters ?? data?.result?.parameters ?? {};
  const legacyConfidence = clampScore(data?.result?.confidence, 64);
  return Object.fromEntries(
    PARAMETER_KEYS.map((key, index) => [key, clampScore(raw[key], Math.max(42, Math.min(88, legacyConfidence - 10 + index * 3)))])
  ) as Record<string, number>;
}

function fallbackConcerns(parameters: Record<string, number>, data: Data | null): Concern[] {
  const provided = data?.top_concerns ?? data?.result?.top_concerns;
  if (Array.isArray(provided) && provided.length) return provided.slice(0, 3);
  return Object.entries(parameters)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([key, score]) => ({
      name: PARAMETER_LABELS[key] ?? key,
      score,
      severity: scoreSeverity(score),
      description: `${PARAMETER_LABELS[key] ?? key} scored ${score}/100 and should be reviewed in your consultation plan.`,
    }));
}

function concernKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function concernLabel(name: string) {
  const key = concernKey(name);
  return PARAMETER_LABELS[key] ?? name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function concernPoint(name: string, index: number) {
  const key = concernKey(name);
  if (key.includes("dark_circle") || key.includes("puffiness")) return { x: index % 2 ? 57 : 43, y: 45, blobW: 8, blobH: 5 };
  if (key.includes("fine_line")) return { x: 50, y: 34, blobW: 13, blobH: 4 };
  if (key.includes("pigmentation") || key.includes("dull")) return { x: index % 2 ? 40 : 60, y: 55, blobW: 10, blobH: 8 };
  if (key.includes("acne") || key.includes("scar") || key.includes("mark") || key.includes("redness")) return { x: index % 2 ? 60 : 40, y: 62, blobW: 9, blobH: 8 };
  if (key.includes("pores") || key.includes("texture")) return { x: 50, y: 56, blobW: 10, blobH: 9 };
  if (key.includes("hydration") || key.includes("firmness")) return { x: 50, y: 70, blobW: 11, blobH: 7 };
  return { x: [43, 57, 50, 40][index] ?? 50, y: [45, 45, 56, 64][index] ?? 56, blobW: 9, blobH: 7 };
}

function labelSlot(index: number) {
  return [
    { x: 28, y: 30, anchor: "end" as const },
    { x: 72, y: 31, anchor: "start" as const },
    { x: 27, y: 67, anchor: "end" as const },
    { x: 73, y: 67, anchor: "start" as const },
  ][index] ?? { x: 72, y: 67, anchor: "start" as const };
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 41;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  return (
    <div className="relative h-28 w-28">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e8e4df" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-serif-display text-4xl font-semibold leading-none" style={{ color: "var(--text)" }}>{score}</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--text-sub)" }}>of 100</div>
      </div>
    </div>
  );
}

function HeatMap({ photo, concerns, insight }: { photo: string; concerns: Concern[]; insight: string }) {
  const topFour = concerns.filter((concern) => concern.score < 75).slice(0, 4);
  const visibleConcerns = topFour.length ? topFour : concerns.slice(0, 1);

  return (
    <div className="clinical-card p-4 md:p-5">
      <div className="relative mx-auto aspect-[2.65] w-full max-w-5xl overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="Heat map face" className="absolute left-1/2 top-1/2 h-[92%] w-[31%] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover" />
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
          {visibleConcerns.map((concern, index) => {
            const point = concernPoint(concern.name, index);
            const slot = labelSlot(index);
            const needsAttention = concern.score < 60;
            const markerColor = needsAttention ? "#b5541c" : "#d9a12a";
            return (
              <g key={`${concern.name}-${index}`}>
                <ellipse cx={point.x} cy={point.y} rx={point.blobW} ry={point.blobH} fill={markerColor} opacity="0.2" />
                <line x1={slot.x} y1={slot.y + 4} x2={point.x} y2={point.y} stroke="#b5541c" strokeWidth="0.5" />
                <circle cx={point.x} cy={point.y} r="1.8" fill="#d9a12a" stroke="#b5541c" strokeWidth="0.65" />
                <text x={slot.x} y={slot.y} textAnchor={slot.anchor} fontSize="2.25" fontWeight="700" fill="#1a1a1a">{concernLabel(concern.name)}</text>
                <text x={slot.x} y={slot.y + 3.8} textAnchor={slot.anchor} fontSize="1.9" fontWeight="800" fill="#b5541c">
                  SCORE {concern.score}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-5 text-xs font-semibold" style={{ color: "var(--text-sub)" }}>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d9a12a" }} /> Moderate concern</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /> Needs attention</span>
      </div>
      <p className="mt-3 text-center text-sm leading-6" style={{ color: "var(--text-sub)" }}>
        <strong style={{ color: "var(--text)" }}>AI insight:</strong> {insight}
      </p>
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [patient, setPatient] = useState<PatientInfo>({});
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [leadSuccess, setLeadSuccess] = useState("");
  const [leadForm, setLeadForm] = useState<LeadForm>({ name: "", phone: "", email: "", gender: "" });

  useEffect(() => {
    const raw = localStorage.getItem("vibes_result");
    if (!raw) {
      router.push("/onboarding");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Data;
      const source = parsed.analysis_source ?? parsed.result?.analysis_source;
      if (source !== "openai") {
        localStorage.removeItem("vibes_result");
        router.push("/scan");
        return;
      }
      setData(parsed);
    } catch {
      router.push("/onboarding");
    }

    const patientRaw = localStorage.getItem("vibes_patient_info");
    if (patientRaw) {
      try {
        const parsed = JSON.parse(patientRaw) as PatientInfo;
        setPatient(parsed);
        setLeadForm((form) => ({ ...form, name: parsed.name ?? form.name }));
      } catch {
        setPatient({});
      }
    }
  }, [router]);

  useEffect(() => {
    if (!data?.image_file) return;
    const saved = localStorage.getItem(`vibes_lead_${data.image_file}`);
    if (!saved) return;
    try {
      setLeadForm(JSON.parse(saved) as LeadForm);
      setLeadSubmitted(true);
    } catch {
      setLeadSubmitted(false);
    }
  }, [data]);

  const parameters = useMemo(() => normaliseParameters(data), [data]);
  const concerns = useMemo(() => fallbackConcerns(parameters, data), [parameters, data]);

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <div className="section-kicker">Loading report</div>
      </main>
    );
  }

  const report = data;
  const originalPhoto = localStorage.getItem("vibes_photo") || (report.image_file ? uploadUrl(report.image_file) : "");
  const reportPhoto = report.face_file ? uploadUrl(report.face_file) : originalPhoto;
  const age = Number.parseInt(patient.age ?? "", 10) || 32;
  const skinScore = clampScore(report.skin_score ?? report.result?.skin_score, clampScore(report.result?.confidence, 63));
  const skinAge = clampScore(report.skin_age ?? report.result?.skin_age, age + Math.round((72 - skinScore) / 4));
  const scanDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
  const summaryQuote =
    report.summary_quote ??
    report.result?.summary_quote ??
    report.result?.summary ??
    "Indicative analysis based on visible features. A few areas warrant attention - see the detailed breakdown below.";
  const treatmentPlan =
    report.treatment_plan ??
    report.result?.treatment_plan ??
    [
      { name: "VIBES Skin Clarity Protocol", details: "Targets pigmentation, texture and pores across 4-6 dermatologist-guided sessions.", type: "PRIMARY" },
      { name: "Hydration Barrier Support", details: "Supportive treatment to improve visible dullness, hydration and skin comfort.", type: "SUPPORTIVE" },
      { name: "Under-eye Brightening Review", details: "Focused consultation for dark circles, puffiness and fine-line support.", type: "SUPPORTIVE" },
    ];
  const homeCare = report.home_care ?? report.result?.home_care ?? defaultHomeCare;
  const concernCount = report.concern_count ?? report.result?.concern_count ?? Object.values(parameters).filter((score) => score < 70).length;
  const aiInsight =
    report.ai_insight ??
    report.result?.ai_insight ??
    `${concernCount} areas requiring intervention detected across your facial zones. Markers indicate the approximate location of each concern; severity is colour-coded above.`;

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (leadSaving) return;

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
        body: JSON.stringify({ name, phone, email, gender, data: report }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail ?? "Could not save details.");
      const savedForm = { name, phone, email, gender };
      if (report.image_file) localStorage.setItem(`vibes_lead_${report.image_file}`, JSON.stringify(savedForm));
      setLeadForm(savedForm);
      setLeadSubmitted(true);
      setLeadSuccess("Details saved. Your PDF report is ready to download.");
    } catch (event: unknown) {
      setLeadError(event instanceof Error ? event.message : "Could not save details.");
    } finally {
      setLeadSaving(false);
    }
  }

  async function downloadPdf() {
    if (pdfBusy) return;

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
        body: JSON.stringify({ name, phone, email, gender, data: report }),
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
    } catch (event: unknown) {
      setLeadOpen(true);
      setLeadError(event instanceof Error ? event.message : "Could not generate PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  function newScan() {
    localStorage.removeItem("vibes_result");
    localStorage.removeItem("vibes_photo");
    router.push("/onboarding");
  }

  return (
    <main className="clinical-page">
      {leadOpen && (
        <div className="lead-modal-backdrop" role="dialog" aria-modal="true" aria-label="Scan details form">
          <form className="lead-modal-panel" onSubmit={submitLead}>
            <div className="lead-modal-head">
              <div>
                <span>Vibes DermaScan</span>
                <h2>{leadSubmitted ? "Details saved" : "Enter your details"}</h2>
                <p>{leadSubmitted ? "Your scan report is ready to download." : "Complete these details to save your consultation lead and download the PDF."}</p>
              </div>
              <button type="button" className="lead-modal-close" aria-label="Close details form" onClick={() => setLeadOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="lead-form-grid">
              <label className="lead-field">
                <span>Name</span>
                <input value={leadForm.name} onChange={(event) => setLeadForm((form) => ({ ...form, name: event.target.value }))} autoComplete="name" />
              </label>
              <label className="lead-field">
                <span>Phone</span>
                <div className="phone-input-wrap">
                  <strong>+91</strong>
                  <input value={leadForm.phone} onChange={(event) => setLeadForm((form) => ({ ...form, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))} inputMode="numeric" autoComplete="tel-national" />
                </div>
              </label>
              <label className="lead-field">
                <span>Email</span>
                <input value={leadForm.email} onChange={(event) => setLeadForm((form) => ({ ...form, email: event.target.value }))} type="email" autoComplete="email" />
              </label>
              <label className="lead-field">
                <span>Gender</span>
                <select value={leadForm.gender} onChange={(event) => setLeadForm((form) => ({ ...form, gender: event.target.value }))}>
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

      <div className="clinical-shell pb-12">
        <Navbar
          right={
            <div className="flex items-center gap-5">
              <button type="button" className="text-link" onClick={leadSubmitted ? downloadPdf : () => { setLeadError(""); setLeadOpen(true); }}>
                {pdfBusy ? "Preparing" : "Print"}
              </button>
              <button type="button" className="text-link primary" onClick={newScan}>
                New Scan
              </button>
            </div>
          }
        />

        <section className="clinical-card grid gap-5 p-4 md:grid-cols-[auto_1fr_auto] md:items-center md:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={reportPhoto} alt="Scan thumbnail" className="h-20 w-20 rounded-full object-cover" />
          <div>
            <div className="section-kicker">Analysis report</div>
            <div className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>
              Age {age} · {scanDate}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <ScoreGauge score={skinScore} />
            <div>
              <div className="section-kicker">Skin age vs actual</div>
              <div className="mt-3 grid gap-1 text-sm font-semibold" style={{ color: "var(--text-sub)" }}>
                <span>Actual: <strong style={{ color: "var(--text)" }}>{age}</strong></span>
                <span>Skin: <strong style={{ color: "var(--accent)" }}>{skinAge}</strong></span>
              </div>
            </div>
          </div>
        </section>

        <blockquote className="mt-8 border-l-2 py-2 pl-5 font-serif-display text-2xl italic leading-tight md:text-3xl" style={{ borderColor: "var(--accent)", color: "var(--text)" }}>
          "{summaryQuote}"
        </blockquote>

        <section className="report-section">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="section-title">Detected zones of concern</h2>
            <div className="section-kicker">Heat map</div>
          </div>
          <HeatMap photo={reportPhoto} concerns={concerns} insight={aiInsight} />
        </section>

        <section className="report-section">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="section-title">Twelve parameters analysed</h2>
            <div className="section-kicker">Detailed scores</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PARAMETER_KEYS.map((key) => {
              const score = parameters[key];
              const severity = scoreSeverity(score);
              return (
                <div key={key} className="clinical-card flex items-center justify-between gap-4 p-4">
                  <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>{PARAMETER_LABELS[key]}</h3>
                  <div className="text-right">
                    <div className="font-serif-display text-3xl leading-none" style={{ color: "var(--text)" }}>{score}</div>
                    <div className={`mt-1 text-[10px] font-bold uppercase tracking-[0.14em] ${severityClass(severity)}`}>{severity}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="report-section">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="section-title">Top concerns to address</h2>
            <div className="section-kicker">Priority focus</div>
          </div>
          <div className="grid gap-4">
            {concerns.slice(0, 3).map((concern, index) => (
              <div key={`${concern.name}-${index}`} className="clinical-card grid gap-4 p-4 md:grid-cols-[70px_1fr_auto] md:items-center">
                <div className="font-serif-display text-3xl italic leading-none" style={{ color: "var(--accent)" }}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>{concern.name}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-sub)" }}>
                    Score {concern.score}. {concern.description}
                  </p>
                </div>
                <div className={`text-xs font-bold uppercase tracking-[0.14em] ${severityClass(concern.severity)}`}>
                  {concern.severity}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="report-section">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="section-title">Your VIBES treatment plan</h2>
            <div className="section-kicker">Doctor-curated</div>
          </div>
          <div className="grid gap-4">
            {treatmentPlan.map((treatment, index) => (
              <div key={`${treatment.name}-${index}`} className="border-l-2 bg-white p-5" style={{ borderColor: "var(--accent)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>{treatment.name}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-sub)" }}>{treatment.details}</p>
                  </div>
                  <span className="section-kicker whitespace-nowrap">{treatment.type}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="report-section">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="section-title">Daily home care</h2>
            <div className="section-kicker">Maintain your results</div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {homeCare.slice(0, 4).map((item) => (
              <div key={item.name} className="clinical-card flex gap-4 p-5">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center border text-sm font-bold" style={{ borderColor: "var(--border)", color: "var(--accent)" }}>
                  {item.emoji}
                </div>
                <div>
                  <h3 className="text-base font-bold" style={{ color: "var(--text)" }}>{item.name}</h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-sub)" }}>{item.instruction}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 bg-[#f1efec] p-7 md:flex md:items-center md:justify-between md:gap-10 md:p-10">
          <div>
            <h2 className="font-serif-display text-4xl font-semibold leading-none text-[#bcb5ad] md:text-5xl">Book your free consultation</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7" style={{ color: "var(--text-sub)" }}>
              Review this AI assessment with a VIBES dermatologist and confirm the right treatment plan for your skin.
            </p>
          </div>
          <button type="button" className="grad-btn mt-8 min-h-12 rounded-full px-8 md:mt-0" onClick={() => { setLeadError(""); setLeadOpen(true); }}>
            Book Now
          </button>
        </section>

        <p className="mt-8 text-xs leading-6" style={{ color: "var(--text-muted)" }}>
          This AI assessment is indicative and not a medical diagnosis. Final treatment plan is confirmed by a VIBES dermatologist after in-clinic consultation.
        </p>
      </div>
    </main>
  );
}
