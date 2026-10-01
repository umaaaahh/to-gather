import { useEffect, useRef, useState } from "react";
import "./StreetStats.css";

// The street's numbers: Carlton (the suburb Cardigan St runs through) against
// the rest of Victoria. Source: ABS 2021 Census QuickStats, Carlton
// (SAL20495) and Victoria, CC BY 4.0. Percentages are of people, except the
// homes chart (of dwellings).

// The headline tiles: [label, Carlton, Victoria, bar max, is a %].
const TILES = [
  ["Median age", 27, 38, 50, false],
  ["Aged 20 to 29", 45.7, 13.6, 50, true],
  ["Live in a flat or apartment", 80.7, 12.1, 100, true],
  ["Rent their home", 72.3, 28.5, 100, true],
  ["Households with no car", 47.6, 7.5, 100, true],
  ["Walked to work", 13.3, 2.3, 50, true],
  ["Use a language other than English at home", 53.5, 30.2, 100, true],
  ["Born in Australia", 39.1, 65.0, 100, true],
];

// Fig. 1: [age band, Carlton %, Victoria %]. The chart's y axis tops out at
// AGE_MAX.
const AGES = [
  ["0-4", 1.9, 5.8], ["5-9", 1.8, 6.2], ["10-14", 1.7, 6.0], ["15-19", 6.3, 5.6],
  ["20-24", 24.2, 6.3], ["25-29", 21.5, 7.3], ["30-34", 12.4, 7.7], ["35-39", 6.7, 7.5],
  ["40-44", 4.1, 6.6], ["45-49", 3.1, 6.4], ["50-54", 2.9, 6.3], ["55-59", 2.7, 5.9],
  ["60-64", 2.3, 5.6], ["65-69", 2.2, 4.9], ["70-74", 2.0, 4.4], ["75-79", 1.5, 3.1],
  ["80-84", 1.3, 2.2], ["85+", 1.4, 2.2],
];
const AGE_MAX = 25;

// Figs. 2 and 3 are bar rows: [label, Carlton %, Victoria %], bars scaled to
// `max`.
const FIGS = {
  age: {
    tab: "Fig. 1 Age",
    no: "FIG. 1 · AGE",
    title: "A suburb of twenty-somethings",
    finding: "Almost half of Carlton is aged 20 to 29. Across Victoria it is about one in seven.",
  },
  work: {
    tab: "Fig. 2 Work",
    no: "FIG. 2 · GETTING TO WORK",
    title: "Feet beat cars",
    finding: "Carlton walks to work six times as often as Victoria, and drives a third as often.",
    note: "Census day was 10 August 2021, during a Melbourne COVID lockdown, so many people worked at home. People could pick up to three ways of travel, so bars do not add to 100%.",
    max: 50,
    rows: [
      ["Worked at home", 35.8, 25.7], ["Car, as driver", 14.4, 49.9], ["Walked only", 13.3, 2.3],
      ["Tram", 8.0, 0.6], ["Bicycle", 3.3, 0.7], ["Train", 2.2, 1.6],
    ],
  },
  homes: {
    tab: "Fig. 3 Homes",
    no: "FIG. 3 · HOMES",
    title: "Apartments, not backyards",
    finding: "Eight in ten Carlton homes are flats or apartments. Only 1 in 100 is a separate house.",
    max: 100,
    rows: [
      ["Flat or apartment", 80.7, 12.1], ["Terrace or townhouse", 17.1, 13.9], ["Separate house", 1.3, 73.4],
    ],
  },
};

const pct = (n) => `${Math.round(n * 10) / 10}%`;
const tilt = (i) => `${i % 3 === 0 ? -0.6 : i % 3 === 1 ? 0.5 : 0}deg`;

// The street stats popup, opened by tapping the neon poster on the street.
// Same layer and blurred backdrop as the history popup (StreetHistory.css),
// with a neon graph-paper card inside.
export default function StreetStatsLayer({ open, onClose }) {
  const closeRef = useRef(null);
  const [tab, setTab] = useState("age");
  const [age, setAge] = useState(4); // 20-24, the tallest bar
  const [row, setRow] = useState(0);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const fig = FIGS[tab];
  let readout;
  if (tab === "age") {
    const [band, c, v] = AGES[age];
    readout = `Ages ${band}: Carlton ${pct(c)} · Victoria ${pct(v)}`;
  } else {
    const [label, c, v] = fig.rows[Math.min(row, fig.rows.length - 1)];
    readout = `${label}: Carlton ${pct(c)} · Victoria ${pct(v)}`;
  }

  return (
    <div className="stats-layer">
      <div className="stats-backdrop" onClick={onClose}>
        <div
          className="stats-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stats-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            ref={closeRef}
            type="button"
            className="stats-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l12 12M15 3L3 15" />
            </svg>
          </button>

          <div className="stats-scroll">
            <header className="stats-header">
              <div className="stats-kicker stats-glow">Field report · Carlton 3053</div>
              <h2 id="stats-title" className="stats-title">
                <span>Street stats</span>
              </h2>
              <p className="stats-intro">
                Who lives around Cardigan Street? Here's the 2021 Census, measured against the rest of Victoria.
              </p>
              <div className="stats-floor" aria-hidden="true" />
            </header>

            <div className="stats-legend">
              <span><i className="stats-swatch stats-swatch--carlton" />Carlton</span>
              <span><i className="stats-swatch stats-swatch--vic" />Victoria</span>
            </div>

            <div className="stats-tiles">
              {TILES.map(([label, c, v, max, isPct], i) => (
                <div key={label} className="stats-tile" style={{ transform: `rotate(${tilt(i)})` }}>
                  <div className="stats-tile-label">{label}</div>
                  <div className="stats-tile-values">
                    <span className="stats-tile-c stats-glow">{isPct ? `${Math.round(c)}%` : c}</span>
                    <span className="stats-tile-v">VIC {isPct ? `${Math.round(v)}%` : v}</span>
                  </div>
                  <div className="stats-tile-bars">
                    <div className="stats-bar stats-bar--carlton" style={{ width: `${(c / max) * 100}%` }} />
                    <div className="stats-bar stats-bar--vic" style={{ width: `${(v / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="stats-charts">
              <div role="tablist" aria-label="Charts" className="stats-tabs">
                {Object.entries(FIGS).map(([id, f]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className="stats-tab"
                    onClick={() => {
                      setTab(id);
                      setRow(0);
                    }}
                  >
                    {f.tab}
                  </button>
                ))}
              </div>

              <div className="stats-fig">
                <div className="stats-fig-head">
                  <div className="stats-fig-no">{fig.no}</div>
                  <h3 className="stats-fig-title stats-glow">{fig.title}</h3>
                  <div className="stats-fig-finding">{fig.finding}</div>
                </div>

                {tab === "age" ? (
                  <div className="stats-age">
                    <div className="stats-age-axis" aria-hidden="true">
                      <span>25%</span><span>20%</span><span>15%</span><span>10%</span><span>5%</span><span>0</span>
                    </div>
                    <div className="stats-age-main">
                      <div className="stats-age-plot">
                        {AGES.map(([band, c, v], i) => (
                          <button
                            key={band}
                            type="button"
                            className="stats-age-col"
                            data-on={age === i}
                            onClick={() => setAge(i)}
                            aria-label={`Ages ${band}: Carlton ${pct(c)}, Victoria ${pct(v)}`}
                          >
                            <span className="stats-col stats-bar--carlton" style={{ height: `${(c / AGE_MAX) * 100}%` }} />
                            <span className="stats-col stats-bar--vic" style={{ height: `${(v / AGE_MAX) * 100}%` }} />
                          </button>
                        ))}
                      </div>
                      <div className="stats-age-ticks" aria-hidden="true">
                        {AGES.map(([band], i) => (
                          <span key={band}>{i % 4 === 0 ? band.split("-")[0] : ""}</span>
                        ))}
                      </div>
                      <div className="stats-age-caption">age (years)</div>
                    </div>
                  </div>
                ) : (
                  <div className="stats-rows">
                    {fig.rows.map(([label, c, v], i) => (
                      <button
                        key={label}
                        type="button"
                        className="stats-row"
                        data-on={row === i}
                        onClick={() => setRow(i)}
                      >
                        <span className="stats-row-label">{label}</span>
                        <span className="stats-row-bars">
                          <span className="stats-row-line">
                            <span className="stats-bar stats-bar--carlton" style={{ width: `calc(${c / fig.max} * (100% - 48px))` }} />
                            <span className="stats-row-c">{pct(c)}</span>
                          </span>
                          <span className="stats-row-line">
                            <span className="stats-bar stats-bar--vic" style={{ width: `calc(${v / fig.max} * (100% - 48px))` }} />
                            <span className="stats-row-v">{pct(v)}</span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="stats-readout" aria-live="polite">{readout}</div>
                {fig.note && <div className="stats-note">{fig.note}</div>}
              </div>
              <div className="stats-hint">tap a bar to measure it</div>
            </div>

            <div className="stats-source">
              Source: Australian Bureau of Statistics, 2021 Census QuickStats, Carlton (SAL20495) and Victoria. Licensed CC BY 4.0.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
