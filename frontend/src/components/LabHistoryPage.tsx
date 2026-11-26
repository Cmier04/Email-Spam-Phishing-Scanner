import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FlaskConical, Menu, RefreshCw, Trash2 } from "lucide-react";
import { deleteLabSession, getLabSession, getLabSessions, getHistoryStatus, type LabSession, type LabSessionSummary, type ScanHistoryStatus } from "../api";

export default function LabHistoryPage({onOpenMenu, onResume}: {
  onOpenMenu: () => void;
  onResume: (session: LabSession) => void;
}) {
  const [items, setItems] = useState<LabSessionSummary[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ScanHistoryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const current = await getHistoryStatus();
      setStatus(current);
      if (current.available) {
        const result = await getLabSessions(20, page * 20);
        setItems(result.items); setTotal(result.total);
      } else { setItems([]); setTotal(0); }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load Lab history.");
    } finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void reload(); }, [reload]);

  async function openDraft(id: number) {
    setBusy(id); setError("");
    try { onResume(await getLabSession(id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not open this lab."); }
    finally { setBusy(null); }
  }
  async function deleteDraft(item: LabSessionSummary) {
    if (!window.confirm(`Permanently delete the saved lab for “${item.subject}”?`)) return;
    setBusy(item.id); setError("");
    try { await deleteLabSession(item.id); if (items.length === 1 && page > 0) setPage(page - 1); else await reload(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not delete lab."); }
    finally { setBusy(null); }
  }
  return <>
    <header className="phishlab-topbar-enter flex min-h-[72px] items-center gap-3 border-b border-[#e4e8ef] bg-white px-5 md:px-8">
      <button type="button" onClick={onOpenMenu} aria-label="Open navigation menu" className="text-[#596579] lg:hidden"><Menu size={20}/></button>
      <FlaskConical size={19} className="text-[#3157d5]"/>
      <div><h1 className="text-sm font-bold text-[#202a44]">Lab history</h1>
        <p className="mt-1 text-[11px] text-[#9299aa]">Revisit your learning results and continue improving saved emails</p></div>
    </header>
    <div className="phishlab-history-stagger mx-auto max-w-[1000px] space-y-5 px-5 py-7 md:px-8 md:py-9">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-2xl font-bold text-[#17213c]">Your saved learning labs</h2>
          <p className="mt-1 text-xs leading-5 text-[#747e93]">Reopen a modified email, review its explanation and classification comparison, or try another transformation. All saved copies stay on this computer.</p></div>
        <button type="button" disabled={loading} onClick={() => void reload()} className="flex items-center gap-2 rounded-lg border border-[#dfe4eb] bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw size={14}/>Refresh</button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {loading ? <p role="status" className="text-sm text-[#687288]">Loading your saved labs…</p>
        : !status?.available ? <p className="rounded-2xl border bg-white p-6 text-sm text-[#687288]">Local storage is unavailable. Open PhishLab through Electron or configure the backend database.</p>
        : !status.enabled ? <p className="rounded-2xl border bg-white p-6 text-sm text-[#687288]">Saving is turned off. Enable <strong>Save Lab history</strong> under Settings → Data and privacy to save and resume learning labs. Previously saved labs remain available.</p>
        : null}
      {!loading && items.length === 0 && status?.available && <p className="rounded-2xl border bg-white p-6 text-sm text-[#687288]">No saved labs yet. Open an email, try a What-If change, and the experiment and summary will be saved here when history is enabled.</p>}
      <div className="phishlab-history-list space-y-3" aria-label="Saved learning labs">
        {items.map(item => <article key={item.id} className="rounded-2xl border border-[#e1e6ee] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold text-[#202a44]">{item.subject || "(No subject)"}</h3>
              <p className="mt-1 break-words text-xs text-[#687288]">{item.sender || "Unknown sender"} · {item.source === "gmail" ? "Gmail" : "Demo"}</p>
              <p className="mt-2 text-[11px] text-[#7b8497]">Updated {new Date(item.updated_at).toLocaleString()} · {item.revision} saved version(s)</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy !== null} onClick={() => void openDraft(item.id)} className="flex items-center gap-2 rounded-lg bg-[#3157d5] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><ArrowRight size={14}/>Continue lab</button>
              <button type="button" aria-label={`Delete saved lab ${item.id}`} disabled={busy !== null} onClick={() => void deleteDraft(item)} className="flex items-center gap-1 rounded-lg border border-[#f0d0ca] px-3 py-2 text-xs text-[#ba4d40] disabled:opacity-50"><Trash2 size={13}/>Delete</button>
            </div>
          </div>
        </article>)}
      </div>
      {total > 20 && <div className="flex items-center justify-between text-xs text-[#687288]">
        <button type="button" disabled={page===0 || loading} onClick={() => setPage(page - 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50">Previous</button>
        <span>Page {page + 1} · {total} saved labs</span>
        <button type="button" disabled={(page+1)*20>=total || loading} onClick={() => setPage(page + 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50">Next</button>
      </div>}
    </div>
  </>;
}
