"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

type PatientInfo = {
  name: string;
  age: string;
  pregnant: boolean;
  cosmetic_procedure: boolean;
};

const emptyInfo: PatientInfo = {
  name: "",
  age: "",
  pregnant: false,
  cosmetic_procedure: false,
};

function TogglePair({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex gap-3">
      <button type="button" className={`toggle-square ${!value ? "selected" : ""}`} onClick={() => onChange(false)}>
        No
      </button>
      <button type="button" className={`toggle-square ${value ? "selected" : ""}`} onClick={() => onChange(true)}>
        Yes
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [info, setInfo] = useState<PatientInfo>(emptyInfo);

  useEffect(() => {
    const raw = localStorage.getItem("vibes_patient_info");
    if (!raw) return;
    try {
      setInfo({ ...emptyInfo, ...JSON.parse(raw) });
    } catch {
      setInfo(emptyInfo);
    }
  }, []);

  function update<K extends keyof PatientInfo>(key: K, value: PatientInfo[K]) {
    setInfo((current) => ({ ...current, [key]: value }));
  }

  function continueToScan() {
    localStorage.setItem("vibes_patient_info", JSON.stringify(info));
    router.push("/scan");
  }

  return (
    <main className="clinical-page">
      <div className="clinical-shell">
        <Navbar />

        <section className="mx-auto flex min-h-[calc(100vh-104px)] max-w-3xl flex-col justify-center py-10">
          <div className="step-label mb-6">Step 1 of 3</div>
          <h1 className="display-heading">
            A few <span className="accent-italic">quick</span> details about you.
          </h1>

          <div className="mt-14 grid gap-10">
            <label>
              <span className="field-label">Your name</span>
              <input
                className="form-underline"
                value={info.name}
                onChange={(event) => update("name", event.target.value)}
                autoComplete="name"
                aria-label="Your name"
              />
            </label>

            <label>
              <span className="field-label">Your age</span>
              <input
                className="form-underline"
                value={info.age}
                onChange={(event) => update("age", event.target.value.replace(/\D/g, "").slice(0, 3))}
                inputMode="numeric"
                autoComplete="off"
                aria-label="Your age"
              />
            </label>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="field-label">Are you currently pregnant or breastfeeding?</div>
              <TogglePair value={info.pregnant} onChange={(next) => update("pregnant", next)} />
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="field-label">Any cosmetic procedure in the last 4 weeks?</div>
              <TogglePair value={info.cosmetic_procedure} onChange={(next) => update("cosmetic_procedure", next)} />
            </div>
          </div>

          <footer className="mt-16 flex items-center justify-between border-t pt-7" style={{ borderColor: "var(--border)" }}>
            <Link href="/" className="text-link">
              ← Back
            </Link>
            <button type="button" className="text-link primary" onClick={continueToScan}>
              Continue →
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
