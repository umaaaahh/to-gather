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
//
// `offsetX`/`offsetY` move the WHOLE zone — its art, its tap hotspot and its
// scattered drawings (the tree's leaf canopy) — together, without touching
// the numbers above or anything else in the scene. Positive x = right,
// positive y = down, as a % of the scene-ground box.
const ZONES = [
  {
    id: "tree",
    label: "Colour the tree",
    level: "Easy",
    stars: 1,
    sceneArt: ASSETS.tree,
    // Move the whole tree (art + hotspot + leaves) from here.
    offsetX: "-10%",
    offsetY: "0%",
    top: "45%",
    left: "10%",
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

// A zone position (`top`/`artTop` or `left`/`artLeft`) shifted by the zone's
// offsetY/offsetX, if it has one.
const shifted = (value, offset) => (offset ? `calc(${value} + ${offset})` : value);
const zoneTop = (zone, value = zone.top) => shifted(value, zone.offsetY);
const zoneLeft = (zone, value = zone.left) => shifted(value, zone.offsetX);

// ---- Street artwork ---------------------------------------------------------
// The street is split into separate building pieces so each can be moved on
// its own (e.g. to open up a gap for the tree). `left` is a % of the
// scene-ground box — that's the knob to move a piece. The optional `scale`
// resizes one piece on its own (1 = as tuned); it grows up and to the right
// from its bottom-left corner, so it stays standing on the road.
//
// The buildings are cropped just above their own drawn road, and all sit on
// one shared road + grass strip (ROAD_STRIP) that runs the full length of
// the street along the ground line (the bottom of .scene-ground, which is
// the bottom of the screen at --scene-lift: 0%).
//
// STREET_SCALE sizes the whole street — road strip, both buildings and the
// buildings' `left` positions all scale together, so the layout keeps its
// look. 1 = the layout as tuned below.
//
// The road and buildings were tuned separately, which is where the two base
// sizes come from (in the same units: how thick the drawn grey road would
// come out, as a % of the scene-ground width — equal numbers would be the
// buildings at the true crayon scale of the road). Only touch these to
// re-balance road vs buildings; use STREET_SCALE to resize everything.
//
// All other numbers are measurements of the file, in its own viewBox units:
// `crop` is the region shown (the SVGs have transparent padding around the
// art; the bottom edge is the top of the file's own road), `roadThickness`
// is how thick the file draws the road — used only for scale. Only
// re-measure them if the file is re-exported.
const STREET_SCALE = 1;
const STREET_ROAD_THICKNESS = 8.5 * STREET_SCALE;
const STREET_BUILDING_SIZE = 3.9 * STREET_SCALE;
// Empty road before the first building and after the last one, as a % of
// the scene-ground width. Pieces' `left` is measured from the end of the
// start padding, so changing it keeps the gaps between buildings the same.
const STREET_START_PADDING = 8 * STREET_SCALE;
const STREET_END_PADDING = 4 * STREET_SCALE;

const STREET_PIECES = [
  {
    id: "left",
    src: ASSETS.streetLeft,
    left: "0%",
    scale: 1.1,
    // building 56.svg: viewBox 210.65 × 157.99. Its embedded PNG is at
    // 0.1029 units/px, so these are PNG pixel measurements converted.
    crop: { vbWidth: 210.65, vbHeight: 157.99, x: 8.33, y: 33.9, width: 188.13, height: 77.21 },
    roadThickness: 12.15,
  },
  {
    id: "right",
    src: ASSETS.streetRight,
    left: "72.4%",
    scale: 1.1,
    // building 94.svg: viewBox 2172 × 1512, 1:1 with its embedded PNG.
    crop: { vbWidth: 2172, vbHeight: 1512, x: 184, y: 285, width: 1887, height: 763 },
    roadThickness: 118,
  },
];

// The road + grass strip, two ways (flip ROAD_WHOLE to compare):
//   true  — the whole road drawing once, rounded ends and all, stretched
//           sideways to the street length (thickness is unchanged). The
//           further the street is from the drawing's natural length, the
//           more the crayon grain stretches.
//   false — a slice from the middle (where road and grass are even)
//           repeated along the street; the road file's ends are rounded
//           off and its grass fades out, so it can't tile end to end.
// the road.svg: viewBox 2172 × 1512; road top at y 1048, grass ends ~1321,
// road drawn from x ~187 to ~1989.
const ROAD_WHOLE = true;
const ROAD_STRIP = {
  src: ASSETS.road,
  crop: ROAD_WHOLE
    ? { vbWidth: 2172, vbHeight: 1512, x: 184, y: 1048, width: 1808, height: 273 }
    : { vbWidth: 2172, vbHeight: 1512, x: 500, y: 1048, width: 1200, height: 273 },
  roadThickness: 118,
};

// Width of a piece of art at a given size knob, as a % of the scene-ground
// width.
const artWidth = ({ crop, roadThickness }, size) => (size * crop.width) / roadThickness;
const pieceWidth = (piece) => artWidth(piece, STREET_BUILDING_SIZE * (piece.scale ?? 1));
const pieceLeft = (piece) => STREET_END_PADDING + parseFloat(piece.left) * STREET_SCALE;
const ROAD_TILE_WIDTH = artWidth(ROAD_STRIP, STREET_ROAD_THICKNESS);

// Height of the road strip (road + grass), as a % of the scene-ground WIDTH.
const ROAD_STRIP_HEIGHT = (ROAD_TILE_WIDTH * ROAD_STRIP.crop.height) / ROAD_STRIP.crop.width;

// The road runs from the start of the street to whichever is further: the
// end of the scene-ground box, or the end of the last building plus the end
// padding.
const STREET_LENGTH = Math.max(
  100,
  ...STREET_PIECES.map((p) => pieceLeft(p) + pieceWidth(p) + STREET_END_PADDING),
);
const ROAD_TILE_COUNT = ROAD_WHOLE ? 1 : Math.ceil(STREET_LENGTH / ROAD_TILE_WIDTH);

const pieceBoxStyle = (piece) => ({
  left: `${pieceLeft(piece)}%`,
  width: `${pieceWidth(piece)}%`,
  aspectRatio: `${piece.crop.width} / ${piece.crop.height}`,
  // Stand the building on top of the road strip. A % margin resolves
  // against the containing block's WIDTH, which is what the strip height is
  // a % of too.
  marginBottom: `${ROAD_STRIP_HEIGHT}%`,
});

// Box behind the drawn grey road: exactly the road's own area (the road is
// the top STREET_ROAD_THICKNESS of the road strip), full street length.
// Colour and how far it grows past the road's edges are CSS vars
// (--road-box-*) on .street-scene.
const roadBoxStyle = {
  width: `${STREET_LENGTH}%`,
  aspectRatio: `${STREET_LENGTH} / ${STREET_ROAD_THICKNESS}`,
  marginBottom: `${ROAD_STRIP_HEIGHT - STREET_ROAD_THICKNESS}%`,
};

const roadTileStyle = {
  width: `${(ROAD_TILE_WIDTH / STREET_LENGTH) * 100}%`,
  aspectRatio: `${ROAD_STRIP.crop.width} / ${ROAD_STRIP.crop.height}`,
  // Whole-road mode: stretch the one drawing sideways to exactly the street
  // length. A transform (not width/height) so the SVG really stretches —
  // an <img> of an SVG letterboxes rather than distorting.
  ...(ROAD_WHOLE && {
    transform: `scaleX(${STREET_LENGTH / ROAD_TILE_WIDTH})`,
    transformOrigin: "left",
  }),
};

const pieceImgStyle = ({ crop }) => ({
  width: `${(crop.vbWidth / crop.width) * 100}%`,
  left: `${(-crop.x / crop.width) * 100}%`,
  top: `${(-crop.y / crop.height) * 100}%`,
});

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
        {/* Everything that pans together: the houses (.scene-ground) plus
           the road, so the road scrolls in lock-step with the buildings
           instead of sitting fixed behind them. */}
        <div className="scene-track">
          {/* Asphalt band pinned to the bottom of the track, filling up to
             the ground line (sized by --scene-lift). */}
          <div className="scene-road" style={{ width: `${STREET_LENGTH}%` }} />

          <div className="scene-ground">
            <div className="street-art">
              <div className="street-road-box" style={roadBoxStyle} />
              <div className="street-road-strip" style={{ width: `${STREET_LENGTH}%` }}>
                {Array.from({ length: ROAD_TILE_COUNT }, (_, i) => (
                  <div key={i} className="street-road-tile" style={roadTileStyle}>
                    <img className="house-img" src={ROAD_STRIP.src} alt="" style={pieceImgStyle(ROAD_STRIP)} />
                  </div>
                ))}
              </div>
              {STREET_PIECES.map((piece) => (
                <div key={piece.id} className="street-piece" style={pieceBoxStyle(piece)}>
                  <img className="house-img" src={piece.src} alt="Street view" style={pieceImgStyle(piece)} />
                </div>
              ))}
            </div>

            {/* Everything placed on top of the street art. See .scene-overlay
               in the CSS for why it has its own vertical offset. */}
            <div className="scene-overlay">
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
                      top: zoneTop(zone, zone.artTop ?? zone.top),
                      left: zoneLeft(zone, zone.artLeft ?? zone.left),
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
                  top: zoneTop(treeZone),
                  left: zoneLeft(treeZone),
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
                      top: zoneTop(zone),
                      left: zoneLeft(zone),
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
