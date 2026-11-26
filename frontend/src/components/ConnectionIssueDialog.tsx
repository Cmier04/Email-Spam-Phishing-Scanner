import { useEffect, useRef } from "react";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Mail,
  RefreshCw,
  ServerCog,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import type { GmailConnectionStatus } from "../api";
import "../animations.css";

type DialogProps = {
  kind: "backend" | "gmail";
  message?: string;
  busy: boolean;
  gmailStatus?: GmailConnectionStatus | null;
  onRetry: () => void;
  onConnect: () => void;
  onSettings: () => void;
  onUseDemo: () => void;
};

/** The backend dialog has priority over the Gmail authorization prompt. */
export default function ConnectionIssueDialog({
  kind,
  message,
  busy,
  gmailStatus,
  onRetry,
  onConnect,
  onSettings,
  onUseDemo,
}: DialogProps) {
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const backend = kind === "backend";
  const connecting = gmailStatus?.state === "connecting";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryButtonRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#141d33]/50 px-4 py-8 backdrop-blur-[7px]" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-dialog-title"
        aria-describedby="connection-dialog-description"
        className="phishlab-connect-dialog w-full max-w-[460px] rounded-[24px] border border-white/80 bg-white p-6 text-center shadow-[0_28px_90px_rgba(18,30,57,0.25)] sm:p-9"
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-bold tracking-tight text-[#6e7790]">
            <ShieldCheck size={18} className="text-[#3157d5]" /> PhishLab
          </span>
          {!backend && (
            <button type="button" onClick={onUseDemo} disabled={busy} aria-label="Dismiss Gmail connection" className="rounded-md p-1.5 text-[#929bb0] hover:bg-[#f2f5fa] hover:text-[#45516b] disabled:opacity-40">
              <X size={18} />
            </button>
          )}
        </div>

        <div className={`mx-auto mb-5 flex size-[78px] items-center justify-center rounded-2xl ${backend ? "bg-[#fff0ed] text-[#bf554b]" : "bg-[#eef2ff] text-[#3157d5]"}`}>
          {backend ? <ServerCog size={40} strokeWidth={1.7} aria-hidden="true" /> : <Mail size={39} strokeWidth={1.7} aria-hidden="true" />}
        </div>

        <h2 id="connection-dialog-title" className="text-[22px] font-bold tracking-tight text-[#202a44]">
          {backend ? "Connection issue" : connecting ? "Finish connecting Gmail" : "Connect your Google account"}
        </h2>
        <p id="connection-dialog-description" className="mt-3 text-sm leading-6 text-[#788297]">
          {backend
            ? "PhishLab could not reach its local scanning service. Check the connection, then try again."
            : connecting
              ? "Complete Google's authorization flow in the browser window. PhishLab will recognize the connection automatically."
              : "Connect Gmail to scan your inbox. PhishLab uses your existing Gmail authorization, not a separate app login."}
        </p>

        {backend ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#f0cbcb] bg-[#fff5f4] p-4 text-left">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-[#c64d48]" aria-hidden="true" />
            <p className="min-w-0 break-words text-xs font-medium leading-5 text-[#963c3a]">{message ?? "Could not reach the local scanning service."}</p>
          </div>
        ) : message || (gmailStatus?.state === "failed" && gmailStatus.error) ? (
          <div role="alert" className="mt-6 rounded-xl bg-[#fff5f4] p-3 text-xs text-[#a33e3e]">{message ?? gmailStatus?.error}</div>
        ) : (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-[#f4f8f5] p-3 text-xs font-medium text-[#37815b]">
            <CircleCheck size={15} /> Scanner is ready
          </div>
        )}

        {backend && (
          <p className="mt-3 text-[11px] leading-5 text-[#8a93a5]">
            Try reconnecting. If you're running the source version, see Help center → Developer & debugging for startup instructions.
          </p>
        )}

        <button
          ref={primaryButtonRef}
          type="button"
          disabled={busy || (!backend && connecting)}
          onClick={backend ? onRetry : onConnect}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3157d5] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#294ac0] disabled:cursor-wait disabled:opacity-60"
        >
          {busy || connecting ? <LoaderCircle size={17} className="animate-spin" /> : backend ? <RefreshCw size={17} /> : <Mail size={17} />}
          {backend ? (busy ? "Reconnecting..." : "Try reconnecting") : connecting ? "Waiting for Google..." : busy ? "Opening Google..." : "Connect with Google"}
          {!busy && !connecting && !backend && <ArrowRight size={15} />}
        </button>

        {!backend && (
          <div className="mt-3 flex flex-wrap justify-center gap-4">
            <button type="button" disabled={busy} onClick={onSettings} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#596d98] hover:underline disabled:opacity-40"><Settings size={14} /> Open Settings</button>
            <button type="button" disabled={busy} onClick={onUseDemo} className="text-xs font-semibold text-[#798397] hover:underline disabled:opacity-40">Use training demo instead</button>
          </div>
        )}
      </section>
    </div>
  );
}
