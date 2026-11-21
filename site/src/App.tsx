import type { ReactNode } from "react";
import TerminalTypewriter from "./components/TerminalTypewriter";

const REPO = "https://github.com/amlkr/topos";
const STUDIO = "https://unions-metals-shortly-skill.trycloudflare.com";

const PRIMITIVES = ["persons", "enrolments", "payments", "communication", "content"] as const;

function FoldMark() {
  // Decorative: the metaphor is stated in words right above it (WIG review
  // 2026-11-21 — an announced aria-label here would only add noise).
  return (
    <svg viewBox="0 0 220 120" className="h-full w-full" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="1.5">
        <ellipse cx="60" cy="62" rx="34" ry="40" stroke="#6366f1" opacity="0.9" />
        <path d="M92 48c14 2 16 24 0 28" stroke="#6366f1" opacity="0.9" />
        <ellipse cx="60" cy="30" rx="34" ry="10" stroke="#818cf8" opacity="0.7" />
        <path d="M118 60h24" stroke="#34d399" strokeWidth="2" markerEnd="url(#arr)" />
        <ellipse cx="168" cy="60" rx="36" ry="26" stroke="#34d399" opacity="0.9" />
        <ellipse cx="168" cy="60" rx="13" ry="9" stroke="#f4b942" opacity="0.9" />
        <defs>
          <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0 0L8 4L0 8" fill="none" stroke="#34d399" strokeWidth="1.5" />
          </marker>
        </defs>
      </g>
    </svg>
  );
}

function Section({ id, label, children, className = "" }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-5 py-20 sm:py-28 ${className}`}>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-indigo-soft">{label}</p>
      {children}
    </section>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-indigo-brand focus:px-4 focus:py-2 focus:text-chalk">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-edge/70 bg-night/85 backdrop-blur-xl">
        <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex min-h-11 items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-indigo-brand text-sm font-black text-night">∮</span>
            topos<span className="text-emerald-soft">.</span>
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="#contract" className="hidden min-h-11 items-center px-2 text-sm text-mist transition-colors hover:text-chalk sm:inline-flex">Contract</a>
            <a href="#studio" className="hidden min-h-11 items-center px-2 text-sm text-mist transition-colors hover:text-chalk sm:inline-flex">Studio</a>
            <a href="#pricing" className="hidden min-h-11 items-center px-2 text-sm text-mist transition-colors hover:text-chalk sm:inline-flex">Pricing</a>
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-indigo-mid px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-deep sm:px-5">
              Read the contract
            </a>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* HERO */}
        <div className="fold-grid relative overflow-hidden border-b border-edge">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.18),transparent)]" aria-hidden />
          <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-5 py-24 text-center sm:py-32">
            <p className="rounded-full border border-edge bg-surface px-4 py-1.5 font-mono text-xs text-mist">
              open source · AGPL-3.0 · one contract, every school
            </p>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
              Each school, <span className="text-indigo-soft">its own place.</span>
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
              Topos is a <strong className="text-chalk">fold, not a mold</strong>. One engine, one contract,
              and every international school bends it into its own shape with a single manifest —
              admissions, portal, blog and marketing included. No tear, no fork.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={STUDIO} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-cta px-7 py-3 text-[15px] font-bold text-night transition-transform hover:scale-[1.02] active:scale-[0.98]">
                Open the live studio ↗
              </a>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full border border-edge bg-surface px-7 py-3 text-[15px] font-semibold text-chalk transition-colors hover:border-indigo-soft">
                View on GitHub
              </a>
            </div>
            <p className="font-mono text-xs text-mist">the studio is a temporary tunnel from a laptop in Chiang Mai — proof, not infrastructure</p>
            <div className="mt-4 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-card border border-edge bg-edge sm:grid-cols-4" role="list">
              {[["2", "schools, one engine"], ["16/16", "contract tests green"], ["5", "invariant primitives"], ["AGPL", "the invariant is shared"]].map(([n, l]) => (
                <div key={l} className="flex flex-col items-center gap-1 bg-night px-3 py-5">
                  <dt className="font-display text-xl font-extrabold text-emerald-soft sm:text-2xl">{n}</dt>
                  <dd className="text-center text-xs text-mist">{l}</dd>
                </div>
              ))}
            </div>
            <div className="h-28 w-56 sm:h-32 sm:w-72"><FoldMark /></div>
          </section>
        </div>

        {/* MANIFEST */}
        <Section id="contract" label="the contract">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">A school, in forty lines of YAML.</h2>
              <p className="mt-4 leading-relaxed text-mist">
                The manifest is the product. Identity, brand, topology, programs, prices, funnels,
                consent regime — declared once, validated always. Five primitives are{" "}
                <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-sm text-amber-fold">const</code>:
                they are the substance every school shares. Everything else is vocabulary.
              </p>
              <ul className="mt-6 space-y-2">
                {PRIMITIVES.map((p) => (
                  <li key={p} className="flex items-center gap-3 font-mono text-sm text-chalk">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-soft" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
              <p className="mt-6 rounded-card border border-edge bg-surface p-4 text-sm leading-relaxed text-mist">
                <strong className="text-chalk">The rule of Thom:</strong> if it cannot be expressed in the
                manifest, it is not a feature — it is a tear.
              </p>
            </div>
            <div className="overflow-x-auto rounded-card border border-edge bg-[#0d0c17] p-5 font-mono text-[13px] leading-relaxed">
              <pre className="text-mist" translate="no">{`apiVersion: topos/v0
kind: School
identity:
  name: Lotus Valley International School
  locales: [en, th, zh]
topology:
  entity: activity        `}<span className="text-mist/80"># or course, or camp</span>{`
  groupsBy: term
programs:
  - code: LVIS-ROBOTICS-TERM
    name: Robotics & Making
    price: { amount: 9500, currency: THB,
             unit: term, published: true }
    door: /enrol/robotics
operations:
  primitives: [persons, enrolments, payments,
               communication, content]`}</pre>
            </div>
          </div>
        </Section>

        {/* TERMINAL */}
        <Section id="engine" label="the engine">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Three commands to a school.</h2>
            <p className="mx-auto mt-3 mb-10 max-w-xl text-mist">Every output below was copied from a real run — the tests that back them are in the repo.</p>
          </div>
          <TerminalTypewriter />
        </Section>

        {/* BENTO */}
        <Section id="studio" label="what is inside">
          <h2 className="mb-10 text-3xl font-extrabold tracking-tight sm:text-4xl">Small surface, deep contract.</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["The manifest IS the site", "Render produces home, one enrolment door per program, and the admissions desk. Change the YAML, the school bends.", "bg-indigo-brand/10 border-indigo-brand/30"],
              ["Honest by construction", "Unpublished prices appear nowhere. Demo forms say they are demos. The studio banner says drafts never touch disk — and grep proves it.", "bg-emerald-cta/10 border-emerald-cta/30"],
              ["Topos Studio", "The SaaS surface: every school live-rendered from its manifest, a YAML editor with instant preview, and a Fold button that refuses lies with the exact problem list.", "bg-amber-fold/10 border-amber-fold/30"],
              ["Two shapes, one code", "Lotus folds activities by term; Aurora folds courses by level, bilingual en·zh, GDPR. Same engine, zero forks.", ""],
              ["The contract bites", "16 tests including fixtures that MUST fail: invented prices, duplicate codes, fake mailboxes, broken primitives. CI runs them on every push.", ""],
              ["Open where it counts", "Engine and spec are AGPL: the invariant is everyone’s. What is operated — hosting, connectors, curriculum packs — is what pays.", ""],
            ].map(([title, body, cls]) => (
              <article key={title} className={`rounded-card border border-edge bg-surface p-6 ${cls}`}>
                <h3 className="font-bold text-chalk">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist">{body}</p>
              </article>
            ))}
          </div>
        </Section>

        {/* MANIFESTO */}
        <div className="border-y border-edge bg-surface/50">
          <section aria-label="The Topos manifesto" className="mx-auto max-w-4xl px-5 py-20 text-center sm:py-24">
            <p className="font-display text-xl font-semibold leading-relaxed text-chalk sm:text-2xl">
              Topos is a fold, not a mold.<br />
              Every school is a manifold: locally its own coordinates, globally one substance.<br />
              The manifest is the contract; the code never breaks a topology, it bends with it.<br />
              What is invariant is shared freely; what is operated is what pays.<br />
              <span className="text-emerald-soft">You are not a tenant. You are a co-author.</span>
            </p>
          </section>
        </div>

        {/* PRICING */}
        <Section id="pricing" label="pricing">
          <h2 className="mb-10 text-3xl font-extrabold tracking-tight sm:text-4xl">Own the code. Rent the operations.</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <article className="flex flex-col rounded-card border border-edge bg-surface p-6">
              <h3 className="font-bold">Self-host</h3>
              <p className="mt-1 font-display text-3xl font-extrabold">$0<span className="text-sm font-normal text-mist"> / forever</span></p>
              <ul className="mt-4 flex-1 list-disc space-y-1 pl-5 text-sm text-mist">
                <li>Full engine + spec (AGPL)</li>
                <li>Your servers, your data</li>
                <li>Community issues</li>
              </ul>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-edge px-5 text-sm font-semibold hover:border-indigo-soft">Clone it</a>
            </article>
            <article className="relative flex flex-col rounded-card border border-emerald-cta/50 bg-surface p-6">
              <span className="absolute -top-3 right-6 rounded-full bg-emerald-cta px-3 py-0.5 text-xs font-bold text-night">pilot seats</span>
              <h3 className="font-bold">Hosted</h3>
              <p className="mt-1 font-display text-3xl font-extrabold">$300<span className="text-sm font-normal text-mist"> / school / month</span></p>
              <ul className="mt-4 flex-1 list-disc space-y-1 pl-5 text-sm text-mist">
                <li>Provisioned in one command</li>
                <li>Domain, mail, backups operated</li>
                <li>Studio access for your team</li>
              </ul>
              <a href={`${REPO}/issues/new?title=Pilot%20school%20enquiry`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-cta px-5 text-sm font-bold text-night hover:bg-emerald-soft">Open a pilot issue</a>
            </article>
            <article className="flex flex-col rounded-card border border-edge bg-surface p-6">
              <h3 className="font-bold">Curriculum packs</h3>
              <p className="mt-1 font-display text-3xl font-extrabold">per pack</p>
              <ul className="mt-4 flex-1 list-disc space-y-1 pl-5 text-sm text-mist">
                <li>Structured class programs</li>
                <li>Weeks, ages, materials, objectives</li>
                <li>Written by practicing directors</li>
              </ul>
              <p className="mt-6 font-mono text-xs text-mist">coming with the second pilot school</p>
            </article>
          </div>
        </Section>
      </main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-mist sm:flex-row">
          <p>© {new Date().getFullYear()} Topos · engine and spec under <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="underline hover:text-chalk">AGPL-3.0</a></p>
          <p className="font-mono text-xs">built where the schools were the laboratory · operated from Chiang Mai</p>
        </div>
      </footer>
    </div>
  );
}
