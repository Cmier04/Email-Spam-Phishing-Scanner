import { useEffect, useState } from "react";
import { Database, Download, Trash2 } from "lucide-react";
import {
  clearScanHistory, exportScanHistory, getHistoryStatus,
  updateHistorySettings, type ScanHistoryStatus,
} from "../api";

function HistoryDataSettings() {
  const [status, setStatus] = useState<ScanHistoryStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getHistoryStatus(controller.signal).then(setStatus).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "History status unavailable.");
    });
    return () => controller.abort();
  }, []);

  async function change(enabled: boolean, retention: 30 | 90 | 365) {
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = await updateHistorySettings(enabled, retention);
      setStatus(updated);
      setNotice(enabled ? "History settings saved. Lab edits and scan feedback can now be recorded." : "History collection stopped. Existing records are retained until deleted or expired.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save history preferences.");
    } finally { setBusy(false); }
  }

  async function exportRecords() {
    setBusy(true); setError(""); setNotice("");
    try { const count = await exportScanHistory(); setNotice(`Exported ${count} scan record(s) and saved labs as JSON.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not export history."); }
    finally { setBusy(false); }
  }

  async function removeRecords() {
    if (!window.confirm("Permanently delete all locally stored lab copies, scan history and feedback?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await clearScanHistory();
      setStatus((old) => old ? { ...old, entry_count: 0 } : old);
      setNotice("Lab history and scan feedback deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete history."); }
    finally { setBusy(false); }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e1e6ee] bg-white shadow-sm" aria-label="Data and privacy">
      <div className="border-b border-[#e8ebf1] px-5 py-4 md:px-6">
        <h2 className="text-sm font-bold text-[#202a44]">Data and privacy</h2>
        <p className="mt-1 text-xs text-[#8a92a4]">History is stored only when you opt in. Saved scan records contain only metadata. When you use Lab History, your original and modified email text and learning summary are also stored locally; OAuth tokens and live link metadata are excluded; a resumable lab copy includes its message identifier and email text (which may contain URLs).</p>
      </div>
      <div className="space-y-4 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <Database size={19} className="mt-1 text-[#687288]" />
          <div className="flex-1 min-w-[210px]">
            <p className="text-xs font-semibold text-[#35405a]">Local Lab history and scan feedback</p>
            <p className="mt-1 text-[11px] leading-5 text-[#8a92a4]">
              {!status ? "Checking database…" : !status.configured
                ? "Not configured. Ask the developer to set PHISHLAB_DATABASE_URL. Scanning works without a database."
                : !status.available ? "Local history storage is unavailable. Check the database configuration and storage permissions."
                : `${status.entry_count} saved scan record(s) in ${status.backend === "mysql" ? "MySQL" : "local SQLite"}; Learning Labs are saved separately. Email text is stored when a lab is saved.`}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-[#35405a]">
            <input type="checkbox" aria-label="Save Lab history" checked={status?.enabled ?? false}
              disabled={!status?.available || busy}
              onChange={(e) => { if (status) void change(e.target.checked, status.retention_days); }} />
            Save Lab history
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f4] pt-4">
          <label htmlFor="history-retention" className="text-xs font-semibold text-[#35405a]">Delete saved scans after</label>
          <select id="history-retention" value={status?.retention_days ?? 90}
            disabled={!status?.available || busy}
            onChange={(e) => { if (status) void change(status.enabled, Number(e.target.value) as 30 | 90 | 365); }}
            className="rounded-lg border border-[#dfe4eb] bg-white px-3 py-2 text-xs">
            <option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option>
          </select>
        </div>
        <p className="text-[11px] leading-5 text-[#8a92a4]">Expired records are purged during history reads/writes. Disabling collection does not delete existing records.</p>
        <div className="flex flex-wrap gap-2 border-t border-[#edf0f4] pt-4">
          <button type="button" onClick={() => void exportRecords()} disabled={!status?.available || busy}
            className="flex items-center gap-2 rounded-lg border border-[#dfe4eb] px-3 py-2 text-xs font-semibold text-[#596579] disabled:opacity-50">
            <Download size={14} />Export JSON
          </button>
          <button type="button" onClick={() => void removeRecords()} disabled={!status?.available || busy || status.entry_count === 0}
            className="flex items-center gap-2 rounded-lg border border-[#f0d0ca] px-3 py-2 text-xs font-semibold text-[#ba4d40] disabled:opacity-50">
            <Trash2 size={14} />Delete all history
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        {notice && <p role="status" className="text-xs text-green-700">{notice}</p>}
      </div>
    </section>
  );
}

export default HistoryDataSettings;
