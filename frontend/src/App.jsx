import { useState, useEffect } from "react";
import AlertFeed from "./components/AlertFeed.jsx";
import IncidentDetail from "./components/IncidentDetail.jsx";

const EMPTY_FORM = {
  title: "",
  service: "",
  errorType: "",
  description: "",
  stackTrace: ""
};

function StatChip({ label, value, accent }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-mono text-sm font-semibold ${accent}`}>{value}</span>
      <span className="font-mono text-[10px] text-console-muted uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(true); // collapses after a successful trigger

  async function loadIncidents() {
    const res = await fetch("/api/incidents");
    const data = await res.json();
    setIncidents(data);
  }

  useEffect(() => {
    loadIncidents();
  }, []);

  async function triggerAlert(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/incidents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      setResult(data);
      await loadIncidents();
      setForm(EMPTY_FORM);
      setFormOpen(false); // job's done — collapse to give the analysis room to breathe
    } finally {
      setLoading(false);
    }
  }

  async function handleResolved() {
    setResult((prev) => prev && { ...prev, incident: { ...prev.incident, status: "resolved" } });
    await loadIncidents();
  }

  const openCount = incidents.filter((i) => i.status === "open").length;
  const resolvedCount = incidents.filter((i) => i.status === "resolved").length;

  return (
    <div className="h-screen flex flex-col bg-console-bg text-console-text font-sans">
      <header className="border-b border-console-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-console-teal pulse-bar" />
          <h1 className="font-mono text-sm tracking-wide">
            Incident<span className="text-console-amber">IQ</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <StatChip label="Open" value={openCount} accent="text-console-amber" />
          <StatChip label="Resolved" value={resolvedCount} accent="text-console-teal" />
          <p className="font-mono text-[10px] text-console-muted uppercase tracking-widest hidden sm:block">
            RAG-grounded on-call memory
          </p>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-console-border shrink-0">
          <AlertFeed
            incidents={incidents}
            selectedId={result?.incident?._id}
            onSelect={(inc) => {
              setFormOpen(false);
              setResult({
                incident: inc,
                matches: [],
                hypothesis:
                  inc.status === "resolved"
                    ? `Resolved.\n\nRoot cause: ${inc.rootCause}\nResolution: ${inc.resolution}`
                    : "This incident hasn't been analyzed with the current session — trigger a fresh alert to see full retrieval + hypothesis.",
                confidence: "low"
              });
            }}
          />
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Collapsed bar — shown once an alert has been triggered/selected */}
          {!formOpen && (
            <div className="border-b border-console-border px-6 py-3 flex items-center justify-between shrink-0 bg-console-panel/30">
              <p className="font-mono text-[10px] text-console-muted uppercase tracking-wider">
                Form collapsed — trigger a new alert to reopen
              </p>
              <button
                onClick={() => setFormOpen(true)}
                className="font-mono text-xs uppercase tracking-wider text-console-amber border border-console-amber/30 rounded-full px-3 py-1.5 hover:bg-console-amber/10 transition-colors"
              >
                + New Alert
              </button>
            </div>
          )}

          {/* Full form — smoothly collapses/expands rather than snapping */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out shrink-0 bg-console-panel/30 border-b border-console-border ${
              formOpen ? "max-h-[45vh] opacity-100" : "max-h-0 opacity-0 border-b-0"
            }`}
          >
            <form onSubmit={triggerAlert} className="px-6 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] text-console-muted uppercase tracking-wider">New Alert</p>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="font-mono text-[10px] text-console-muted hover:text-console-text uppercase tracking-wider"
                >
                  Collapse ✕
                </button>
              </div>

              <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <label className="font-mono text-[10px] text-console-muted uppercase tracking-wider">Title</label>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Cold-storage sensor fleet going offline"
                    className="w-full bg-console-panel border border-console-border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-console-amber transition-colors"
                  />
                </div>
                <div className="min-w-[180px]">
                  <label className="font-mono text-[10px] text-console-muted uppercase tracking-wider">Service</label>
                  <input
                    required
                    value={form.service}
                    onChange={(e) => setForm({ ...form, service: e.target.value })}
                    placeholder="e.g. iot-telemetry-ingestion"
                    className="w-full bg-console-panel border border-console-border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-console-amber transition-colors"
                  />
                </div>
                <div className="min-w-[180px]">
                  <label className="font-mono text-[10px] text-console-muted uppercase tracking-wider">Error type</label>
                  <input
                    value={form.errorType}
                    onChange={(e) => setForm({ ...form, errorType: e.target.value })}
                    placeholder="e.g. HeartbeatTimeout"
                    className="w-full bg-console-panel border border-console-border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-console-amber transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] text-console-muted uppercase tracking-wider">
                  Description <span className="text-console-amber">(this is what gets embedded — be specific)</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What actually happened, in plain language..."
                  className="w-full bg-console-panel border border-console-border rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-console-amber transition-colors resize-none"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] text-console-muted uppercase tracking-wider">
                  Stack trace <span className="text-console-muted">(optional)</span>
                </label>
                <textarea
                  rows={1}
                  value={form.stackTrace}
                  onChange={(e) => setForm({ ...form, stackTrace: e.target.value })}
                  placeholder="Paste raw error text if you have it..."
                  className="w-full bg-console-panel border border-console-border rounded px-3 py-2 text-xs font-mono mt-1 focus:outline-none focus:border-console-amber transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-console-amber text-console-bg font-mono text-xs uppercase tracking-wider px-5 py-2.5 rounded font-semibold disabled:opacity-50 hover:shadow-[0_0_16px_-2px_rgba(255,176,32,0.5)] transition-shadow"
              >
                {loading ? "Analyzing…" : "Trigger Alert"}
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-hidden">
            <IncidentDetail result={result} onResolved={handleResolved} />
          </div>
        </main>
      </div>
    </div>
  );
}