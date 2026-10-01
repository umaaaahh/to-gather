import { useEffect, useRef } from "react";
import "./StreetHistory.css";

// The street's history, oldest first. Placeholder entries until the real
// history of Cardigan St is written up — swap these out (and add more) as
// it comes in. `era` is the short label on the timeline dot.
const HISTORY = [
  { era: "Then", title: "Before the street", body: "Placeholder — who was here first, and what the land was." },
  { era: "Later", title: "The street is laid out", body: "Placeholder — when Cardigan St got its name, and why." },
  { era: "Since", title: "The street changes", body: "Placeholder — the shops, houses and people that came and went." },
  { era: "Now", title: "Cardigan St today", body: "Placeholder — what the street is like now, and who keeps it going." },
];

// The history pop-up, opened by tapping the Cardigan St sign. Same layer,
// blurred backdrop and crayon card as the bookshelf (see Bookshelf.css).
export default function StreetHistoryLayer({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="history-layer">
      <div className="history-backdrop" onClick={onClose}>
        <div
          className="history-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="history-header">
            <h2 id="history-title" className="history-title">
              Cardigan St
              <span>a history of the street</span>
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="history-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <ol className="history-timeline">
            {HISTORY.map((h) => (
              <li key={h.title} className="history-entry">
                <span className="history-era">{h.era}</span>
                <h3 className="history-entry-title">{h.title}</h3>
                <p className="history-entry-body">{h.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
