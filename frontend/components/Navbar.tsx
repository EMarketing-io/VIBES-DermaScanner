"use client";

import Link from "next/link";

interface NavbarProps {
  right?: React.ReactNode;
}

export default function Navbar({ right }: NavbarProps) {
  return (
    <nav className="flex items-center justify-between py-6">
      <Link href="/" className="flex items-center gap-3 no-underline" aria-label="VIBES DermaScan home">
        <div className="font-serif-display text-2xl font-semibold leading-none" style={{ color: "var(--text)" }}>
          VIBES
        </div>
        <div className="hidden sm:block h-5 w-px" style={{ background: "var(--border)" }} />
        <div className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--text-sub)" }}>
          DermaScan
        </div>
      </Link>

      <div className="flex items-center gap-4">
        {right}
      </div>
    </nav>
  );
}
