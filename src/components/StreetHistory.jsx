import { useEffect, useRef } from "react";
import { ASSETS, STREET_SIGN_CROP, cropImgStyle } from "../lib/assets";
import RibbonTitle from "./RibbonTitle";
import "./StreetHistory.css";

// The street's history, oldest first. `era` is the short label above each
// entry's title on the timeline; `lookFor` is what you can still see today.
const HISTORY = [
  {
    era: "Always",
    title: "Wurundjeri Woi-wurrung Country",
    body: "Long before the grid, this was a gathering place for the clans of the Kulin Nation. Wurundjeri Elder Uncle Bill Nicholson describes it as a crossroads where songlines heading north and west from the Birrarung met.",
    lookFor: "the 300-year-old scar tree on Princes Park Drive, where bark was cut for a canoe.",
  },
  {
    era: "1852",
    title: "A street with a plan",
    body: "Surveyor Robert Hoddle drew Carlton as a tidy grid of wide streets and garden squares. Within a few decades, land sellers had carved it into narrow lanes and tiny cottages.",
    lookFor: "the skinny lanes running off Cardigan Street.",
  },
  {
    era: "1861",
    title: "A refuge on this street",
    body: "For 136 years, the Carlton Refuge at the north end of Cardigan Street housed young single women and new mothers. Its 1881 chapel was built so every Christian denomination could share it.",
    lookFor: "the little chapel at 469 Cardigan Street, now a community centre.",
  },
  {
    era: "1886 to 1906",
    title: "Boom, bust, build",
    body: "Clare House went up in 1886. Then Melbourne's 1890s crash stopped building for a decade, and the neighbouring terraces weren't finished until 1900 to 1906.",
    lookFor: "“1900” still raised on the shopfront at 83 Cardigan Street.",
  },
  {
    era: "1970",
    title: "Residents vs bulldozers",
    body: "When the Housing Commission planned to flatten Carlton's terraces, locals formed the Carlton Association. In 1970 they became the first community group in Australia to win a union green ban.",
    lookFor: "the terraces still standing all along Cardigan Street. They're here because people fought for them.",
  },
];

// The sign in the About pop-up, in pieces of STREET_SIGN_CROP (387x757):
// the sign down to just above its base (which starts at 715), then copies
// of a plain stretch of its pole (x 28-86, y 200-700) stacked below, enough
// to run off the bottom of any card.
const SIGN_TOP_CROP = { ...STREET_SIGN_CROP, height: 710 };
const SIGN_POLE_CROP = {
  ...STREET_SIGN_CROP,
  x: STREET_SIGN_CROP.x + 28,
  y: STREET_SIGN_CROP.y + 200,
  width: 58,
  height: 500,
};
const SIGN_POLE_PIECES = 3;

// Each piece is a box with its crop's shape, placed where that crop sits
// across the sign's width.
const signPieceStyle = (crop) => ({
  width: `${(crop.width / STREET_SIGN_CROP.width) * 100}%`,
  marginLeft: `${((crop.x - STREET_SIGN_CROP.x) / STREET_SIGN_CROP.width) * 100}%`,
  aspectRatio: `${crop.width} / ${crop.height}`,
});

// The About pop-up (the street's history), opened by tapping the Cardigan
// St sign. The shared popup frame (popup.css) with the sign and a
// hand-drawn timeline inside.
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
      <div className="ui-backdrop" onClick={onClose}>
        <div
          className="ui-titled"
          role="dialog"
          aria-modal="true"
          aria-label="About Cardigan Street"
          onClick={(e) => e.stopPropagation()}
        >
          <RibbonTitle>About</RibbonTitle>
          <button
            ref={closeRef}
            type="button"
            className="ui-close ui-titled-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
          <div className="ui-card history-modal">
            {/* The Cardigan St sign from the street, pinned over the text,
                which scrolls under it: the sign cut off above its base, then
                more of its pole, running off the bottom of the card. */}
            <span className="history-sign" aria-hidden="true">
              {[SIGN_TOP_CROP, ...Array(SIGN_POLE_PIECES).fill(SIGN_POLE_CROP)].map((crop, i) => (
                <span key={i} className="history-sign-piece" style={signPieceStyle(crop)}>
                  <img
                    className="cropped-img"
                    src={ASSETS.streetSign}
                    alt=""
                    draggable="false"
                    style={cropImgStyle({ crop })}
                  />
                </span>
              ))}
            </span>
            <div className="history-body">
              <p className="history-intro">
                Five moments that shaped this street, and where to spot them today.
              </p>

              <ol className="history-timeline">
                {HISTORY.map((h) => (
                  <li key={h.title} className="history-entry">
                    <span className="history-era">{h.era}</span>
                    <h3 className="history-entry-title">{h.title}</h3>
                    <p className="history-entry-body">{h.body}</p>
                    <p className="history-look">
                      <strong>Look for:</strong> {h.lookFor}
                    </p>
                  </li>
                ))}
              </ol>

              <footer className="history-footer">
                <p>
                  This street is on the unceded land of the Wurundjeri Woi-wurrung people. With
                  thanks to Uncle Bill Nicholson, whose knowledge is shared in the first entry.
                </p>
                <p>
                  Sources: Victorian Heritage Database, Carlton Heritage Review (2021), eMelbourne,
                  Victorian Places.
                </p>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
