import Link from "next/link";
import Navbar from "@/components/Navbar";

const features = [
  ["01", "Guided capture", "A single clean selfie is enough to begin your VIBES AI skin assessment."],
  ["02", "Clinical scoring", "Twelve visible skin parameters are scored and prioritised for review."],
  ["03", "Doctor-curated next steps", "A treatment and home-care plan is prepared for dermatologist confirmation."],
];

export default function Home() {
  return (
    <main className="clinical-page">
      <div className="clinical-shell">
        <Navbar
          right={
            <Link href="/onboarding" className="text-link primary">
              Start Free Scan
            </Link>
          }
        />

        <section className="grid min-h-[calc(100vh-96px)] items-center gap-12 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="section-kicker mb-6">AI Skin Analysis</div>
            <h1 className="display-heading max-w-3xl">
              Your skin, <span className="accent-italic">seen</span> clearly.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8" style={{ color: "var(--text-sub)" }}>
              A clean, clinic-inspired scan flow that maps visible skin concerns and prepares a VIBES treatment plan for dermatologist review.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <Link href="/onboarding" className="text-link primary">
                Start Free Scan →
              </Link>
              <a href="#overview" className="text-link">
                View Overview
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[430px]">
            <div className="aspect-[4/5] overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div
                className="h-full w-full pb-24"
                style={{
                  background:
                    "radial-gradient(circle at 50% 36%, rgba(181,84,28,0.14), transparent 30%), linear-gradient(180deg, #fff 0%, #f9f7f4 100%)",
                }}
              >
                <svg viewBox="0 0 360 450" className="h-full w-full" role="img" aria-label="VIBES clinical face scan illustration">
                  <ellipse cx="180" cy="208" rx="86" ry="122" fill="#fffaf6" stroke="#d9d1c8" strokeWidth="2" />
                  <path d="M126 172c18-14 39-14 54-3M180 169c16-11 38-10 54 3" fill="none" stroke="#bcaea1" strokeWidth="4" strokeLinecap="round" />
                  <circle cx="153" cy="199" r="5" fill="#1a1a1a" />
                  <circle cx="207" cy="199" r="5" fill="#1a1a1a" />
                  <path d="M176 210c-6 24-10 38 9 39" fill="none" stroke="#bcaea1" strokeWidth="3" strokeLinecap="round" />
                  <path d="M151 284c20 14 42 14 60 0" fill="none" stroke="#b5541c" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="129" cy="238" r="18" fill="#b5541c" opacity="0.13" />
                  <circle cx="232" cy="235" r="22" fill="#b5541c" opacity="0.12" />
                  <circle cx="184" cy="158" r="28" fill="#d9a12a" opacity="0.14" />
                  <path d="M70 130h56M234 130h56M70 320h56M234 320h56" stroke="#b5541c" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="absolute bottom-5 left-6 right-6 clinical-card p-5">
                <div className="section-kicker">Scan Preview</div>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-sub)" }}>
                  Personal details, photo capture, and report in three focused steps.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="overview" className="grid gap-4 pb-20 md:grid-cols-3">
          {features.map(([n, title, desc]) => (
            <div key={title} className="clinical-card p-6">
              <div className="font-serif-display text-4xl italic" style={{ color: "var(--accent)" }}>
                {n}
              </div>
              <h2 className="mt-5 text-base font-bold" style={{ color: "var(--text)" }}>{title}</h2>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-sub)" }}>{desc}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
