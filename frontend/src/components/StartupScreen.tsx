import { LoaderCircle, ShieldCheck } from "lucide-react";
import "../animations.css";

type StartupScreenProps = {
  demoChecked: boolean;
  gmailChecked: boolean;
};

/** A short branded introduction while the real backend requests settle. */
export default function StartupScreen({ demoChecked, gmailChecked }: StartupScreenProps) {
  const detail = !demoChecked
    ? "Preparing your email scanner..."
    : !gmailChecked
      ? "Checking Gmail connection..."
      : "Opening your workspace...";

  return (
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-[#f6f8fb] px-5" role="status" aria-live="polite">
      <div className="w-full max-w-[390px] text-center">
        <div className="mx-auto mb-7 flex size-[84px] items-center justify-center rounded-[25px] bg-[#3157d5] text-white shadow-[0_18px_42px_rgba(49,87,213,0.24)]">
          <ShieldCheck size={47} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <h1 className="text-[34px] font-extrabold tracking-tight text-[#17213c]">PhishLab</h1>
        <p className="mt-2 text-sm text-[#7d879b]">Email Spam &amp; Phishing Scanner</p>
        <div className="mx-auto mt-10 max-w-[320px]">
          <div className="h-2 overflow-hidden rounded-full bg-[#e2e7f0]" aria-label="Loading application">
            <div className="phishlab-startup-progress h-full w-[42%] rounded-full bg-[#3157d5]" />
          </div>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-[#65728a]">
            <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}
