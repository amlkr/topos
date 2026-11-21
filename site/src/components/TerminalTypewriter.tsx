import { useCallback, useEffect, useRef, useState } from "react";

/**
 * TerminalTypewriter — adapted from 21st.dev "Terminal Typewriter" (id 29812,
 * ziegfiroyt) via `21st get 29812`. Changes from the retrieved component:
 *  - no shadcn/lucide dependencies (the site has no UI kit; plain elements)
 *  - reduced-motion honored: the final state renders instantly (a11y gate
 *    from the ui-ux-pro-max priority table)
 *  - commands are REAL: outputs were copied from actual runs of this repo.
 */

type Command = { id: string; command: string; output?: string };

const COMMANDS: Command[] = [
  {
    id: "validate",
    command: "node manifold/cli.mjs validate schools/lotus.yaml",
    output: "✓ schools/lotus.yaml holds the contract — 2 activities, 5 primitives, 3 locale(s).",
  },
  {
    id: "new",
    command: "node manifold/cli.mjs new schools/aurora.yaml",
    output: "✓ built 6 pages → build/aurora/ (scaffold: manifest copied alongside)",
  },
  {
    id: "studio",
    command: "node manifold/studio.mjs",
    output: "Topos Studio → http://localhost:8080 · drafts live in memory; nothing here touches disk",
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export default function TerminalTypewriter() {
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);
  const [showOutput, setShowOutput] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);
  const reduced = useReducedMotion();

  const finish = useCallback(() => {
    setLine(COMMANDS.length - 1);
    setChars(COMMANDS[COMMANDS.length - 1].command.length);
    setShowOutput(true);
  }, []);

  useEffect(() => {
    if (reduced) { finish(); return; }
    const current = COMMANDS[line];
    if (chars < current.command.length) {
      timer.current = window.setTimeout(() => setChars((c) => c + 1), 34);
    } else if (!showOutput) {
      timer.current = window.setTimeout(() => setShowOutput(true), 420);
    } else if (line < COMMANDS.length - 1) {
      timer.current = window.setTimeout(() => {
        setLine((l) => l + 1);
        setChars(0);
        setShowOutput(false);
      }, 900);
    }
    return () => window.clearTimeout(timer.current);
  }, [chars, line, showOutput, finish, reduced]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copy = () => {
    // non-secure contexts (and denied permissions) throw: say so honestly.
    if (!navigator.clipboard?.writeText) { setCopied("fail"); return; }
    navigator.clipboard.writeText(COMMANDS.map((c) => `$ ${c.command}`).join("\n"))
      .then(() => {
        setCopied("ok");
        copyTimer.current = window.setTimeout(() => setCopied("idle"), 1600);
      })
      .catch(() => {
        setCopied("fail");
        copyTimer.current = window.setTimeout(() => setCopied("idle"), 1600);
      });
  };

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-card border border-edge bg-[#0d0c17] shadow-[0_30px_80px_rgba(99,102,241,0.12)]">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-xs text-mist">manifold — zsh</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="min-h-11 rounded-lg px-3 font-mono text-xs text-mist transition-colors hover:bg-edge hover:text-chalk"
          aria-label="Copy the commands shown in this terminal"
        >
          {copied === "ok" ? "copied ✓" : copied === "fail" ? "copy failed" : "copy"}
          <span className="sr-only" role="status">
            {copied === "ok" ? "Commands copied to clipboard" : copied === "fail" ? "Copying failed in this browser context" : ""}
          </span>
        </button>
      </div>
      <div className="space-y-3 px-5 py-5 font-mono text-sm leading-relaxed" aria-live="off">
        {COMMANDS.map((cmd, i) => {
          if (i > line) return null;
          const typing = i === line && !reduced;
          const text = typing ? cmd.command.slice(0, chars) : cmd.command;
          return (
            <div key={cmd.id}>
              <p className="text-chalk">
                <span className="mr-2 select-none text-emerald-soft">$</span>
                {text}
                {typing && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-emerald-soft align-middle" aria-hidden />}
              </p>
              {(i < line || showOutput) && cmd.output && (
                <p className="mt-1 whitespace-pre-wrap text-mist">{cmd.output}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
