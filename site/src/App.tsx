import { useState, type ReactNode } from "react";
import TerminalTypewriter from "./components/TerminalTypewriter";

const REPO = "https://github.com/amlkr/topos";
const STUDIO = "https://unions-metals-shortly-skill.trycloudflare.com";

/* ---------------- the mascot: a hand-drawn clay tumbler ---------------- */
function Tumbler() {
  const [wobbling, setWobbling] = useState(false);
  const wobble = () => {
    setWobbling(true);
    window.setTimeout(() => setWobbling(false), 950);
  };
  return (
    <button
      type="button"
      onClick={wobble}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") wobble(); }}
      aria-label="A friendly clay tumbler toy — click to wobble it"
      className={`tumbler block h-40 w-40 cursor-pointer rounded-full sm:h-52 sm:w-52 ${wobbling ? "wobbling" : ""}`}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true" focusable="false">
        <ellipse cx="100" cy="186" rx="58" ry="9" fill="rgba(0,20,51,0.10)" />
        <path d="M100 34c42 0 66 40 66 84 0 38-28 62-66 62s-66-24-66-62c0-44 24-84 66-84Z" fill="#FF7714" />
        <path d="M100 34c42 0 66 40 66 84 0 38-28 62-66 62-12 0-23-2.6-32-7.2C148 160 158 128 158 106c0-38-22-66-58-72Z" fill="#FB4450" opacity="0.55" />
        <circle cx="76" cy="96" r="10" fill="#001433" />
        <circle cx="124" cy="96" r="10" fill="#001433" />
        <circle cx="79" cy="93" r="3.4" fill="#fff" />
        <circle cx="127" cy="93" r="3.4" fill="#fff" />
        <path d="M82 124c10 10 26 10 36 0" stroke="#001433" strokeWidth="6" strokeLinecap="round" fill="none" />
        <circle cx="60" cy="116" r="7" fill="#EEF773" opacity="0.9" />
        <circle cx="140" cy="116" r="7" fill="#EEF773" opacity="0.9" />
        <path d="M92 30c2-10 14-10 16 0" stroke="#035D44" strokeWidth="6" strokeLinecap="round" fill="none" />
      </svg>
    </button>
  );
}

/* ---------------- the game: watch your school fold ---------------- */
const COLORS = [
  ["tangerine", "#FF7714"], ["sky", "#3BD3FD"], ["garden", "#035D44"],
  ["grape", "#46022F"], ["berry", "#FB4450"], ["meadow", "#EEF773"],
] as const;
const WORDS = [["camps", "camp"], ["activities", "activity"], ["courses", "course"], ["clubs", "club"]] as const;

function SchoolPreview({ name, color, word, locales }: { name: string; color: string; word: string; locales: string[] }) {
  const light = color === "#EEF773" || color === "#3BD3FD";
  return (
    <div className="clay overflow-hidden rounded-clay bg-card">
      <div className="px-6 py-8" style={{ background: color, color: light ? "#001433" : "#fff" }}>
        <p className="font-mono text-xs uppercase tracking-widest opacity-80">your school</p>
        <p className="mt-1 font-[Fredoka] text-2xl font-bold leading-tight">{name || "Your school"}</p>
      </div>
      <div className="space-y-3 px-6 py-5 text-navy">
        <p className="text-sm">This term at {name || "our school"}: <strong>{word}s for everyone</strong>.</p>
        <div className="flex flex-wrap gap-2">
          {locales.map((l) => (
            <span key={l} className="rounded-full bg-cream px-3 py-1 text-xs font-bold">{l}</span>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <span className="rounded-full px-4 py-2 text-xs font-extrabold" style={{ background: color, color: light ? "#001433" : "#fff" }}>
            Enrol in {word === "camp" ? "camp" : word + "s"}
          </span>
          <span className="rounded-full border-2 border-navy/15 px-4 py-2 text-xs font-bold">Family portal</span>
        </div>
      </div>
    </div>
  );
}

function FoldGame() {
  const [name, setName] = useState("Sunrise Academy");
  const [color, setColor] = useState<string>(COLORS[0][1]);
  const [wordIdx, setWordIdx] = useState(0);
  const [locales, setLocales] = useState<string[]>(["English", "ไทย"]);

  const toggleLocale = (l: string) =>
    setLocales((cur) => (cur.includes(l) ? (cur.length > 1 ? cur.filter((x) => x !== l) : cur) : [...cur, l]));

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="space-y-7">
        <div>
          <label htmlFor="school-name" className="mb-2 block text-sm font-extrabold uppercase tracking-wide">Your school’s name</label>
          <input
            id="school-name"
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl border-2 border-navy/10 bg-card px-4 py-3 text-lg font-semibold outline-none focus:border-orange"
          />
        </div>
        <div>
          <span className="mb-2 block text-sm font-extrabold uppercase tracking-wide">Your colour</span>
          <div role="group" aria-label="Pick a school colour" className="flex flex-wrap gap-3">
            {COLORS.map(([label, hex]) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(hex)}
                aria-pressed={color === hex}
                aria-label={label}
                className="h-12 w-12 min-h-11 min-w-11 rounded-full border-4 transition-transform hover:scale-110"
                style={{ background: hex, borderColor: color === hex ? "#001433" : "transparent" }}
              />
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-extrabold uppercase tracking-wide">What do you call your programs?</span>
          <div role="group" aria-label="Pick what your school calls its programs" className="flex flex-wrap gap-2">
            {WORDS.map(([plural], i) => (
              <button
                key={plural}
                type="button"
                onClick={() => setWordIdx(i)}
                aria-pressed={wordIdx === i}
                className={`min-h-11 rounded-full px-5 py-2 text-sm font-bold transition-colors ${wordIdx === i ? "bg-navy text-cream" : "bg-card text-navy hover:bg-navy/5"}`}
              >
                {plural}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-extrabold uppercase tracking-wide">Languages your families speak</span>
          <div role="group" aria-label="Pick languages" className="flex flex-wrap gap-2">
            {["English", "ไทย", "中文", "Español"].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLocale(l)}
                aria-pressed={locales.includes(l)}
                className={`min-h-11 rounded-full px-5 py-2 text-sm font-bold transition-colors ${locales.includes(l) ? "bg-green text-cream" : "bg-card text-navy hover:bg-navy/5"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <SchoolPreview name={name} color={color} word={WORDS[wordIdx][1]} locales={locales} />
        <p className="mt-4 text-center text-sm text-navy/60">this is the real thing: the preview <em>is</em> Topos rendering your choices</p>
      </div>
    </div>
  );
}

/* ---------------- sections ---------------- */
function Section({ id, kicker, title, children, className = "" }: { id: string; kicker: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-5 py-16 sm:py-24 ${className}`}>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.2em] text-green">{kicker}</p>
      <h2 className="mb-8 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl" style={{ fontFamily: "Fredoka" }}>{title}</h2>
      {children}
    </section>
  );
}

const IconBalloon = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#001433" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3a6 6 0 0 1 6 6c0 3.5-2.6 6-6 6s-6-2.5-6-6a6 6 0 0 1 6-6Z"/><path d="M12 15v2m-1.5 4h3M12 17l-1.5 4m1.5-4 1.5 4"/></svg>);
const IconHouse = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#001433" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/></svg>);
const IconCamera = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#001433" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v12H4V8Z"/><circle cx="12" cy="13" r="3.5"/></svg>);
const IconMega = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#EEF773" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10v4h3l7 4V6l-7 4H4Z"/><path d="M18 9a4 4 0 0 1 0 6"/></svg>);
const DOING: Array<readonly [() => ReactNode, string, string, string]> = [
  [IconBalloon, "Admissions that simply work", "Families enrol in minutes — places, ages, sessions and payments handled, with a real human desk behind every booking.", "#FF7714"],
  [IconHouse, "A home for every family", "Portals where parents see their children’s weeks, pay by bank transfer, and upload the slip without a phone call.", "#3BD3FD"],
  [IconCamera, "Your stories, with consent", "A blog built for schools: photos appear only when the family has said yes — PDPA and GDPR regimes are switches, not prayers.", "#EEF773"],
  [IconMega, "News that post themselves", "One calendar feeds the website, the blog and the school’s social pages — drafted by the system, approved by a person.", "#46022F"],
];

const FAQS = [
  ["Is our data safe?", "Your school runs its own instance: its own database, its own domain, its own mail. Nobody else’s school can see anything of yours — separation is the architecture, not a promise."],
  ["Do parents need to install an app?", "No. Everything the family uses is the website on their phone — enrolment, portal, receipts. No app stores, no updates to install."],
  ["What about the photos of our children?", "The manifest carries your consent regime (PDPA, GDPR…). The platform refuses to show an image whose family consent is not on file — it is a rule in the code, not a policy in a PDF."],
  ["We already have a website. Can we keep it?", "Often yes: Topos can run the admissions desk and family portal behind your existing pages. Start with the part that hurts."],
  ["If we leave, what do we take with us?", "Everything. The manifest that describes your school is plain text you own, the code is AGPL (yours by license), and your data leaves as tables. Leaving is easy, which is the point."],
];

export default function App() {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-navy focus:px-4 focus:py-2 focus:text-cream">
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b-2 border-navy/5 bg-cream/90 backdrop-blur-lg">
        <nav aria-label="Main" className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex min-h-11 items-center gap-2.5">
            <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
              <circle cx="20" cy="22" r="15" fill="#FF7714" />
              <circle cx="15" cy="19" r="2.6" fill="#001433" />
              <circle cx="25" cy="19" r="2.6" fill="#001433" />
              <path d="M14 27c3.5 3.6 9 3.6 12.5 0" stroke="#001433" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
            <span className="text-xl font-bold" style={{ fontFamily: "Fredoka" }}>topos</span>
          </a>
          <div className="flex items-center gap-2 sm:gap-5">
            <a href="#does" className="hidden min-h-11 items-center text-sm font-bold text-navy/70 hover:text-navy sm:inline-flex">For schools</a>
            <a href="#fold" className="hidden min-h-11 items-center text-sm font-bold text-navy/70 hover:text-navy sm:inline-flex">Try it</a>
            <a href="#prices" className="hidden min-h-11 items-center text-sm font-bold text-navy/70 hover:text-navy sm:inline-flex">Pricing</a>
            <a href={STUDIO} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-orange px-4 py-2 text-sm font-extrabold text-navy shadow-[0_6px_0_rgba(0,20,51,0.15)] transition-transform hover:-translate-y-0.5 sm:px-5">
              See a school live
            </a>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="blob-float absolute -left-16 top-24 h-44 w-44 rounded-full bg-sky/50" />
          <div aria-hidden className="blob-float absolute right-[-60px] top-10 h-56 w-56 rounded-full bg-lime/60" style={{ animationDelay: "-3s" }} />
          <div aria-hidden className="blob-float absolute bottom-[-40px] left-1/3 h-36 w-36 rounded-full bg-coral/30" style={{ animationDelay: "-6s" }} />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-5 py-20 text-center sm:py-28">
            <Tumbler />
            <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl" style={{ fontFamily: "Fredoka" }}>
              Your school, <span className="bg-lime px-3 rounded-xl box-decoration-break">its own place</span> in the internet.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-navy/75">
              Topos is the friendly home for admissions, families, stories and news of an international
              school. You describe your school once — the colours, the camps, the languages, the rules —
              and everything else is built from that. No jargon, no lock-in, no per-student invoice.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#fold" className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange px-8 py-3.5 text-base font-extrabold text-navy shadow-[0_8px_0_rgba(0,20,51,0.18)] transition-transform hover:-translate-y-1 active:translate-y-0.5">
                Watch your school fold →
              </a>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-navy/15 bg-card px-8 py-3 text-base font-bold hover:border-navy/40">
                For your IT team
              </a>
            </div>
            <p className="text-sm text-navy/70">free &amp; open (AGPL) · born at a real school in Chiang Mai · no credit card, ever, for the open edition</p>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="marquee overflow-hidden border-y-4 border-navy bg-lime py-4" aria-hidden="true">
          <div className="marquee-track flex w-max gap-10 whitespace-nowrap font-bold uppercase tracking-[0.15em] text-navy" style={{ fontFamily: "Fredoka", fontSize: "1.25rem" }}>
            {[0, 1].map((dup) => (
              <span key={dup} className="flex gap-10">
                {["camp week", "robotics club", "report cards", "field trips", "school play", "mandarin hour", "snack duty", "swim day", "parent coffee", "art show"].map((w) => (
                  <span key={w} className="flex items-center gap-10">{w}<span className="text-orange">●</span></span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* WHAT IT DOES */}
        <Section id="does" kicker="for directors and coordinators" title="What Topos quietly handles for your school">
          <div className="grid gap-6 sm:grid-cols-2">
            {DOING.map(([Icon, title, body, tint]) => (
              <article key={title} className="clay rounded-clay bg-card p-7">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-full" style={{ background: tint }} aria-hidden><Icon /></div>
                <h3 className="text-xl font-bold" style={{ fontFamily: "Fredoka" }}>{title}</h3>
                <p className="mt-2 leading-relaxed text-navy/70">{body}</p>
              </article>
            ))}
          </div>
        </Section>

        {/* THE GAME */}
        <div className="on-dark bg-navy">
          <Section id="fold" kicker="play with it" title="Watch your school fold — five choices, one live preview" className="text-cream [&_h2]:text-cream [&_p]:text-cream/80">
            <FoldGame />
          </Section>
        </div>

        {/* BORN IN A REAL SCHOOL */}
        <Section id="born" kicker="why trust us" title="Born at a real school, tested by a real season">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              ["Adventures4Kids", "Topos was forged building the live site and admissions desk of an international camp school in Chiang Mai & Rayong — 33 pages, real families, real bank slips."],
              ["16 / 16", "The contract tests that guard every school: invented prices, duplicate programs or fake mailboxes are refused by the machine, not by a mood."],
              ["AGPL-3.0", "The engine is free and stays free. You are not a tenant of someone’s platform — you are a co-author of a shared one."],
            ].map(([n, l]) => (
              <article key={n} className="clay rounded-clay bg-card p-7">
                <p className="text-2xl font-bold text-green" style={{ fontFamily: "Fredoka" }}>{n}</p>
                <p className="mt-3 leading-relaxed text-navy/70">{l}</p>
              </article>
            ))}
          </div>
        </Section>

        {/* PRICING */}
        <Section id="prices" kicker="simple as a school fee" title="Own the code. Share the tumbler.">
          <div className="grid gap-6 sm:grid-cols-3">
            <article className="clay flex flex-col rounded-clay bg-card p-7">
              <h3 className="text-lg font-bold" style={{ fontFamily: "Fredoka" }}>Run it yourselves</h3>
              <p className="mt-1 text-4xl font-bold">$0</p>
              <p className="text-sm text-navy/60">forever — it’s yours by license</p>
              <ul className="mt-5 flex-1 list-disc space-y-1.5 pl-5 text-sm text-navy/75">
                <li>Full platform, source open</li>
                <li>Your servers, your data</li>
                <li>Community support</li>
              </ul>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full border-2 border-navy/15 px-5 font-bold hover:border-navy/40">Clone it</a>
            </article>
            <article className="clay relative flex flex-col rounded-clay bg-sky p-7">
              <span className="absolute -top-4 right-6 rounded-full bg-navy px-4 py-1 text-xs font-extrabold text-lime">most schools</span>
              <h3 className="text-lg font-bold" style={{ fontFamily: "Fredoka" }}>We run it for you</h3>
              <p className="mt-1 text-4xl font-bold text-navy">$300<span className="text-base font-semibold"> /month</span></p>
              <p className="text-sm text-navy/70">per school · flat, never per student</p>
              <ul className="mt-5 flex-1 list-disc space-y-1.5 pl-5 text-sm text-navy/85">
                <li>Your domain, your colours, your languages</li>
                <li>Mail, backups and updates handled</li>
                <li>A human answers (it’s a small school world)</li>
              </ul>
              <a href={`${REPO}/issues/new?title=We%20want%20a%20pilot`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-navy px-5 font-extrabold text-cream hover:bg-plum">Start a pilot term</a>
            </article>
            <article className="clay flex flex-col rounded-clay bg-card p-7">
              <h3 className="text-lg font-bold" style={{ fontFamily: "Fredoka" }}>Learning packs</h3>
              <p className="mt-1 text-4xl font-bold">per pack</p>
              <p className="text-sm text-navy/60">the creative layer</p>
              <ul className="mt-5 flex-1 list-disc space-y-1.5 pl-5 text-sm text-navy/75">
                <li>Structured weeks &amp; activities</li>
                <li>Ages, materials, objectives</li>
                <li>Written by practicing directors</li>
              </ul>
              <p className="mt-6 text-sm font-bold text-navy/70">arriving with the second pilot school</p>
            </article>
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" kicker="questions from real principals" title="The things every director asks in week one">
          <div className="space-y-3">
            {FAQS.map(([q, a]) => (
              <details key={q} className="clay group rounded-clay bg-card px-6 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold" style={{ fontFamily: "Fredoka" }}>
                  {q}
                  <span aria-hidden className="text-green transition-transform group-open:rotate-45 text-2xl font-normal">+</span>
                </summary>
                <p className="max-w-2xl pb-3 leading-relaxed text-navy/70">{a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* UNDER THE HOOD — small, for the IT friend */}
        <div className="on-dark border-t-4 border-navy bg-plum">
          <Section id="geeks" kicker="for your IT friend" title="Under the hood, it’s three honest commands" className="[&_h2]:text-cream [&_p]:text-cream/75">
            <div className="mb-6 max-w-2xl text-cream/80">
              <p>The whole platform is one manifest, one validator and one folder of pages. If your developer friend wants the tour, it takes a minute — and the contract tests are public.</p>
            </div>
            <TerminalTypewriter />
          </Section>
        </div>
      </main>

      <footer className="on-dark bg-navy text-cream">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-5 py-12 sm:flex-row">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
              <circle cx="20" cy="22" r="15" fill="#FF7714" />
              <circle cx="15" cy="19" r="2.6" fill="#001433" />
              <circle cx="25" cy="19" r="2.6" fill="#001433" />
              <path d="M14 27c3.5 3.6 9 3.6 12.5 0" stroke="#001433" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
            <p className="text-sm text-cream/70">topos · each school, its own place<br />engine &amp; spec under <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="underline decoration-orange">AGPL-3.0</a></p>
          </div>
          <p className="font-mono text-xs text-cream/50">made between Chiang Mai and the internet · demo tunnels are temporary, the license is not</p>
        </div>
      </footer>
    </div>
  );
}
