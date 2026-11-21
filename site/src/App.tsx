import { useRef, useState, type ReactNode } from "react";
import TerminalTypewriter from "./components/TerminalTypewriter";

const REPO = "https://github.com/amlkr/topos";
const STUDIO = "https://unions-metals-shortly-skill.trycloudflare.com";

/* ---------------- the mascot: the tumbler, restyled flat (v3) ----------------
   Kept — owner's favorite. SVG fills swapped from the clay palette to the
   template language: body tangerine #fe7141, patch lavender #cdabfe (solid,
   flat — no more 0.55 clay shading), eyes/mouth ink #0b0b0b, cheeks sage
   #d1ddd3, ground a flat lavender disc. Wobble + reduced-motion stop intact. */
function Tumbler() {
  const [wobbling, setWobbling] = useState(false);
  const wobbleTimer = useRef<number | undefined>(undefined);
  const wobble = () => {
    setWobbling(true);
    window.clearTimeout(wobbleTimer.current);
    wobbleTimer.current = window.setTimeout(() => setWobbling(false), 950);
  };
  return (
    <button
      type="button"
      onClick={wobble}
      aria-label="A friendly tumbler toy — click to wobble it"
      className={`tumbler block h-40 w-40 cursor-pointer sm:h-52 sm:w-52 ${wobbling ? "wobbling" : ""}`}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true" focusable="false">
        <ellipse cx="100" cy="186" rx="58" ry="9" fill="#CDABFE" />
        <path d="M100 34c42 0 66 40 66 84 0 38-28 62-66 62s-66-24-66-62c0-44 24-84 66-84Z" fill="#FE7141" />
        <path d="M100 34c42 0 66 40 66 84 0 38-28 62-66 62-12 0-23-2.6-32-7.2C148 160 158 128 158 106c0-38-22-66-58-72Z" fill="#CDABFE" />
        <circle cx="76" cy="96" r="10" fill="#0B0B0B" />
        <circle cx="124" cy="96" r="10" fill="#0B0B0B" />
        <circle cx="79" cy="93" r="3.4" fill="#FFFFFF" />
        <circle cx="127" cy="93" r="3.4" fill="#FFFFFF" />
        <path d="M82 124c10 10 26 10 36 0" stroke="#0B0B0B" strokeWidth="6" strokeLinecap="round" fill="none" />
        <circle cx="60" cy="116" r="7" fill="#D1DDD3" />
        <circle cx="140" cy="116" r="7" fill="#D1DDD3" />
        <path d="M92 30c2-10 14-10 16 0" stroke="#0B0B0B" strokeWidth="6" strokeLinecap="round" fill="none" />
      </svg>
    </button>
  );
}

/* ---------------- the game: watch your school fold ---------------- */
/* v3 palette (template language): the six school colours are the six non-paper
   tokens. Their aria-labels name the colours actually painted — a label that
   says "sky" over a lavender chip would be a lie, so these names tracked the
   re-skin (labels only; no visible product copy changed). */
const COLORS = [
  ["tangerine", "#FE7141"], ["lavender", "#CDABFE"], ["sage", "#D1DDD3"],
  ["graphite", "#595959"], ["fog", "#A8A8A8"], ["ink", "#0B0B0B"],
] as const;
const WORDS = [["camps", "camp"], ["activities", "activity"], ["courses", "course"], ["clubs", "club"]] as const;

function SchoolPreview({ name, color, word, plural, locales }: { name: string; color: string; word: string; plural: string; locales: string[] }) {
  // WCAG, measured 2026-11-21 (index.css comment block): ink #0B0B0B passes on
  // tangerine (7.17), lavender (10.17), sage (14.05) and fog (8.28) — but NOT on
  // graphite (2.81) or ink (too dark), so those two get paper #FFFFFF (7.00,
  // 19.68). White-on-tangerine (2.74) is never used, exactly as the template.
  const dark = color === "#0B0B0B" || color === "#595959";
  const onColor = dark ? "#FFFFFF" : "#0B0B0B";
  return (
    <div className="overflow-hidden border-2 border-ink bg-paper">
      <div className="px-6 py-8" style={{ background: color, color: onColor }}>
        <p className="eyebrow">your school</p>
        <p className="display-card mt-1 leading-tight">{name || "Your school"}</p>
      </div>
      <div className="space-y-3 px-6 py-5 text-ink">
        <p className="text-sm">This term at {name || "our school"}: <strong>{plural} for everyone</strong>.</p>
        <div className="flex flex-wrap gap-2">
          {locales.map((l) => (
            <span key={l} translate={l === "ไทย" || l === "中文" ? "no" : undefined} className="bg-sage px-3 py-1 text-xs font-bold text-ink">{l}</span>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <span className="px-4 py-2 text-xs font-extrabold" style={{ background: color, color: onColor }}>
            Enrol in {word === "camp" ? "camp" : plural}
          </span>
          <span className="border-2 border-ink px-4 py-2 text-xs font-bold">Family portal</span>
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
          <label htmlFor="school-name" className="eyebrow mb-2 block text-fog">Your school’s name</label>
          <input
            id="school-name"
            name="school"
            type="text"
            autoComplete="off"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-2 border-ink bg-paper px-4 py-3 text-lg font-semibold text-ink"
          />
        </div>
        <div>
          <span className="eyebrow mb-2 block text-fog">Your colour</span>
          <div role="group" aria-label="Pick a school colour" className="flex flex-wrap gap-3">
            {COLORS.map(([label, hex]) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(hex)}
                aria-pressed={color === hex}
                aria-label={label}
                className={`h-12 w-12 min-h-11 min-w-11 border-none transition-transform hover:scale-110 ${color === hex ? "outline-2 outline-offset-2 outline-paper" : "outline-none"}`}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow mb-2 block text-fog">What do you call your programs?</span>
          <div role="group" aria-label="Pick what your school calls its programs" className="flex flex-wrap gap-2">
            {WORDS.map(([plural], i) => (
              <button
                key={plural}
                type="button"
                onClick={() => setWordIdx(i)}
                aria-pressed={wordIdx === i}
                className={`min-h-11 px-5 py-2 text-sm font-bold transition-colors ${wordIdx === i ? "border-2 border-paper bg-paper text-ink" : "btn-ghost-dark"}`}
              >
                {plural}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="eyebrow mb-2 block text-fog">Languages your families speak</span>
          <div role="group" aria-label="Pick languages" className="flex flex-wrap gap-2">
            {["English", "ไทย", "中文", "Español"].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLocale(l)}
                aria-pressed={locales.includes(l)}
                translate={l === "ไทย" || l === "中文" ? "no" : undefined}
                className={`min-h-11 px-5 py-2 text-sm font-bold transition-colors ${locales.includes(l) ? "border-2 border-tangerine bg-tangerine text-ink" : "btn-ghost-dark"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <SchoolPreview name={name} color={color} word={WORDS[wordIdx][1]} plural={WORDS[wordIdx][0]} locales={locales} />
        <p className="mt-4 text-center text-sm text-fog">this is the real thing: the preview <em>is</em> Topos rendering your choices</p>
      </div>
    </div>
  );
}

/* ---------------- sections ---------------- */
function Section({ id, kicker, title, children, className = "", dark = false }: { id: string; kicker: string; title: string; children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-5 py-16 sm:py-24 ${className}`}>
      {/* eyebrow color set per element, all measured (index.css): graphite fails
          on tangerine/lavender blocks and fog fails on light ones, so dark
          sections use tangerine (7.17 on ink) and light sections graphite
          (7.00 on paper) — no [&_p] hammer. */}
      <p className={`eyebrow mb-3 ${dark ? "text-tangerine" : "text-graphite"}`}>{kicker}</p>
      <h2 className="display-section mb-10 max-w-2xl">{title}</h2>
      {children}
    </section>
  );
}

const IconBalloon = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#0B0B0B" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 3a6 6 0 0 1 6 6c0 3.5-2.6 6-6 6s-6-2.5-6-6a6 6 0 0 1 6-6Z"/><path d="M12 15v2m-1.5 4h3M12 17l-1.5 4m1.5-4 1.5 4"/></svg>);
const IconHouse = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#0B0B0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/></svg>);
const IconCamera = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#0B0B0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v12H4V8Z"/><circle cx="12" cy="13" r="3.5"/></svg>);
const IconMega = () => (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#D1DDD3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10v4h3l7 4V6l-7 4H4Z"/><path d="M18 9a4 4 0 0 1 0 6"/></svg>);
const DOING: Array<readonly [() => ReactNode, string, string, string]> = [
  [IconBalloon, "Admissions that simply work", "Families enrol in minutes — places, ages, sessions and payments handled, with a real human desk behind every booking.", "#FE7141"],
  [IconHouse, "A home for every family", "Portals where parents see their children’s weeks, pay by bank transfer, and upload the slip without a phone call.", "#CDABFE"],
  [IconCamera, "Your stories, with consent", "A blog built for schools: photos appear only when the family has said yes — PDPA and GDPR regimes are switches, not prayers.", "#D1DDD3"],
  [IconMega, "News that post themselves", "One calendar feeds the website, the blog and the school’s social pages — drafted by the system, approved by a person.", "#0B0B0B"],
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
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>

      {/* nav: paper block with the template's 2px ink rule; flat, no blur */}
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
        <nav aria-label="Main" className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex min-h-11 items-center gap-2.5">
            <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
              <circle cx="20" cy="22" r="15" fill="#FE7141" />
              <circle cx="15" cy="19" r="2.6" fill="#0B0B0B" />
              <circle cx="25" cy="19" r="2.6" fill="#0B0B0B" />
              <path d="M14 27c3.5 3.6 9 3.6 12.5 0" stroke="#0B0B0B" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
            <span className="font-display text-xl font-extrabold tracking-tight text-ink">topos</span>
          </a>
          <div className="flex items-center gap-2 sm:gap-5">
            <a href="#does" className="hidden min-h-11 items-center px-2 text-sm font-bold text-ink transition-colors hover:bg-lavender sm:inline-flex">For schools</a>
            <a href="#fold" className="hidden min-h-11 items-center px-2 text-sm font-bold text-ink transition-colors hover:bg-lavender sm:inline-flex">Try it</a>
            <a href="#prices" className="hidden min-h-11 items-center px-2 text-sm font-bold text-ink transition-colors hover:bg-lavender sm:inline-flex">Pricing</a>
            <a href={STUDIO} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center bg-tangerine px-4 py-2 text-sm font-extrabold text-ink transition-colors hover:bg-ink hover:text-paper sm:px-5">
              See a school live
            </a>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* HERO — paper block; the clay blobs are replaced by static flat
            color chips (decorative, aria-hidden; the only adopted motion is
            the guarded scroll entrances in index.css, none here) */}
        <section className="relative overflow-hidden bg-paper">
          <div aria-hidden className="absolute left-6 top-28 h-10 w-10 -rotate-6 bg-tangerine" />
          <div aria-hidden className="absolute right-10 top-16 h-8 w-8 rotate-3 bg-sage" />
          <div aria-hidden className="absolute bottom-16 left-1/4 h-6 w-6 rotate-12 bg-lavender" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-5 py-20 text-center sm:py-28">
            <Tumbler />
            <h1 className="display-hero max-w-3xl">
              Your school, <span className="mark-lavender">its own place</span> in the internet.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-graphite">
              Topos is the friendly home for admissions, families, stories and news of an international
              school. You describe your school once — the colours, the camps, the languages, the rules —
              and everything else is built from that. No jargon, no lock-in, no per-student invoice.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#fold" className="btn btn-cta">
                Watch your school fold →
              </a>
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                For your IT team
              </a>
            </div>
            <p className="text-sm text-graphite">free &amp; open (AGPL) · born at a real school in Chiang Mai · no credit card, ever, for the open edition</p>
          </div>
        </section>

        {/* MARQUEE — ink block band (CSS animation + hover/focus pause +
            touch-static + reduced-motion stop all kept in index.css) */}
        <div className="marquee overflow-hidden bg-ink py-4" aria-hidden="true">
          <div className="marquee-track flex w-max gap-10 whitespace-nowrap font-display font-extrabold uppercase tracking-[0.15em] text-paper" style={{ fontSize: "1.25rem" }}>
            {[0, 1].map((dup) => (
              <span key={dup} className="flex gap-10">
                {["camp week", "robotics club", "report cards", "field trips", "school play", "mandarin hour", "snack duty", "swim day", "parent coffee", "art show"].map((w) => (
                  <span key={w} className="flex items-center gap-10">{w}<span className="text-tangerine">●</span></span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* WHAT IT DOES — flat sage block, paper cards with 2px ink borders */}
        <div className="bg-sage">
          <Section id="does" kicker="for directors and coordinators" title="What Topos quietly handles for your school" className="enter">
            <div className="grid gap-6 sm:grid-cols-2">
              {DOING.map(([Icon, title, body, tint]) => (
                <article key={title} className="border-2 border-ink bg-paper p-7">
                  <div className="mb-4 grid h-14 w-14 place-items-center border-2 border-ink" style={{ background: tint }} aria-hidden><Icon /></div>
                  <h3 className="display-card">{title}</h3>
                  <p className="mt-2 leading-relaxed text-graphite">{body}</p>
                </article>
              ))}
            </div>
          </Section>
        </div>

        {/* THE GAME — ink block */}
        <div className="on-dark bg-ink">
          <Section id="fold" kicker="play with it" title="Watch your school fold — five choices, one live preview" className="text-paper" dark>
            <FoldGame />
          </Section>
        </div>

        {/* BORN IN A REAL SCHOOL — paper block; the three facts as flat
            tangerine / lavender / sage panels (all ink text, measured ≥7) */}
        <Section id="born" kicker="why trust us" title="Born at a real school, tested by a real season" className="enter">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              ["Adventures4Kids", "Topos was forged building the live site and admissions desk of an international camp school in Chiang Mai & Rayong — 33 pages, real families, real bank slips."],
              ["16 / 16", "The contract tests that guard every school: invented prices, duplicate programs or fake mailboxes are refused by the machine, not by a mood."],
              ["AGPL-3.0", "The engine is free and stays free. You are not a tenant of someone’s platform — you are a co-author of a shared one."],
            ].map(([n, l], i) => (
              <article key={n} className={`${["bg-tangerine", "bg-lavender", "bg-sage"][i]} border-2 border-ink p-7 text-ink`}>
                <p className="display-number">{n}</p>
                <p className="mt-3 leading-relaxed">{l}</p>
              </article>
            ))}
          </div>
        </Section>

        {/* PRICING — lavender block; flat panels with 2px ink borders */}
        <div className="bg-lavender">
          <Section id="prices" kicker="simple as a school fee" title="Own the code. Share the tumbler." className="enter">
            <div className="grid gap-6 sm:grid-cols-3">
              <article className="flex flex-col border-2 border-ink bg-paper p-7">
                <h3 className="display-card">Run it yourselves</h3>
                <p className="display-number mt-1">$0</p>
                <p className="text-sm text-graphite">forever — it’s yours by license</p>
                <ul className="mt-5 flex-1 list-disc space-y-1.5 pl-5 text-sm text-graphite">
                  <li>Full platform, source open</li>
                  <li>Your servers, your data</li>
                  <li>Community support</li>
                </ul>
                <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn btn-outline mt-6 w-full">Clone it</a>
              </article>
              <article className="relative flex flex-col border-2 border-ink bg-tangerine p-7 text-ink">
                <span className="absolute -top-4 right-6 border-2 border-ink bg-ink px-3 py-1 text-xs font-extrabold text-sage">most schools</span>
                <h3 className="display-card">We run it for you</h3>
                <p className="display-number mt-1">$300<span className="text-base font-semibold"> /month</span></p>
                <p className="text-sm">per school · flat, never per student</p>
                <ul className="mt-5 flex-1 list-disc space-y-1.5 pl-5 text-sm">
                  <li>Your domain, your colours, your languages</li>
                  <li>Mail, backups and updates handled</li>
                  <li>A human answers (it’s a small school world)</li>
                </ul>
                <a href={`${REPO}/issues/new?title=We%20want%20a%20pilot`} target="_blank" rel="noopener noreferrer" className="btn btn-ink mt-6 w-full">Start a pilot term</a>
              </article>
              <article className="flex flex-col border-2 border-ink bg-paper p-7">
                <h3 className="display-card">Learning packs</h3>
                <p className="display-number mt-1">per pack</p>
                <p className="text-sm text-graphite">the creative layer</p>
                <ul className="mt-5 flex-1 list-disc space-y-1.5 pl-5 text-sm text-graphite">
                  <li>Structured weeks &amp; activities</li>
                  <li>Ages, materials, objectives</li>
                  <li>Written by practicing directors</li>
                </ul>
                <p className="mt-6 text-sm font-bold text-graphite">arriving with the second pilot school</p>
              </article>
            </div>
          </Section>
        </div>

        {/* FAQ — paper block; template's rule-list accordion (2px ink rules,
            44px bordered + icon that rotates open) */}
        <Section id="faq" kicker="questions from real principals" title="The things every director asks in week one" className="enter">
          <div className="border-t-2 border-ink">
            {FAQS.map(([q, a]) => (
              <details key={q} className="group border-b-2 border-ink [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-bold">
                  <span className="font-display">{q}</span>
                  <span aria-hidden className="grid h-11 w-11 flex-none place-items-center border-2 border-ink text-2xl font-normal text-ink transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-2xl pb-5 leading-relaxed text-graphite">{a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* UNDER THE HOOD — small, for the IT friend — ink block */}
        <div className="on-dark bg-ink">
          <Section id="geeks" kicker="for your IT friend" title="Under the hood, it’s three honest commands" className="enter text-paper" dark>
            <div className="mb-6 max-w-2xl">
              <p className="text-fog">The whole platform is one manifest, one validator and one folder of pages. If your developer friend wants the tour, it takes a minute — and the contract tests are public.</p>
            </div>
            <TerminalTypewriter />
          </Section>
        </div>
      </main>

      {/* FOOTER — ink block with the template's fog rule on top (its own
          #footer uses 1px --color-7; here 2px fog) so it reads apart from
          the ink terminal block above it */}
      <footer className="on-dark border-t-2 border-fog bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-5 py-12 sm:flex-row">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
              <circle cx="20" cy="22" r="15" fill="#FE7141" />
              <circle cx="15" cy="19" r="2.6" fill="#0B0B0B" />
              <circle cx="25" cy="19" r="2.6" fill="#0B0B0B" />
              <path d="M14 27c3.5 3.6 9 3.6 12.5 0" stroke="#0B0B0B" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
            <p className="text-sm text-fog">topos · each school, its own place<br />engine &amp; spec under <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className="text-paper underline decoration-tangerine underline-offset-2">AGPL-3.0</a></p>
          </div>
          <p className="font-mono text-xs text-fog">made between Chiang Mai and the internet · demo tunnels are temporary, the license is not</p>
        </div>
      </footer>
    </div>
  );
}
