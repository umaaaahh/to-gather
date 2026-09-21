import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllDrawings, subscribe } from "../lib/drawingsStore";
import { ASSETS } from "../lib/assets";
import "./StreetScene.css";

// Zones are positioned as a % of the scene-ground box so they hold across phone
// widths. `level`/`stars` drive the difficulty tag shown on the hotspot while
// in contribute mode. `sceneArt` is fixed scene furniture (e.g. the tree you
// colour) that's always visible; drawings then stack on top of it.
//
// By default the `sceneArt` image fills the zone box. The optional
// `artTop`/`artLeft`/`artWidth`/`artHeight`/`artFit` fields override ONLY the
// image's box — the tap hotspot and (for the tree) the leaf canopy stay pinned
// to top/left/width/height. `artFit` sets CSS object-fit: "contain" (default)
// keeps the art's aspect ratio; "fill" stretches it to the box, so a taller
// `artHeight` with the same `artWidth` gives a taller tree that's no wider.
const ZONES = [
  {
    id: "tree",
    label: "Colour the tree",
    level: "Easy",
    stars: 1,
    sceneArt: ASSETS.tree,
    top: "45%",
    left: "9%",
    width: "15%",
    height: "60%",
    // Tree art only — stretched taller than the zone box, same width.
    artTop: "-40%",
    artLeft: "10.7%",
    artWidth: "13%",
    artHeight: "240%",
    artFit: "fill",
    // The tree no longer shows a single stretched drawing — contributed
    // leaves scatter into the canopy boxes below (LEAF_BOXES). This box is
    // just the fixture footprint + the frame the leaf boxes are placed in.
  },
  {
    id: "stem",
    label: "Draw a flower",
    level: "Medium",
    stars: 2,
    top: "100.5%",
    left: "35%",
    width: "15%",
    height: "10%",
  },
  {
    id: "free",
    label: "Draw a character",
    level: "Hard",
    stars: 3,
    top: "118%",
    left: "72%",
    width: "24%",
    height: "18%",
  },
];

// ---- Notice board fixture --------------------------------------------------
// Decorative scene furniture, positioned the same way as a zone's `sceneArt`
// (top/left/width/height as a % of the scene-ground box, so it pans with the
// street and holds across phone widths). Not wired to a hotspot yet — once
// it's placed, .notice-board-button gets moved/resized to sit on top of it.
const NOTICE_BOARD = { top: "83%", left: "46.5%", width: "10%", height: "25%" };

// ---- Hidden window "surprise" ----------------------------------------------
// A pulsing button tucked into one of the house windows, view-mode only —
// it disappears once Start is tapped and the zone hotspots take over the
// screen. Box is a % of .scene-ground, same coordinate system as everything
// else above.
const WINDOW_SOUND = { top: "81%", left: "63%", width: "10%", height: "14%" };

// A second window surprise, same pattern as WINDOW_SOUND above — a different
// window pane so the two don't compete for attention. Purely decorative for
// now (no onClick action yet); wire up real content the same way the music
// note button opens its modal.
const WINDOW_BOOK = { top: "81%", left: "77.5%", width: "10%", height: "14%" };

// ---- Scattered zone contributions -----------------------------------------
// Every zone's contributions pile up over time instead of only showing the
// most recent — each new drawing drops into a box (the tree's canopy has
// several, to cluster leaves naturally; the flower bed and character yard
// each just use one spanning the whole zone) at a scattered position. Boxes
// are positioned as a % of the OWNING ZONE's own box (top/left/width/height
// on ZONES above).
//
// Flip SHOW_LEAF_BOXES on to see the tree's canopy boxes (dashed outline +
// a live fill count) while you position them, then set it back to false.
const SHOW_LEAF_BOXES = false;

// Leaves fill box 0 up to its `capacity`, then box 1, and so on. Nudge a
// capacity up for a fuller cluster, down for a sparser one. Extra leaves
// past the last box's capacity still land (they pile into the last box)
// rather than disappearing. `flip: true` mirrors that box's leaves
// horizontally (the wind sway direction is unaffected).
//
// Capacities sum to 149 — the tree zone's query cap in drawingsStore.js
// (ZONE_LIMITS) — split across the three boxes in the same 40:110:60 ratio
// the original (uncapped) design used, so the canopy's visual density stays
// the same shape but never implies more drawings than the query can ever
// actually fetch.
const LEAF_BOXES = [
  { id: "top-left", top: "20%", left: "-20%", width: "60%", height: "20%", capacity: 28 },
  { id: "top-right", top: "5%", left: "25%", width: "70%", height: "35%", capacity: 78, flip: true },
  { id: "low-right", top: "30%", left: "55%", width: "50%", height: "40%", capacity: 43, flip: true },
];

// Flowers don't need the tree's multi-box clustering — one box spanning the
// whole zone is enough, and every contribution lands in it. `capacity`
// documents the stem zone's query cap (drawingsStore.js's ZONE_LIMITS) —
// it's a no-op here since this is the only/last box (see layoutScatter).
const STEM_BOXES = [{ id: "bed", top: "0%", left: "0%", width: "100%", height: "100%", capacity: 25 }];

// Characters roam the road, not just the small "free" hotspot box — the
// walking box below is a separate, wider area (roughly one screen's width
// of road, not the whole scrollable street) that the scatter/walk uses
// instead of ZONES' `free` entry, which stays only as the tap target.
// `capacity` documents the free zone's query cap (ZONE_LIMITS); a no-op here
// for the same reason as STEM_BOXES above.
const FREE_BOXES = [{ id: "yard", top: "0%", left: "0%", width: "100%", height: "100%", capacity: 114 }];
// ~1 screen's width of road: tied to --scene-width (260% of the frame) —
// 100/260 ≈ 38%. If --scene-width changes, nudge this to match.
const FREE_ROAD_BOX = { top: "118%", left: "0%", width: "38%", height: "18%" };

// Every item in a scatter renders at this width (of its container's width,
// via a container query unit). Height follows the artwork's own aspect
// ratio, capped by the CSS max-height clamp (see .scatter-item-img) so it
// can never spill past its zone's own box regardless of this value. One
// knob per zone — everything in that zone comes out the same size; nudge
// to taste once you can see real contributions stacking up. Note: stem/free
// exports are always a square PNG (see DrawingCanvas's handleDone) with the
// visible art only filling part of it, so these need a bigger number than
// you'd guess from the visible drawing's own size to land the same size on
// screen — the max-height clamp is what actually keeps that in check.
const LEAF_WIDTH = "24cqw";
const STEM_WIDTH = "26cqw";
const FREE_WIDTH = "60cqw";

// How far inside a box an item's centre is kept, as a % of the box, so its
// bulk doesn't spill past the box edge.
const LEAF_INSET = 14;
const STEM_INSET = 12;
const FREE_INSET = 14;

// Gentle "wind" sway applied to every item (see .scatter-item--wind in the
// CSS — it animates the image around a top pivot). The tree's leaves and the
// flowers sway; the standing characters stay put.
const LEAF_WIND = true;
const STEM_WIND = true;

// Deterministic 0..1 from an integer seed. Same item index -> same spot on
// every render, so adding item N never reshuffles items 0..N-1.
function seededUnit(seed) {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const asNum = (pctStr) => parseFloat(pctStr);

// Assign each contribution (by arrival order) to a box, then a scattered
// position inside it — all expressed as a % of the container so items can
// live directly in it and the boxes stay pure visual guides. `maxRotDeg`
// caps the random resting tilt (0 keeps everything upright, e.g. the
// standing characters).
function layoutScatter(urls, boxes, { inset = 14, maxRotDeg = 22 } = {}) {
  let boxIdx = 0;
  let countInBox = 0;

  return urls.map((url, i) => {
    while (
      boxIdx < boxes.length - 1 &&
      countInBox >= (boxes[boxIdx].capacity ?? Infinity)
    ) {
      boxIdx += 1;
      countInBox = 0;
    }
    const box = boxes[boxIdx];
    countInBox += 1;

    const bx = asNum(box.left);
    const by = asNum(box.top);
    const bw = asNum(box.width);
    const bh = asNum(box.height);
    const u = seededUnit(i * 2 + 1);
    const v = seededUnit(i * 2 + 2);
    const rot = maxRotDeg ? (seededUnit(i * 3 + 7) - 0.5) * maxRotDeg : 0;

    return {
      key: i,
      url,
      boxId: box.id,
      flip: !!box.flip,
      xPct: bx + ((inset + u * (100 - inset * 2)) / 100) * bw,
      yPct: by + ((inset + v * (100 - inset * 2)) / 100) * bh,
      rot,
    };
  });
}

export default function StreetScene() {
  const navigate = useNavigate();
  const [drawings, setDrawings] = useState(getAllDrawings);
  const [mode, setMode] = useState("view"); // "view" | "contribute"
  const [soundOpen, setSoundOpen] = useState(false);

  useEffect(() => subscribe(setDrawings), []);

  const treeZone = ZONES.find((z) => z.id === "tree");
  const stemZone = ZONES.find((z) => z.id === "stem");

  const treeLeaves = useMemo(
    () => layoutScatter(drawings.tree ?? [], LEAF_BOXES, { inset: LEAF_INSET, maxRotDeg: 22 }),
    [drawings.tree],
  );
  const stemFlowers = useMemo(
    () => layoutScatter(drawings.stem ?? [], STEM_BOXES, { inset: STEM_INSET, maxRotDeg: 8 }),
    [drawings.stem],
  );
  const freeCharacters = useMemo(
    () => layoutScatter(drawings.free ?? [], FREE_BOXES, { inset: FREE_INSET, maxRotDeg: 0 }),
    [drawings.free],
  );

  return (
    <div className="street-scene" data-mode={mode}>
      {/* Two tiles side by side so the drift loop is seamless. */}
      <div className="clouds">
        <img className="cloud-tile" src={ASSETS.clouds} alt="" />
        <img className="cloud-tile" src={ASSETS.clouds} alt="" />
      </div>

      {/* Horizontal pan track: the frame stays phone-sized, this scrolls
         left/right across the full-length street inside it. */}
      <div className="street-scroll">
        {/* Everything that pans together: houses/footpath (.scene-ground)
           plus the road, so the road scrolls in lock-step with the
           buildings instead of sitting fixed behind them. */}
        <div className="scene-track">
          {/* Asphalt band pinned to the bottom of the track, sized by
             --road-height independently of where the scene sits. */}
          <div className="scene-road" />

          <div className="scene-ground">
            <div className="ground-kerb" />
            <div className="ground-footpath" />

            <img className="scene-layer house" src={ASSETS.house} alt="Street view" />

            {/* Fixed scene furniture (the tree you colour). Always visible; the
               drawings sit on top of it. */}
            {ZONES.map((zone) =>
              zone.sceneArt ? (
                <img
                  key={`fixture-${zone.id}`}
                  className="zone-fixture"
                  src={zone.sceneArt}
                  alt=""
                  style={{
                    top: zone.artTop ?? zone.top,
                    left: zone.artLeft ?? zone.left,
                    width: zone.artWidth ?? zone.width,
                    height: zone.artHeight ?? zone.height,
                    objectFit: zone.artFit,
                  }}
                />
              ) : null,
            )}

            {/* Notice board fixture — see NOTICE_BOARD above for its box.
               High z-index so it always renders on top of the rest of the
               scene (house, tree, scattered contributions, etc). */}
            <img
              className="notice-board-art"
              src={ASSETS.noticeBoard}
              alt=""
              style={{
                top: NOTICE_BOARD.top,
                left: NOTICE_BOARD.left,
                width: NOTICE_BOARD.width,
                height: NOTICE_BOARD.height,
              }}
            />

            {/* Tap target for the notice board — same box as the art above,
               so it pans with it and lines up exactly instead of living in
               a separate fixed-to-frame coordinate system. The hit area
               covers the whole board; the visible shiny label badge inside
               is centred and naturally sized so it doesn't get stretched
               into the board's own (portrait) proportions. View mode only,
               same as the window surprise — gone once Start reveals the
               zone hotspots, back once Return drops back to the clean view. */}
            {mode === "view" && (
              <button
                type="button"
                className="notice-board-button"
                onClick={() => navigate("/notices")}
                aria-label="Community notice board"
                style={{
                  top: NOTICE_BOARD.top,
                  left: NOTICE_BOARD.left,
                  width: NOTICE_BOARD.width,
                  height: NOTICE_BOARD.height,
                }}
              >
                <span className="notice-board-badge">Notice Board</span>
              </button>
            )}

            {/* Hidden window surprise — view mode only, gone the moment
               Start reveals the zone hotspots. */}
            {mode === "view" && (
              <button
                type="button"
                className="window-sound-button"
                onClick={() => setSoundOpen(true)}
                aria-label="Something's playing in the window"
                style={{
                  top: WINDOW_SOUND.top,
                  left: WINDOW_SOUND.left,
                  width: WINDOW_SOUND.width,
                  height: WINDOW_SOUND.height,
                }}
              >
                <span className="window-sound-dot" aria-hidden="true">
                  🎵
                </span>
              </button>
            )}

            {/* Second window surprise — same view-mode-only pattern as the
               music note above, no action wired up yet. */}
            {mode === "view" && (
              <button
                type="button"
                className="window-sound-button"
                onClick={() => {}}
                aria-label="Something's in the window"
                style={{
                  top: WINDOW_BOOK.top,
                  left: WINDOW_BOOK.left,
                  width: WINDOW_BOOK.width,
                  height: WINDOW_BOOK.height,
                }}
              >
                <span className="window-sound-dot" aria-hidden="true">
                  📖
                </span>
              </button>
            )}

            {/* Tree canopy: the leaf boxes (guides, toggled by SHOW_LEAF_BOXES)
               plus every contributed leaf scattered into them. */}
            <div
              className="scatter"
              data-show-boxes={SHOW_LEAF_BOXES ? "true" : "false"}
              style={{
                top: treeZone.top,
                left: treeZone.left,
                width: treeZone.width,
                height: treeZone.height,
                "--item-w": LEAF_WIDTH,
              }}
            >
              {SHOW_LEAF_BOXES &&
                LEAF_BOXES.map((box) => {
                  const fill = treeLeaves.filter((l) => l.boxId === box.id).length;
                  return (
                    <div
                      key={`box-${box.id}`}
                      className="leaf-box"
                      style={{
                        top: box.top,
                        left: box.left,
                        width: box.width,
                        height: box.height,
                      }}
                    >
                      <span className="leaf-box-tag">
                        {box.id} · {fill}/{box.capacity}
                      </span>
                    </div>
                  );
                })}

              {treeLeaves.map((leaf) => (
                <div
                  key={`leaf-${leaf.key}`}
                  className={`scatter-item${LEAF_WIND ? " scatter-item--wind" : ""}${
                    leaf.flip ? " scatter-item--flip" : ""
                  }`}
                  style={{
                    left: `${leaf.xPct}%`,
                    top: `${leaf.yPct}%`,
                    "--item-rot": `${leaf.rot.toFixed(1)}deg`,
                    // spread the sway so leaves don't move in lockstep
                    animationDelay: `${-(((leaf.key * 0.53) % 3.4)).toFixed(2)}s`,
                  }}
                >
                  <img
                    className="scatter-item-img"
                    src={leaf.url}
                    alt=""
                    draggable={false}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            {/* Flower bed: every contributed flower scatters into it, same
               mechanism as the tree canopy above. */}
            <div
              className="scatter"
              style={{
                top: stemZone.top,
                left: stemZone.left,
                width: stemZone.width,
                height: stemZone.height,
                "--item-w": STEM_WIDTH,
              }}
            >
              {stemFlowers.map((item) => (
                <div
                  key={`stem-${item.key}`}
                  className={`scatter-item scatter-item--rooted${STEM_WIND ? " scatter-item--wind" : ""}`}
                  style={{
                    left: `${item.xPct}%`,
                    top: `${item.yPct}%`,
                    "--item-rot": `${item.rot.toFixed(1)}deg`,
                    // spread the sway so flowers don't move in lockstep
                    animationDelay: `${-(((item.key * 0.53) % 3.4)).toFixed(2)}s`,
                  }}
                >
                  <img
                    className="scatter-item-img"
                    src={item.url}
                    alt=""
                    draggable={false}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            {/* Road walk: every contributed character wanders around this
               band instead of sitting still in the small "free" hotspot
               box (that stays below, contribute-mode only, as the tap
               target). */}
            <div
              className="scatter"
              style={{
                top: FREE_ROAD_BOX.top,
                left: FREE_ROAD_BOX.left,
                width: FREE_ROAD_BOX.width,
                height: FREE_ROAD_BOX.height,
                "--item-w": FREE_WIDTH,
              }}
            >
              {freeCharacters.map((item) => (
                <div
                  key={`free-${item.key}`}
                  className="scatter-item scatter-item--rooted scatter-item--walking"
                  style={{
                    left: `${item.xPct}%`,
                    top: `${item.yPct}%`,
                    "--item-rot": `${item.rot.toFixed(1)}deg`,
                    // seeded per character so nobody paces in lockstep —
                    // 15-30cqw of wander, a 5-9s stroll, a 2-4cqw hop, staggered starts
                    "--walk-dist": `${(15 + seededUnit(item.key * 7 + 3) * 15).toFixed(1)}cqw`,
                    "--walk-dur": `${(5 + seededUnit(item.key * 11 + 5) * 4).toFixed(1)}s`,
                    "--walk-hop": `${(2 + seededUnit(item.key * 13 + 9) * 2).toFixed(1)}cqw`,
                    animationDelay: `${-(((item.key * 0.71) % 5)).toFixed(2)}s`,
                  }}
                >
                  <img
                    className="scatter-item-img"
                    src={item.url}
                    alt=""
                    draggable={false}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>

            {/* Hotspots — only while contributing. */}
            {mode === "contribute" &&
              ZONES.map((zone) => (
                <button
                  key={`hot-${zone.id}`}
                  className="zone"
                  style={{
                    top: zone.top,
                    left: zone.left,
                    width: zone.width,
                    height: zone.height,
                  }}
                  onClick={() => navigate(`/draw/${zone.id}`)}
                  aria-label={`${zone.label} — ${zone.level}`}
                >
                  <span className="zone-label">
                    <span className="zone-label-text">{zone.label}</span>
                    <span className="zone-tag">
                      <span className="zone-stars" aria-hidden="true">
                        {"★".repeat(zone.stars)}
                        {"☆".repeat(3 - zone.stars)}
                      </span>
                      {zone.level}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Bottom-centre call to action: reveal the zones, or drop back to the
         clean view. */}
      <button
        className="scene-cta"
        onClick={() => setMode((m) => (m === "view" ? "contribute" : "view"))}
      >
        {mode === "view" ? "Start" : "Return"}
      </button>

      {soundOpen && (
        <div className="sound-modal-backdrop" onClick={() => setSoundOpen(false)}>
          <div className="sound-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="sound-modal-close"
              onClick={() => setSoundOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <iframe
              title="Melbourne playlist"
              width="100%"
              height="300"
              scrolling="no"
              frameBorder="no"
              allow="autoplay; encrypted-media"
              src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/playlists/soundcloud%253Aplaylists%253A2297287761&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"
            />
          </div>
        </div>
      )}
    </div>
  );
}
