import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleHelp, Flag, X } from "lucide-react";
import type { Email } from "../data/mockEmails";
import { saveEmailFeedback } from "../api";

export default function ClassificationFeedbackDialog({email, onClose}: {email: Email; onClose: () => void}) {
  const [verdict, setVerdict] = useState<"correct" | "incorrect" | "unsure">("incorrect");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    first.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || !dialog.current) return;
      const focus = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])'));
      if (!focus.length) return;
      if (event.shiftKey && document.activeElement === focus[0]) { event.preventDefault(); focus[focus.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focus[focus.length - 1]) {event.preventDefault(); focus[0].focus();}
    }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  async function submit() {
    setBusy(true); setError("");
    try {
      await saveEmailFeedback(email.source === "gmail" ? "gmail" : "demo", email.id, verdict, note);
      setSaved(true);
    } catch (failure) {setError(failure instanceof Error ? failure.message : "Could not save feedback.");}
    finally {setBusy(false);}
  }
  return <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
    <button type="button" aria-label="Close feedback dialog" onClick={onClose} className="absolute inset-0 bg-[#14203a]/45 backdrop-blur-[7px]" />
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="relative z-10 max-h-[88vh] w-full max-w-[510px] overflow-y-auto rounded-2xl border border-[#dce4f0] bg-white p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8efff] text-[#3157d5]"><Flag size={21}/></span>
          <h2 id="feedback-title" className="text-lg font-bold text-[#17213c]">Report a classification</h2>
          <p className="mt-1 text-xs leading-5 text-[#687288]">Help us record whether this scan result seems accurate. Feedback does not automatically retrain the classifier.</p>
        </div>
        <button ref={first} type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 text-[#69728a] hover:bg-[#f2f4fa]"><X size={18}/></button>
      </div>
      <div className="mb-4 rounded-xl bg-[#f5f7fc] p-3 text-xs text-[#536078]">
        <p className="break-words font-semibold text-[#253452]">{email.subject}</p>
        <p className="mt-1">Current result: {email.classification}</p>
      </div>
      {saved ? <div role="status" className="space-y-4 rounded-xl bg-[#eef8f2] p-4 text-sm text-[#276848]"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={19}/> Feedback saved locally</p>
        <p className="text-xs">Your report is available in the local scan-feedback records. It has not changed the classifier's prediction.</p>
        <button type="button" onClick={onClose} className="rounded-lg bg-[#3157d5] px-4 py-2 text-xs font-semibold text-white">Done</button></div>
        : <>
        <fieldset className="space-y-2"><legend className="mb-2 text-xs font-bold text-[#35415c]">How accurate was the classification?</legend>
          {([['incorrect', 'Incorrect — I think this was misclassified'],['correct','Correct — the classification looks right'],['unsure', 'Not sure — needs another review']] as const).map(([value,label])=><label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs font-medium ${verdict === value ? 'border-[#6381e1] bg-[#f0f4ff] text-[#254cbd]' : 'border-[#e2e7ef] text-[#57637c]'}`}>
            <input type="radio" name="classification-feedback" checked={verdict===value} onChange={()=>setVerdict(value)}/>{label}
          </label>)}
        </fieldset>
        <label htmlFor="classification-note" className="mt-4 block text-xs font-bold text-[#35415c]">Why? (optional)</label>
        <textarea id="classification-note" maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Describe what looks wrong about this result…" className="mt-2 w-full resize-y rounded-xl border border-[#dfe4ed] p-3 text-xs outline-none focus:border-[#6381e1]"/>
        <p className="mt-2 flex gap-2 text-[11px] leading-5 text-[#7b8497]"><CircleHelp size={14} className="mt-0.5 shrink-0"/> The scan must already be saved in local history. If saving is off, enable Save Lab history in Settings and scan the email again.</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-[#fff0ee] p-3 text-xs text-[#b44538]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-semibold text-[#657087]">Cancel</button>
          <button type="button" disabled={busy} onClick={()=>void submit()} className="rounded-lg bg-[#3157d5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Submit feedback'}</button>
        </div>
      </>}
    </div>
  </div>;
}
