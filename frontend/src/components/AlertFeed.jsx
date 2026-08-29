export default function AlertFeed({ incidents, selectedId, onSelect }) {
  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-console-border sticky top-0 bg-console-bg z-10">
        <p className="font-mono text-[11px] tracking-[0.2em] text-console-muted uppercase">
          Alert Stream
        </p>
      </div>

      {incidents.length === 0 && (
        <div className="px-4 py-8 text-console-muted text-sm font-mono">
          No incidents yet. Trigger one to begin.
        </div>
      )}

      {incidents.map((inc) => {
        const isSelected = inc._id === selectedId;
        const isOpen = inc.status === "open";
        return (
          <button
            key={inc._id}
            onClick={() => onSelect(inc)}
            className={`w-full text-left px-4 py-3 border-b border-console-border transition-colors
              ${isSelected ? "bg-console-panel" : "hover:bg-console-panel/50"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOpen ? "bg-console-amber pulse-bar" : "bg-console-teal"
                }`}
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-console-muted">
                {inc.service}
              </span>
            </div>
            <p className="text-sm text-console-text leading-snug">{inc.title}</p>
            <p className="font-mono text-[10px] text-console-muted mt-1">
              {new Date(inc.createdAt).toLocaleString()}
            </p>
          </button>
        );
      })}
    </div>
  );
}
