import Link from "next/link";
import Navbar from "@/components/Navbar";

const features = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
      </svg>
    ),
    title: "3-Angle Capture",
    desc: "Guided front, left and right shots so the AI sees every skin zone.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
    title: "5 Face Zones",
    desc: "Forehead, nose, both cheeks and chin — always extracted and shown.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Skin + Hair AI",
    desc: "GPT-4 Vision reads skin tone, texture, hair type and density.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Doctor CTA",
    desc: "Matched to real specialists in your city with upfront consultation fees.",
  },
];

export default function Home() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="max-w-7xl mx-auto px-6">

        {/* NAV */}
        <Navbar
          right={
            <Link
              href="/scan"
              className="px-5 py-2 rounded-xl text-white text-sm font-bold"
              style={{ background: "var(--grad)", boxShadow: "0 4px 20px rgba(124,58,237,0.35)" }}
            >
              Start Scan
            </Link>
          }
        />

        {/* HERO */}
        <section className="grid lg:grid-cols-2 gap-12 items-center pt-10 pb-20">
          {/* Left */}
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-6"
              style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)", color: "var(--purple)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--purple)" }} />
              AI Powered · GPT-4 Vision
            </div>

            <h1
              className="text-5xl font-black leading-[1.08] tracking-[-0.03em] mb-6"
              style={{ color: "var(--text)" }}
            >
              Your skin,{" "}
              <span className="grad-text">seen clearly</span>
              <br />by AI.
            </h1>

            <p className="text-lg leading-relaxed mb-10" style={{ color: "var(--text-sub)" }}>
              Capture three angles. Get an instant AI scan of your skin zones, hair health, and
              personalised care tips — then book the right specialist.
            </p>

            <div className="flex items-center gap-4 flex-wrap mb-14">
              <Link
                href="/scan"
                className="px-7 py-3.5 rounded-2xl text-white font-bold text-sm"
                style={{ background: "var(--grad)", boxShadow: "0 8px 32px rgba(124,58,237,0.4)" }}
              >
                Start AI Face Scan
              </Link>
              <a href="#features" className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                How it works ↓
              </a>
            </div>

            {/* Stats */}
            <div className="flex gap-8">
              {[
                { n: "5", label: "Face zones mapped" },
                { n: "3", label: "Angles captured" },
                { n: "AI", label: "Skin + hair scan" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-black grad-text">{s.n}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: scanner */}
          <div className="flex justify-center">
            <div className="scanner-wrap" style={{ width: 340, height: 340 }}>
              <div className="scanner-inner">
                <div className="scan-glow" />
                <div className="scan-grid" />
                <div className="scan-line" />

                {/* Demo face */}
                <svg className="demo-face-svg" width="170" height="210" viewBox="0 0 170 210" fill="none">
                  <ellipse cx="85" cy="105" rx="60" ry="82" stroke="rgba(139,92,246,0.45)" strokeWidth="1.5"/>
                  <ellipse cx="62" cy="82" rx="10" ry="5" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2"/>
                  <ellipse cx="108" cy="82" rx="10" ry="5" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2"/>
                  <path d="M79 105 Q85 112 91 105" stroke="rgba(139,92,246,0.3)" strokeWidth="1.2"/>
                  <path d="M70 138 Q85 148 100 138" stroke="rgba(139,92,246,0.4)" strokeWidth="1.2"/>
                </svg>

                <div className="node node-1" /><div className="node node-2" />
                <div className="node node-3" /><div className="node node-4" />

                {/* Corner accents */}
                <div className="corner-accent corner-tl" />
                <div className="corner-accent corner-tr" />
                <div className="corner-accent corner-bl" />
                <div className="corner-accent corner-br" />

                <div className="scan-status">
                  <span className="status-dot loading" />
                  <span>3D AI Face Scan</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="pb-24">
          <div
            className="text-xs font-bold text-center mb-3"
            style={{ color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            What you get
          </div>
          <h2
            className="text-2xl font-black text-center mb-10"
            style={{ color: "var(--text)" }}
          >
            Everything in one scan
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="glass rounded-2xl p-6 group hover:-translate-y-1 transition-transform"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(124,58,237,0.12)", color: "var(--purple)" }}
                >
                  {f.icon}
                </div>
                <h3 className="font-black text-sm mb-2" style={{ color: "var(--text)" }}>{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
