import { useState } from "react";
import { request } from "../api.js";

// The signature visual element: a "signal match" bar per retrieved incident.
// Higher similarity = more bars lit, evoking a waveform/signal-strength meter —
// ties back to the idea of "how strongly does this past incident resonate with the new one."
function MatchSignal({ similarity }) {
  const bars = 10;
  const litBars = Math.round(similarity * bars);
  const color =
    similarity > 0.75 ? "bg-console-teal" : similarity > 0.5 ? "bg-console-amber" : "bg-console-muted";

  return (
    <div className="flex items-end gap-[2px] h-4">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-sm transition-all duration-300 ${i < litBars ? color : "bg-console-border"}`}
          style={{ height: `${((i + 1) / bars) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ConfidenceBadge({ confidence }) {
  const styles = {
    high: "text-console-teal border-console-teal/40 bg-console-teal/10 shadow-[0_0_12px_-2px_rgba(94,234,212,0.35)]",
    medium: "text-console-amber border-console-amber/40 bg-console-amber/10 shadow-[0_0_12px_-2px_rgba(255,176,32,0.35)]",
    low: "text-console-muted border-console-border bg-console-panel"
  };
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${styles[confidence]}`}
    >
      {confidence} confidence
    </span>
  );
}

// The feedback-loop form: once an engineer actually fixes the issue, they
// record the real root cause + resolution here. This closes the loop —
// future incidents can now retrieve THIS one as precedent, with real data
// instead of a guess. This is what makes the system get smarter over time.
function ResolveForm({ incidentId, onResolved }) {
  const [rootCause, setRootCause] = useState("");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await request(`/api/incidents/${incidentId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootCause, resolution })
      });
      onResolved(); // only on success — otherwise the UI would claim a fix that was never saved
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-mono uppercase tracking-wider text-console-teal border border-console-teal/30 rounded-full px-3 py-1.5 hover:bg-console-teal/10 transition-colors"
      >
        + Mark resolved
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-console-teal/30 bg-console-teal/5 p-4 space-y-3">
      <p className="font-mono text-[10px] tracking-[0.2em] text-console-teal uppercase">
        Close the loop — record the real fix
      </p>
      <div>
        <label className="font-mono text-[10px] text-console-muted uppercase tracking-wider">Root cause</label>
        <input
          required
          value={rootCause}
          onChange={(e) => setRootCause(e.target.value)}
          placeholder="e.g. connection pool too small for peak load"
          className="w-full bg-console-bg border border-console-border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-console-teal"
        />
      </div>
      <div>
        <label className="font-mono text-[10px] text-console-muted uppercase tracking-wider">Resolution</label>
        <input
          required
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="e.g. increased pool size to 50, added query timeout"
          className="w-full bg-console-bg border border-console-border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-console-teal"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-console-teal text-console-bg font-mono text-xs uppercase tracking-wider px-4 py-2 rounded font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save & feed back into RAG"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-xs uppercase tracking-wider px-4 py-2 text-console-muted hover:text-console-text"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="w-12 h-12 rounded-full border border-console-border flex items-center justify-center mb-4">
        <span className="w-2 h-2 rounded-full bg-console-amber pulse-bar" />
      </div>
      <p className="text-console-text text-sm mb-1">No incident selected</p>
      <p className="text-console-muted text-xs font-mono max-w-xs">
        Select something from the alert stream, or trigger a new one to see retrieval + hypothesis in action.
      </p>
    </div>
  );
}

export default function IncidentDetail({ result, onResolved }) {
  if (!result) return <EmptyState />;

  const { incident, matches, hypothesis, confidence } = result;

  return (
    <div className="h-full overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="font-mono text-[11px] tracking-[0.2em] text-console-muted uppercase">
            {incident.service}
          </p>
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={confidence} />
            {incident.status === "open" && (
              <ResolveForm incidentId={incident._id} onResolved={onResolved} />
            )}
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-console-text tracking-tight">{incident.title}</h1>
        <p className="text-sm text-console-muted mt-2 leading-relaxed">{incident.description}</p>
      </div>

      <div className="mb-6 rounded-xl border border-console-border bg-gradient-to-br from-console-panel to-console-panel/60 p-5">
        <p className="font-mono text-[10px] tracking-[0.2em] text-console-amber uppercase mb-2 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-console-amber" />
          AI Hypothesis
        </p>
        <p className="text-sm text-console-text leading-relaxed whitespace-pre-wrap">{hypothesis}</p>
      </div>

      <div>
        <p className="font-mono text-[10px] tracking-[0.2em] text-console-muted uppercase mb-3">
          Similar Past Incidents ({matches.length})
        </p>
        <div className="space-y-2.5">
          {matches.map((m, i) => (
            <div
              key={i}
              className="rounded-lg border border-console-border bg-console-panel p-4 flex items-center justify-between gap-4 hover:border-console-teal/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-console-text">{m.title}</p>
                <p className="font-mono text-[10px] text-console-muted mt-1">
                  {m.service} · {new Date(m.createdAt).toLocaleDateString()}
                </p>
                <p className="text-xs text-console-muted mt-2">{m.resolution}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <MatchSignal similarity={m.similarity} />
                <span className="font-mono text-[10px] text-console-muted">
                  {(m.similarity * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
          {matches.length === 0 && (
            <p className="text-sm text-console-muted font-mono">No matches above confidence threshold.</p>
          )}
        </div>
      </div>
    </div>
  );
}
