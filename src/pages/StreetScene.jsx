import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutlet } from "react-router-dom";
import StreetTour from "../components/StreetTour";
import SunButton from "../components/SunButton";
import DrawingArrival from "../components/DrawingArrival";
import {
  getAllDrawings,
  subscribe,
  subscribeToSaveErrors,
  subscribeToSubmissions,
} from "../lib/drawingsStore";
import { ASSETS } from "../lib/assets";
import "./StreetScene.css";

// Zones are positioned as a % of the scene-ground box so they hold across phone
// widths. `level`/`stars` drive the difficulty tag shown on the hotspot while
// in contribute mode. The tree zone isn't here — its hotspots and leaves live
// on the crayon trees (see CRAYON_TREES).
//
// `offsetX`/`offsetY` move a zone's tap hotspot without touching the numbers
// above or anything else in the scene. Positive x = right, positive y = down,
// as a % of the scene-ground box.
const ZONES = [
  {
    id: "free",
    label: "Draw a character",
    level: "Hard",
    stars: 3,
    top: "105.5%", // on the road
    left: "72%",
    width: "24%",
    height: "18%",
  },
];

// A zone's `top`/`left` shifted by its offsetY/offsetX, if it has one.
const shifted = (value, offset) => (offset ? `calc(${value} + ${offset})` : value);
const zoneTop = (zone) => shifted(zone.top, zone.offsetY);
const zoneLeft = (zone) => shifted(zone.left, zone.offsetX);

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
// Decorative scene furniture, positioned the same way as the zones
// (top/left/width/height as a % of the scene-ground box, so it pans with the
// street and holds across phone widths). Not wired to a hotspot yet — once
// it's placed, .notice-board-button gets moved/resized to sit on top of it.
//
// It lives in .scene-track (not .scene-overlay), so it's anchored to the
// bottom of the screen and ignores --scene-lift / --overlay-offset-y.
// To move/resize it, edit only these three numbers (all % of the street):
//   bottom — gap between the board's feet and the screen bottom (0 = on the edge,
//            bigger = higher, negative = sinks below the edge)
//   left   — distance of the board's left edge from the left (bigger = further right)
//   height — board size, grows upward from its feet; width follows automatically
const NOTICE_BOARD_POS = { bottom: 0, left: 52, height: 40 };

// Width = height x the art's 1728:2442 ratio, converted through the
// scene-ground's 660:285 aspect, so the tap target hugs the board.
const NOTICE_BOARD_WIDTH =
  NOTICE_BOARD_POS.height * (1728 / 2442) * (285 / 660);
const NOTICE_BOARD = {
  bottom: `${NOTICE_BOARD_POS.bottom}%`,
  left: `${NOTICE_BOARD_POS.left}%`,
  width: `${NOTICE_BOARD_WIDTH}%`,
  height: `${NOTICE_BOARD_POS.height}%`,
};

// Where the orange "Notice Board" badge sits ON the board, as a % of the
// board itself (so it moves with the board). This is the badge's centre point:
//   top  — 0 = board's top edge, 50 = middle, 100 = the feet
//   left — 0 = board's left edge, 50 = middle, 100 = right edge
const NOTICE_BADGE_POS = { top: 43, left: 50 };

// Crayon trees — the "tree" zone's leaves live on these. Same % coordinates
// as above, one box per tree. The image keeps its aspect ratio
// (object-fit: contain). `flip: true` mirrors the tree left-to-right.
//
// Every tree is its own tap target, but only one is open at a time: they fill
// left to right, and a tree stays greyed out and locked (in contribute mode)
// until the one before it is full. All three share the tree zone's drawings —
// which tree a leaf lands on comes from its arrival order, not which tree
// was tapped, so two people finishing the last leaves of a tree at once
// just spill onto the next one instead of being locked out.
//
// `leafBoxes` are that tree's canopy boxes, as a % of the TREE's own box.
// Leaves fill tree 1's boxes in order, then tree 2's, and so on (see
// layoutScatter). Tree 2 gets a full canopy (78 / 28 / 43 = 149, the old
// tree's split); trees 1 and 3 are half off-screen, so they only get two
// boxes over the part that shows, at half capacity (75 each).
// Capacities sum to 299 — keep drawingsStore.js's ZONE_LIMITS.tree at that
// plus its overflow buffer.
const CRAYON_TREES = [
  {
    id: "tree-1",
    top: "55%",
    left: "-5.5%",
    width: "15%",
    height: "50%",
    // Left third is off the start of the street — right side only.
    leafBoxes: [
      { id: "top-right", top: "-10%", left: "37.5%", width: "40%", height: "45%", capacity: 30, flip: true },
      { id: "low-right", top: "22%", left: "55%", width: "50%", height: "45%", capacity: 45, flip: true },
    ],
  },
  {
    id: "tree-2",
    top: "57%",
    left: "67%",
    width: "12%",
    height: "50%",
    flip: true,
    leafBoxes: [
      { id: "top-left", top: "-5%", left: "10%", width: "75%", height: "45%", capacity: 78 },
      { id: "top-right", top: "3%", left: "75%", width: "40%", height: "35%", capacity: 28, flip: true },
      { id: "low-right", top: "25%", left: "-8%", width: "50%", height: "40%", capacity: 43, flip: true },
    ],
  },
  {
    id: "tree-3",
    top: "55%",
    left: "139%",
    width: "15%",
    height: "50%",
    flip: true,
    // Right third is past the end of the road — left side only. Last tree,
    // so its last box also takes the overflow buffer.
    leafBoxes: [
      { id: "top-left", top: "-10%", left: "10%", width: "55%", height: "45%", capacity: 45 },
      { id: "low-left", top: "25%", left: "2%", width: "45%", height: "40%", capacity: 30 },
    ],
  },
];

// The label on whichever tree is open.
const TREE_HOTSPOT = { label: "Colour the tree", level: "Easy", stars: 1 };

// Every tree's tap box runs between the same two lines, whatever each tree's
// own box is — TREE_HOTSPOT_TOP down to TREE_HOTSPOT_BOTTOM, as a % of the
// scene-ground box (like the trees' `top`). Widths follow each tree.
const TREE_HOTSPOT_TOP = 45;
const TREE_HOTSPOT_BOTTOM = 105;

// Every tree's leaf boxes chained left to right, so layoutScatter fills
// tree 1, then tree 2, ... Box ids become "tree-1/top-left" etc.
const TREE_LEAF_BOXES = CRAYON_TREES.flatMap((t) =>
  t.leafBoxes.map((box) => ({ ...box, id: `${t.id}/${box.id}` })),
);
const treeCapacity = (t) => t.leafBoxes.reduce((sum, box) => sum + box.capacity, 0);

// CRAYON_TREES are % of .scene-ground; they render inside .crayon-trees,
// which is STREET_LENGTH% of that, so left/width get rescaled to it.
const crayonTreeBox = (t) => ({
  top: t.top,
  left: `${(parseFloat(t.left) * 100) / STREET_LENGTH}%`,
  width: `${(parseFloat(t.width) * 100) / STREET_LENGTH}%`,
  height: t.height,
});

// The tree's box, stretched between TREE_HOTSPOT_TOP and TREE_HOTSPOT_BOTTOM.
// Trees 1 and 3 hang off the ends of .crayon-trees, which clips them, so the
// off-street part of the box is padded out — the label then centres (and
// wraps) inside the part that shows instead of being cut off. Padding % is of
// the containing block (.crayon-trees), same as left/width.
const treeHotspotBox = (t) => {
  const left = parseFloat(t.left);
  const right = left + parseFloat(t.width);
  const hiddenLeft = Math.max(0, -left);
  const hiddenRight = Math.max(0, right - STREET_LENGTH);
  return {
    ...crayonTreeBox(t),
    top: `${TREE_HOTSPOT_TOP}%`,
    height: `${TREE_HOTSPOT_BOTTOM - TREE_HOTSPOT_TOP}%`,
    paddingLeft: `${(hiddenLeft * 100) / STREET_LENGTH}%`,
    paddingRight: `${(hiddenRight * 100) / STREET_LENGTH}%`,
  };
};

// ---- Hidden window "surprise" ----------------------------------------------
// A pulsing button tucked into one of the house windows, view-mode only —
// it disappears once Start is tapped and the zone hotspots take over the
// screen. Box is a % of .scene-ground, same coordinate system as everything
// else above.
const WINDOW_SOUND = { top: "84.5%", left: "15%", width: "8%", height: "14%" };

// A second window surprise, same pattern as WINDOW_SOUND above — a different
// window pane so the two don't compete for attention. Opens the community
// bookshelf popup (see Bookshelf.jsx), the same way the boombox opens the
// radio.
const WINDOW_BOOK = { top: "86.5%", left: "33.5%", width: "6%", height: "14%" };

// ---- Scattered zone contributions -----------------------------------------
// Every zone's contributions pile up over time instead of only showing the
// most recent — each new drawing drops into a box (the tree's canopy has
// several, to cluster leaves naturally; each flower bed and the character yard
// just use one spanning the whole zone) at a scattered position. Boxes
// are positioned as a % of the OWNING ZONE's own box (top/left/width/height
// on ZONES above).
//
// Flip SHOW_LEAF_BOXES on to see the crayon trees' canopy boxes (dashed
// outline + a live fill count) while you position them, then set it back to
// false.
const SHOW_LEAF_BOXES = false;

// The trees' canopy boxes live on CRAYON_TREES (`leafBoxes`). Leaves fill box
// 0 up to its `capacity`, then box 1, and so on. Nudge a capacity up for a
// fuller cluster, down for a sparser one. Extra leaves past the last box's
// capacity still land (they pile into the last box) rather than
// disappearing. `flip: true` mirrors that box's leaves horizontally (the
// wind sway direction is unaffected).

// Flower beds on the grass — the "stem" zone, split into beds the way the
// tree zone is split into trees. Same % coordinates as ZONES (of the
// scene-ground box). The road runs ≈ 104.5–124% down and the visible grass
// ≈ 124–140%, so beds sit in that band. The notice board covers ≈ 52–64%
// across and is drawn over the whole scene, so keep beds clear of that gap.
//
// Every bed is its own tap target, but only one is open at a time: they fill
// left to right, and a bed stays locked (in contribute mode) until the one
// before it is full. All share the stem zone's drawings — which bed a flower
// lands in comes from its arrival order, not which bed was tapped.
// Capacities sum to 100 — keep drawingsStore.js's ZONE_LIMITS.stem at that
// plus its overflow buffer (the last bed takes the overflow).
const FLOWER_BEDS = [
  { id: "bed-1", top: "127%", left: "8%", width: "15%", height: "10%", capacity: 20 },
  { id: "bed-2", top: "127%", left: "32%", width: "15%", height: "10%", capacity: 20 },
  { id: "bed-3", top: "127%", left: "68%", width: "15%", height: "10%", capacity: 20 },
  { id: "bed-4", top: "127%", left: "96%", width: "15%", height: "10%", capacity: 20 },
  { id: "bed-5", top: "127%", left: "124%", width: "15%", height: "10%", capacity: 20 },
];

// The label on whichever bed is open.
const FLOWER_HOTSPOT = { label: "Draw a flower", level: "Medium", stars: 2 };

// One scatter box per bed, covering the bottom half of it — a flower is
// planted at its root and grows upward, so keeping roots low keeps the
// (big) flowers sitting down on the grass. Flowers don't need the
// tree's multi-box clustering. Chained left to right so layoutScatter fills
// bed 1, then bed 2, ...
const STEM_BOXES = FLOWER_BEDS.map((b) => ({
  id: b.id,
  top: "50%",
  left: "0%",
  width: "100%",
  height: "50%",
  capacity: b.capacity,
}));

const bedBox = (b) => ({ top: b.top, left: b.left, width: b.width, height: b.height });

// Characters roam the road, not just the small "free" hotspot box — the
// walking box below is a separate, wider area (roughly one screen's width
// of road, not the whole scrollable street) that the scatter/walk uses
// instead of ZONES' `free` entry, which stays only as the tap target.
// `capacity` documents the free zone's query cap (ZONE_LIMITS); a no-op here
// since it is the only/last box (see layoutScatter).
const FREE_BOXES = [{ id: "yard", top: "0%", left: "0%", width: "100%", height: "100%", capacity: 114 }];
// ~1 screen's width of road: tied to --scene-width (260% of the frame) —
// 100/260 ≈ 38%. If --scene-width changes, nudge this to match.
// Edit these four numbers to move/resize where characters walk (same %
// coordinates as ZONES — of the scene-ground box).
const FREE_ROAD_BOX = { top: "105.5%", left: "0%", width: "147%", height: "18%" };

// Flip SHOW_WALK_BOX on to see FREE_ROAD_BOX on the street (dashed outline +
// its numbers) while you position it, then set it back to false.
const SHOW_WALK_BOX = false;

// Characters' size and movement, as a % of the scene-ground WIDTH — fixed,
// whatever shape FREE_ROAD_BOX is, so resizing the box only changes how much
// room they have. Drawings are square, so CHARACTER_SIZE is both width and
// height.
//
// Each character strolls back and forth along the walk box (see
// planWalks). WALK_REACH is how much of the box's length one stroll covers
// ([min, max], seeded per character): 1 = end to end. They all walk at
// WALK_SPEED (% of the scene width per second), bobbing a WALK_HOP-high hop
// about every HOP_SECONDS.
const CHARACTER_SIZE = 6;
const WALK_REACH = [0.5, 1];
const WALK_SPEED = 2.5;
const WALK_HOP = [0.5, 1];
const HOP_SECONDS = 0.45;

// The same in the walk box's own units (the scatter's cqw / % of its box).
// The scene-ground is 660:285, so its height is 285/660 of its width.
const WALK_BOX_W = parseFloat(FREE_ROAD_BOX.width);
const WALK_BOX_H = (parseFloat(FREE_ROAD_BOX.height) * 285) / 660;
const toWalkBoxW = (v) => (v / WALK_BOX_W) * 100;
const toWalkBoxH = (v) => (v / WALK_BOX_H) * 100;

// The box is a hard limit. Left/right is handled by planWalks. Top/bottom:
// feet stay low enough for the whole character plus its highest hop to fit
// above them, and a touch up from the bottom edge. (If the box is shorter
// than a character, feet just sit on its bottom edge.)
const FREE_INSET_BOTTOM = 3;
const FREE_INSET_TOP = Math.min(toWalkBoxH(CHARACTER_SIZE + WALK_HOP[1]), 100 - FREE_INSET_BOTTOM);

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
// LEAF_WIDTH was tuned on the old tree zone's 15%-wide box. Each crayon tree
// is a different width, so scale it per tree to keep every leaf that size.
const LEAF_WIDTH_REF = 15;
const treeLeafWidth = (t) => `calc(${LEAF_WIDTH} * ${LEAF_WIDTH_REF / parseFloat(t.width)})`;
const STEM_WIDTH = "44cqw";
// Flowers stand on their root point and grow upward, so they may rise past
// the top of their (short) bed — this replaces the default 92cqh clamp.
const STEM_MAX_HEIGHT = "170cqh";
const FREE_WIDTH = `${toWalkBoxW(CHARACTER_SIZE)}cqw`;

// How far inside a box an item's centre is kept, as a % of the box, so its
// bulk doesn't spill past the box edge.
const LEAF_INSET = 14;
const STEM_INSET = 12;

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

// Where the n-th item in a box goes, as 0..1 across and down it. Plain
// random spots clump (lots of overlap, bare patches), so this follows the
// "R2" low-discrepancy sequence: each next point lands in the biggest gap
// left by the ones before, so a box fills evenly — and earlier items never
// move when a new one arrives. Each box starts the sequence at its own
// seeded offset so boxes don't share one pattern, and every point gets a
// small seeded wobble (a fraction of the spacing a full box would have) so
// it reads as scattered rather than gridded.
const R2_A1 = 0.7548776662466927; // 1/g, g = the plastic number 1.3247…
const R2_A2 = 0.5698402909980532; // 1/g²
const SPREAD_WOBBLE = 0.35;
function spreadPoint(boxIdx, n, capacity, seed) {
  const frac = (x) => x - Math.floor(x);
  const u0 = frac(seededUnit(boxIdx * 5 + 101) + R2_A1 * (n + 1));
  const v0 = frac(seededUnit(boxIdx * 5 + 103) + R2_A2 * (n + 1));
  const cell = 1 / Math.sqrt(Math.max(1, capacity ?? 25));
  const wobble = (s) => (seededUnit(s) - 0.5) * cell * SPREAD_WOBBLE;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return [clamp(u0 + wobble(seed * 2 + 1)), clamp(v0 + wobble(seed * 2 + 2))];
}

// Assign each contribution (by arrival order) to a box, then a scattered
// position inside it — all expressed as a % of the container so items can
// live directly in it and the boxes stay pure visual guides. `maxRotDeg`
// caps the random resting tilt (0 keeps everything upright, e.g. the
// standing characters).
// `insetX` / `insetTop` / `insetBottom` override `inset` for those edges.
function layoutScatter(
  urls,
  boxes,
  { inset = 14, insetX = inset, insetTop = inset, insetBottom = inset, maxRotDeg = 22 } = {},
) {
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
    const [u, v] = spreadPoint(boxIdx, countInBox - 1, box.capacity, i);
    const rot = maxRotDeg ? (seededUnit(i * 3 + 7) - 0.5) * maxRotDeg : 0;

    return {
      key: i,
      url,
      boxId: box.id,
      flip: !!box.flip,
      xPct: bx + ((insetX + u * (100 - insetX * 2)) / 100) * bw,
      yPct: by + ((insetTop + v * (100 - insetTop - insetBottom)) / 100) * bh,
      rot,
    };
  });
}

// Each character's stroll, as % of the scene width: where its feet are
// placed (the middle of the stroll, returned as xPct in the box),
// `walkDist` (how far it goes either way) and `walkDur` (seconds per
// one-way leg).
//
// The road it can use is the walk box's length, minus half a character at
// each end (so its body stays in the box). Each character's scattered spot,
// taken as a fraction of the way along that road, is the middle of its
// stroll — so they stay spread out — and it strolls WALK_REACH of the whole
// road, shifted if need be to stay on it.
//
// Walking past the notice board (drawn over the whole scene) is fine, but
// nobody should hang about behind it: a stroll that would turn around behind
// the board has that end pushed out past the board's far side, so they walk
// straight through (or, if there's no road past it, pulled back short of
// the board's near side).
function planWalks(items) {
  const half = CHARACTER_SIZE / 2;
  const boxLeft = parseFloat(FREE_ROAD_BOX.left);
  const lo = boxLeft + half;
  const hi = boxLeft + WALK_BOX_W - half;
  if (hi <= lo) return items.map((item) => ({ ...item, walkDist: 0, walkDur: 1 }));

  // Anywhere the character is even partly behind the board.
  const boardLo = NOTICE_BOARD_POS.left - half;
  const boardHi = NOTICE_BOARD_POS.left + NOTICE_BOARD_WIDTH + half;
  const behindBoard = (x) => x > boardLo && x < boardHi;
  // Move a turnaround point out from behind the board — past it in the
  // direction of travel if that's still on the road, else back before it.
  const clearOfBoard = (x, outward) => {
    if (!behindBoard(x)) return x;
    if (outward > 0) return boardHi <= hi ? boardHi : boardLo;
    return boardLo >= lo ? boardLo : boardHi;
  };

  return items.map((item) => {
    const spot = lo + (item.xPct / 100) * (hi - lo);
    const reach = WALK_REACH[0] + seededUnit(item.key * 7 + 3) * (WALK_REACH[1] - WALK_REACH[0]);
    const dist = ((hi - lo) * reach) / 2;
    const centre = Math.min(Math.max(spot, lo + dist), hi - dist);
    const left = clearOfBoard(centre - dist, -1);
    const right = clearOfBoard(centre + dist, 1);
    const walkDist = Math.max(0, (right - left) / 2);
    const walkDur = Math.max((2 * walkDist) / WALK_SPEED, 2 * HOP_SECONDS);
    return {
      ...item,
      xPct: (((left + right) / 2 - boxLeft) / WALK_BOX_W) * 100,
      walkDist,
      walkDur,
    };
  });
}

export default function StreetScene({
  showTour = false,
  onTourDone,
  onOpenRadio,
  onOpenBookshelf,
}) {
  const navigate = useNavigate();
  // The /draw/:zoneId child route (DrawZone). While it's open the street
  // stays mounted underneath, blurred, and the canvas floats over it.
  // Submitting a drawing drops back to the clean view (no hotspots, sun
  // says "Start") and plays its entrance (see DrawingArrival) via
  // onSubmitted; cancelling leaves contribute mode on.
  const [mode, setMode] = useState("view"); // "view" | "contribute"
  // The just-submitted drawing's entrance: { key, zone, imageUrl, fromRect,
  // thumbUrl } — thumbUrl arrives once the save lands, and marks which
  // scene item is the new one (hidden until the entrance hands over).
  const [arrival, setArrival] = useState(null);
  const drawOverlay = useOutlet({
    // `entrance` is null if the paper couldn't be measured — skip it then.
    onSubmitted: (entrance) => {
      setMode("view");
      if (entrance) setArrival({ ...entrance, key: Date.now(), thumbUrl: null });
    },
  });
  const sceneRef = useRef(null);
  const [drawings, setDrawings] = useState(getAllDrawings);

  // Background saves (see DrawZone) that didn't land — shown as a toast for
  // a few seconds.
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => subscribe(setDrawings), []);
  useEffect(
    () =>
      subscribeToSaveErrors(() => {
        setSaveFailed(true);
        setArrival(null); // nothing's coming — drop the loading screen
      }),
    [],
  );
  useEffect(
    () =>
      subscribeToSubmissions((s) =>
        setArrival((a) => (a && !a.thumbUrl && a.zone === s.zone ? { ...a, thumbUrl: s.thumbUrl } : a)),
      ),
    [],
  );
  // The entrance's image is a local copy of the export — free it after.
  useEffect(() => {
    if (!arrival) return undefined;
    return () => URL.revokeObjectURL(arrival.imageUrl);
  }, [arrival?.imageUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  // The scene item a new drawing is flying into (see DrawingArrival) — it's
  // marked data-arrival, hidden (scatter-item--arriving) and loaded eagerly
  // so the entrance can measure it.
  const arrivingUrl = arrival?.thumbUrl ?? null;
  const isArriving = (item) => arrivingUrl !== null && item.url === arrivingUrl;
  useEffect(() => {
    if (!saveFailed) return undefined;
    const timer = setTimeout(() => setSaveFailed(false), 5000);
    return () => clearTimeout(timer);
  }, [saveFailed]);

  // Each crayon tree with its own leaves and a status: "full", "open" (the
  // first tree that isn't full) or "locked" (every tree after that).
  const trees = useMemo(() => {
    const leaves = layoutScatter(drawings.tree ?? [], TREE_LEAF_BOXES, {
      inset: LEAF_INSET,
      maxRotDeg: 22,
    });
    const withLeaves = CRAYON_TREES.map((t) => {
      const treeLeaves = leaves.filter((l) => l.boxId.startsWith(`${t.id}/`));
      return { ...t, leaves: treeLeaves, full: treeLeaves.length >= treeCapacity(t) };
    });
    const openIdx = withLeaves.findIndex((t) => !t.full);
    return withLeaves.map((t, i) => ({
      ...t,
      status: t.full ? "full" : i === openIdx ? "open" : "locked",
    }));
  }, [drawings.tree]);
  // Each flower bed with its own flowers and a status, same rules as the
  // trees: "full", "open" (the first bed that isn't full) or "locked".
  const beds = useMemo(() => {
    const flowers = layoutScatter(drawings.stem ?? [], STEM_BOXES, {
      inset: STEM_INSET,
      maxRotDeg: 8,
    });
    const withFlowers = FLOWER_BEDS.map((b) => {
      const bedFlowers = flowers.filter((f) => f.boxId === b.id);
      return { ...b, flowers: bedFlowers, full: bedFlowers.length >= b.capacity };
    });
    const openIdx = withFlowers.findIndex((b) => !b.full);
    return withFlowers.map((b, i) => ({
      ...b,
      status: b.full ? "full" : i === openIdx ? "open" : "locked",
    }));
  }, [drawings.stem]);
  const freeCharacters = useMemo(
    () =>
      planWalks(
        layoutScatter(drawings.free ?? [], FREE_BOXES, {
          insetX: 0,
          insetTop: FREE_INSET_TOP,
          insetBottom: FREE_INSET_BOTTOM,
          maxRotDeg: 0,
        }),
      ),
    [drawings.free],
  );

  return (
    <div
      className="street-scene"
      data-mode={mode}
      data-drawing={drawOverlay ? "" : undefined}
      ref={sceneRef}
    >
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

          {/* Notice board fixture — see NOTICE_BOARD above for its box.
             A direct child of .scene-track (whose bottom edge is the screen
             bottom), so `bottom` anchors it there. High z-index keeps it
             above .scene-ground (2) and everything inside it. */}
          <img
            className="notice-board-art"
            src={ASSETS.noticeBoard}
            alt=""
            style={{
              bottom: NOTICE_BOARD.bottom,
              left: NOTICE_BOARD.left,
              width: NOTICE_BOARD.width,
              height: NOTICE_BOARD.height,
            }}
          />

          {/* Tap target for the notice board — same box as the art above,
             so it pans with it and lines up exactly. The hit area covers the
             whole board; the visible shiny label badge inside is centred and
             naturally sized so it doesn't get stretched into the board's own
             (portrait) proportions. View mode only, same as the window
             surprise — gone once Start reveals the zone hotspots, back once
             Return drops back to the clean view. */}
          {mode === "view" && (
            <button
              type="button"
              className="notice-board-button"
              onClick={() => navigate("/notices")}
              aria-label="Community notice board"
              style={{
                bottom: NOTICE_BOARD.bottom,
                left: NOTICE_BOARD.left,
                width: NOTICE_BOARD.width,
                height: NOTICE_BOARD.height,
              }}
            >
              <span
                className="notice-board-badge"
                style={{ top: `${NOTICE_BADGE_POS.top}%`, left: `${NOTICE_BADGE_POS.left}%` }}
              >
                Notice Board
              </span>
            </button>
          )}

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
              {/* Crayon trees — see CRAYON_TREES above. Each tree is its art,
                 its canopy (leaf box guides, toggled by SHOW_LEAF_BOXES, plus
                 its scattered leaves) and, while contributing, its hotspot.
                 The wrapper clips them at the end of the road, so a tree past
                 it doesn't make the street scroll further than the road goes. */}
              <div className="crayon-trees" style={{ width: `${STREET_LENGTH}%` }}>
                {trees.map((t, i) => {
                  const box = crayonTreeBox(t);
                  const locked = mode === "contribute" && t.status === "locked";
                  return (
                    <Fragment key={t.id}>
                      <img
                        className={`zone-fixture crayon-tree${locked ? " crayon-tree--locked" : ""}`}
                        data-tour={t.status === "open" ? "tree" : undefined}
                        src={ASSETS.crayonTree}
                        alt=""
                        style={{ ...box, transform: t.flip ? "scaleX(-1)" : undefined }}
                      />

                      <div className="scatter" style={{ ...box, "--item-w": treeLeafWidth(t) }}>
                        {SHOW_LEAF_BOXES &&
                          t.leafBoxes.map((leafBox) => {
                            const fill = t.leaves.filter(
                              (l) => l.boxId === `${t.id}/${leafBox.id}`,
                            ).length;
                            return (
                              <div
                                key={`box-${leafBox.id}`}
                                className="leaf-box"
                                style={{
                                  top: leafBox.top,
                                  left: leafBox.left,
                                  width: leafBox.width,
                                  height: leafBox.height,
                                }}
                              >
                                <span className="leaf-box-tag">
                                  {t.id} · {leafBox.id} · {fill}/{leafBox.capacity}
                                </span>
                              </div>
                            );
                          })}

                        {t.leaves.map((leaf) => (
                          <div
                            key={`leaf-${leaf.key}`}
                            data-arrival={isArriving(leaf) ? "" : undefined}
                            className={`scatter-item${LEAF_WIND ? " scatter-item--wind" : ""}${
                              leaf.flip ? " scatter-item--flip" : ""
                            }${isArriving(leaf) ? " scatter-item--arriving" : ""}`}
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
                              loading={isArriving(leaf) ? "eager" : "lazy"}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Hotspot — only while contributing. Only the open
                         tree is tappable; full and locked trees just say so. */}
                      {mode === "contribute" && (
                        <button
                          type="button"
                          className={`zone tree-zone zone--${TREE_HOTSPOT.level.toLowerCase()}`}
                          style={treeHotspotBox(t)}
                          disabled={t.status !== "open"}
                          onClick={() => navigate("/draw/tree")}
                          aria-label={
                            t.status === "open"
                              ? `${TREE_HOTSPOT.label} — ${TREE_HOTSPOT.level}`
                              : `Tree ${i + 1} — ${t.status === "full" ? "full" : "locked"}`
                          }
                        >
                          <span className="zone-label">
                            {t.status === "open" ? (
                              <>
                                <span className="zone-label-text">{TREE_HOTSPOT.label}</span>
                                <span className="zone-tag">
                                  <span className="zone-stars" aria-hidden="true">
                                    {"★".repeat(TREE_HOTSPOT.stars)}
                                    {"☆".repeat(3 - TREE_HOTSPOT.stars)}
                                  </span>
                                  {TREE_HOTSPOT.level}
                                </span>
                              </>
                            ) : (
                              <span className="zone-label-text">
                                {t.status === "full" ? "Full" : "🔒 Locked"}
                              </span>
                            )}
                          </span>
                        </button>
                      )}
                    </Fragment>
                  );
                })}
              </div>

              {/* Hidden window surprise — view mode only, gone the moment
                 Start reveals the zone hotspots. */}
              {mode === "view" && (
                <button
                  type="button"
                  className="window-sound-button"
                  onClick={onOpenRadio}
                  aria-label="Something's playing in the window"
                  style={{
                    top: WINDOW_SOUND.top,
                    left: WINDOW_SOUND.left,
                    width: WINDOW_SOUND.width,
                    height: WINDOW_SOUND.height,
                  }}
                >
                  <img className="window-boombox" src={ASSETS.radio} alt="" draggable="false" />
                </button>
              )}

              {/* Second window surprise — same view-mode-only pattern as the
                 boombox above; opens the bookshelf. */}
              {mode === "view" && (
                <button
                  type="button"
                  className="window-sound-button"
                  onClick={onOpenBookshelf}
                  aria-label="Open the community bookshelf"
                  style={{
                    top: WINDOW_BOOK.top,
                    left: WINDOW_BOOK.left,
                    width: WINDOW_BOOK.width,
                    height: WINDOW_BOOK.height,
                  }}
                >
                  <img className="window-books" src={ASSETS.books} alt="" draggable="false" />
                </button>
              )}

              {/* Flower beds — see FLOWER_BEDS above. Each bed is its scattered
                 flowers (same mechanism as the tree canopy) and, while
                 contributing, its hotspot. */}
              {beds.map((b, i) => (
                <Fragment key={b.id}>
                  <div
                    className="scatter"
                    style={{ ...bedBox(b), "--item-w": STEM_WIDTH, "--item-max-h": STEM_MAX_HEIGHT }}
                  >
                    {b.flowers.map((item) => (
                      <div
                        key={`stem-${item.key}`}
                        data-arrival={isArriving(item) ? "" : undefined}
                        className={`scatter-item scatter-item--rooted${STEM_WIND ? " scatter-item--wind" : ""}${
                          isArriving(item) ? " scatter-item--arriving" : ""
                        }`}
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
                          loading={isArriving(item) ? "eager" : "lazy"}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Hotspot — only while contributing. Only the open bed is
                     tappable; full and locked beds just say so. */}
                  {mode === "contribute" && (
                    <button
                      type="button"
                      className={`zone zone--${FLOWER_HOTSPOT.level.toLowerCase()}`}
                      style={bedBox(b)}
                      disabled={b.status !== "open"}
                      onClick={() => navigate("/draw/stem")}
                      aria-label={
                        b.status === "open"
                          ? `${FLOWER_HOTSPOT.label} — ${FLOWER_HOTSPOT.level}`
                          : `Flower bed ${i + 1} — ${b.status === "full" ? "full" : "locked"}`
                      }
                    >
                      <span className="zone-label">
                        {b.status === "open" ? (
                          <>
                            <span className="zone-label-text">{FLOWER_HOTSPOT.label}</span>
                            <span className="zone-tag">
                              <span className="zone-stars" aria-hidden="true">
                                {"★".repeat(FLOWER_HOTSPOT.stars)}
                                {"☆".repeat(3 - FLOWER_HOTSPOT.stars)}
                              </span>
                              {FLOWER_HOTSPOT.level}
                            </span>
                          </>
                        ) : (
                          <span className="zone-label-text">
                            {b.status === "full" ? "Full" : "🔒 Locked"}
                          </span>
                        )}
                      </span>
                    </button>
                  )}
                </Fragment>
              ))}

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
                  // Feet placement already keeps them inside the box (see
                  // FREE_INSET_TOP), so no height clamp — it only squashed them.
                  "--item-max-h": "none",
                }}
              >
                {freeCharacters.map((item) => (
                  <div
                    key={`free-${item.key}`}
                    data-arrival={isArriving(item) ? "" : undefined}
                    className={`scatter-item scatter-item--rooted scatter-item--walking${
                      isArriving(item) ? " scatter-item--arriving" : ""
                    }`}
                    style={{
                      left: `${item.xPct}%`,
                      top: `${item.yPct}%`,
                      "--item-rot": `${item.rot.toFixed(1)}deg`,
                      // its stroll (see planWalks), a seeded WALK_HOP hop
                      // about every HOP_SECONDS (a whole number per leg, so
                      // hops land at the turns) and a staggered start so
                      // nobody walks in lockstep
                      "--walk-dist": `${toWalkBoxW(item.walkDist).toFixed(2)}cqw`,
                      "--walk-dur": `${item.walkDur.toFixed(2)}s`,
                      "--hop-dur": `${(
                        item.walkDur / Math.max(1, Math.round(item.walkDur / HOP_SECONDS))
                      ).toFixed(3)}s`,
                      "--walk-hop": `${toWalkBoxW(
                        WALK_HOP[0] + seededUnit(item.key * 13 + 9) * (WALK_HOP[1] - WALK_HOP[0]),
                      ).toFixed(2)}cqw`,
                      "--walk-delay": `${-(seededUnit(item.key * 11 + 5) * item.walkDur * 2).toFixed(2)}s`,
                    }}
                  >
                    <img
                      className="scatter-item-img"
                      src={item.url}
                      alt=""
                      draggable={false}
                      loading={isArriving(item) ? "eager" : "lazy"}
                    />
                  </div>
                ))}
              </div>

              {/* Walk area guide — see SHOW_WALK_BOX. Characters stay inside
                 it left to right. */}
              {SHOW_WALK_BOX && (
                <div className="walk-box" style={FREE_ROAD_BOX}>
                  <span className="leaf-box-tag">
                    walk area · top {FREE_ROAD_BOX.top} · left {FREE_ROAD_BOX.left} · width{" "}
                    {FREE_ROAD_BOX.width} · height {FREE_ROAD_BOX.height}
                  </span>
                </div>
              )}

              {/* Hotspots — only while contributing. */}
              {mode === "contribute" &&
                ZONES.map((zone) => (
                  <button
                    key={`hot-${zone.id}`}
                    className={`zone zone--${zone.level.toLowerCase()}`}
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

      {/* Call to action, drawn as the sun in the sky: reveal the zones, or
         drop back to the clean view. */}
      <SunButton
        className="scene-cta"
        onClick={() => setMode((m) => (m === "view" ? "contribute" : "view"))}
      >
        {mode === "view" ? "Start" : "Return"}
      </SunButton>

      {saveFailed && (
        <p role="alert" className="save-toast">
          Couldn't save your drawing — check your connection and try again.
        </p>
      )}

      {/* First-visit kangaroo tour (see StreetTour) — the spotlight targets
         .scene-ground, .scene-cta and the open tree's data-tour="tree". */}
      {showTour && <StreetTour sceneRef={sceneRef} onDone={onTourDone} />}

      {drawOverlay}

      {/* A just-submitted drawing's entrance (see DrawingArrival). */}
      {arrival && (
        <DrawingArrival
          key={arrival.key}
          arrival={arrival}
          sceneRef={sceneRef}
          onDone={() => setArrival(null)}
        />
      )}
    </div>
  );
}
