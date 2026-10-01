import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutlet } from "react-router-dom";
import StreetTour from "../components/StreetTour";
import SunButton from "../components/SunButton";
import DrawingArrival from "../components/DrawingArrival";
import NoticeTab from "../components/NoticeTab";
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
    top: "101.3%", // on the road
    anchor: "left", // see STREET_ANCHORS
    left: "21%",
    width: "30%",
    height: "17.5%",
  },
];

// A zone's `top`/`left` shifted by its offsetY/offsetX, if it has one.
const shifted = (value, offset) => (offset ? `calc(${value} + ${offset})` : value);
const zoneTop = (zone) => shifted(zone.top, zone.offsetY);
const zoneLeft = (zone) => shifted(`${fromStreetStart(zone.anchor, zone.left)}%`, zone.offsetX);

// ---- Street artwork ---------------------------------------------------------
// LAYOUT KNOBS — what to reach for when trying out the street's shape:
//   --scene-width (StreetScene.css) — zooms the WHOLE street: road,
//       buildings, trees, beds, zones, window buttons and characters all
//       grow or shrink together.
//   STREET_START_PADDING / STREET_GAP / STREET_END_PADDING (below) — road
//       before, between and after the buildings. Everything placed on the
//       street is resolveAnchor (see STREET_ANCHORS) so it follows: the end
//       trees stay at the ends of the street, tree 2 stays in the gap, the
//       window buttons stay on their windows.
//
// The street is split into separate building pieces, laid out left to
// right: STREET_START_PADDING, the first piece, STREET_GAP, the next piece,
// ..., STREET_END_PADDING. The optional `scale` resizes one piece on its own
// (1 = as tuned); it grows up and to the right from its bottom-left corner,
// so it stays standing on the road. Things placed on that building don't
// scale with it, so prefer --scene-width.
//
// The buildings are cropped just above their own drawn road, and all sit on
// one shared road + grass strip (ROAD_STRIP) that runs the full length of
// the street along the ground line (the bottom of .scene-ground, which is
// the bottom of the screen at --scene-lift: 0%).
//
// STREET_SCALE sizes the road strip, both buildings and the paddings/gap
// together, but NOT the things placed on the street (trees, beds, zones,
// window buttons) — leave it at 1 and use --scene-width to resize everything.
//
// The road and buildings were tuned separately, which is where the two base
// sizes come from (in the same units: how thick the drawn grey road would
// come out, as a % of the scene-ground width — equal numbers would be the
// buildings at the true crayon scale of the road). Only touch these to
// re-balance road vs buildings; use STREET_SCALE to resize everything.
//
// All other numbers are measurements of the file, in its own viewBox units:
// `crop` is the region shown (the files have transparent padding around the
// art; the bottom edge is the top of the file's own road), `roadThickness`
// is how thick the file draws the road — used only for scale. Only
// re-measure them if the file is re-exported.
const STREET_SCALE = 1;
const STREET_ROAD_THICKNESS = 9.3 * STREET_SCALE;
const STREET_BUILDING_SIZE = 3.9 * STREET_SCALE;
// Empty road before the first building, between buildings, and after the
// last one, as a % of the scene-ground width.
const STREET_START_PADDING = 27 * STREET_SCALE;
const STREET_GAP = 10 * STREET_SCALE;
const STREET_END_PADDING = 4 * STREET_SCALE;

const STREET_BUILDINGS = [
  {
    id: "left",
    src: ASSETS.streetLeft,
    scale: 1.2,
    // building-56.webp: 1833 × 755 px, already cropped from building 56.svg
    // to this box plus a 2px safety margin on every side (clipped by
    // .street-building's overflow: hidden).
    crop: { fileWidth: 1833, fileHeight: 755, x: 2.91, y: 2.37, width: 1827.26, height: 750.16 },
    roadThickness: 118.05,
  },
  {
    id: "right",
    src: ASSETS.streetRight,
    scale: 1.2,
    // building-94.webp: 1891 × 767 px, already cropped from building 94.svg
    // to this box plus a 2px safety margin on every side.
    crop: { fileWidth: 1891, fileHeight: 767, x: 2, y: 2, width: 1887, height: 763 },
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
// the-road.webp: 1812 × 277 px, cropped from the road.svg (2172 × 1512) to
// the road + grass (x 184–1992, y 1048–1321) plus a 2px safety margin, so
// both crops below sit inside it.
const ROAD_WHOLE = true;
const ROAD_STRIP = {
  src: ASSETS.road,
  crop: ROAD_WHOLE
    ? { fileWidth: 1812, fileHeight: 277, x: 2, y: 2, width: 1808, height: 273 }
    : { fileWidth: 1812, fileHeight: 277, x: 318, y: 2, width: 1200, height: 273 },
  roadThickness: 118,
};

// Width of a piece of art at a given size knob, as a % of the scene-ground
// width.
const artWidth = ({ crop, roadThickness }, size) => (size * crop.width) / roadThickness;
const buildingWidth = (piece) => artWidth(piece, STREET_BUILDING_SIZE * (piece.scale ?? 1));
// Each piece starts where the one before it ends, plus the gap.
const BUILDING_LEFTS = STREET_BUILDINGS.reduce(
  (lefts, p, i) => [...lefts, i === 0 ? STREET_START_PADDING : lefts[i - 1] + buildingWidth(STREET_BUILDINGS[i - 1]) + STREET_GAP],
  [],
);
const buildingLeft = (piece) => BUILDING_LEFTS[STREET_BUILDINGS.indexOf(piece)];
const ROAD_TILE_WIDTH = artWidth(ROAD_STRIP, STREET_ROAD_THICKNESS);

// Height of the road strip (road + grass), as a % of the scene-ground WIDTH.
const ROAD_STRIP_HEIGHT = (ROAD_TILE_WIDTH * ROAD_STRIP.crop.height) / ROAD_STRIP.crop.width;

// The road runs from the start of the street to whichever is further: the
// end of the scene-ground box, or the end of the last building plus the end
// padding.
const STREET_LENGTH = Math.max(
  100,
  ...STREET_BUILDINGS.map((p) => buildingLeft(p) + buildingWidth(p) + STREET_END_PADDING),
);

// Points along the street that things placed on it hang off, as a % of the
// scene-ground width. Anything with `anchor: "<name>"` has its `left`
// measured from that point (negative = to the left of it), so it follows
// when the paddings, gap or buildings change. No anchor = "start".
//   start — the start of the road
//   left  — the left building's left edge
//   gap   — the middle of the gap between the buildings
//   right — the right building's left edge
//   end   — the end of the road
const [LEFT_BUILDING, RIGHT_BUILDING] = STREET_BUILDINGS;
const STREET_ANCHORS = {
  start: 0,
  left: buildingLeft(LEFT_BUILDING),
  gap: (buildingLeft(LEFT_BUILDING) + buildingWidth(LEFT_BUILDING) + buildingLeft(RIGHT_BUILDING)) / 2,
  right: buildingLeft(RIGHT_BUILDING),
  end: STREET_LENGTH,
};
const fromStreetStart = (anchor = "start", left = 0) => STREET_ANCHORS[anchor] + parseFloat(left);
// An item with its `left` resolved to a plain % of the scene-ground box.
const resolveAnchor = (item) => ({ ...item, left: `${fromStreetStart(item.anchor, item.left)}%` });
const ROAD_TILE_COUNT = ROAD_WHOLE ? 1 : Math.ceil(STREET_LENGTH / ROAD_TILE_WIDTH);

const buildingBoxStyle = (piece) => ({
  left: `${buildingLeft(piece)}%`,
  width: `${buildingWidth(piece)}%`,
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

const cropImgStyle = ({ crop }) => ({
  width: `${(crop.fileWidth / crop.width) * 100}%`,
  left: `${(-crop.x / crop.width) * 100}%`,
  top: `${(-crop.y / crop.height) * 100}%`,
});

// ---- Notice board fixture --------------------------------------------------
// TRIAL: true swaps the board in the street for the pull-up tab (NoticeTab)
// pinned to the screen's bottom edge. false = the board below, as before.
const NOTICE_TAB = true;

// Scene furniture that doubles as the link to /notices, positioned the same
// way as the zones (a % of the scene-ground box, so it pans with the street
// and holds across phone widths).
//
// It lives in .scene-track (not .scene-overlay), so it's resolveAnchor to the
// bottom of the screen and ignores --scene-lift / --overlay-offset-y.
// To move/resize it, edit only these three numbers (all % of the street):
//   bottom — gap between the board's feet and the screen bottom (0 = on the edge,
//            bigger = higher, negative = sinks below the edge)
//   left   — the board's left edge, from the left building's edge (bigger = further right)
//   height — board size, grows upward from its feet; width follows automatically
const NOTICE_BOARD_POS = { bottom: 0, left: fromStreetStart("left", 48), height: 40 };

// Width = height x the art's 600:900 ratio, converted through the
// scene-ground's 660:285 aspect, so the tap target hugs the board.
const NOTICE_BOARD_WIDTH =
  NOTICE_BOARD_POS.height * (600 / 900) * (285 / 660);
const NOTICE_BOARD = {
  bottom: `${NOTICE_BOARD_POS.bottom}%`,
  left: `${NOTICE_BOARD_POS.left}%`,
  width: `${NOTICE_BOARD_WIDTH}%`,
  height: `${NOTICE_BOARD_POS.height}%`,
};

// Where the "What's on" note sits ON the board, as a % of the
// board itself (so it moves with the board). This is the badge's centre point:
//   top  — 0 = board's top edge, 50 = middle, 100 = the feet
//   left — 0 = board's left edge, 50 = middle, 100 = right edge
const NOTICE_BADGE_POS = { top: 40, left: 50 };

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
// placeDrawings). Tree 2 gets a full canopy (78 / 28 / 43 = 149, the old
// tree's split); trees 1 and 3 are half off-screen, so they only get two
// boxes over the part that shows, at half capacity (75 each).
// Capacities sum to 299 — keep drawingsStore.js's ZONE_LIMITS.tree at that
// plus its overflow buffer.
// `left` is measured from the tree's `anchor` (see STREET_ANCHORS): the end
// trees hang off the ends of the road, tree 2 off the middle of the gap.
//
// `inFront: true` stands a tree on the grass in front of the road: it (and
// its leaves) draw over the walking characters, and its tap box follows its
// own box instead of the shared TREE_HOTSPOT lines. `hidesWalkers` is the
// part of it (a % of the tree's own box, across) that hides a character
// walking behind — they walk through it but never turn around in there (see
// planCharacterWalks). SHOW_WALK_BOX shows it on the street.
//
// `scale` resizes one tree (1 = the box as written). It grows from the
// middle of the box's bottom edge, so the trunk stays where it is planted;
// its leaf boxes, tap box and `hidesWalkers` grow with it.
const scaleTree = (t) => {
  const s = t.scale ?? 1;
  const width = parseFloat(t.width);
  const height = parseFloat(t.height);
  return {
    ...t,
    top: `${parseFloat(t.top) - height * (s - 1)}%`,
    left: `${parseFloat(t.left) - (width * (s - 1)) / 2}%`,
    width: `${width * s}%`,
    height: `${height * s}%`,
  };
};
const CRAYON_TREES = [
  {
    id: "tree-1",
    top: "46.5%",
    anchor: "start",
    left: "-5.5%",
    width: "15%",
    height: "56%",
    scale: 1.3,
    // Left third is off the start of the street — right side only.
    leafBoxes: [
      { id: "top-right", top: "-10%", left: "37.5%", width: "40%", height: "45%", capacity: 30, flip: true },
      { id: "low-right", top: "22%", left: "55%", width: "50%", height: "45%", capacity: 45, flip: true },
    ],
  },
  {
    id: "tree-2",
    top: "62%",
    anchor: "gap",
    left: "-7%",
    width: "15%",
    height: "90%",
    scale: 1.3,
    flip: true,
    inFront: true,
    hidesWalkers: { left: "25%", width: "50%" },
    leafBoxes: [
      { id: "top-left", top: "-5%", left: "10%", width: "75%", height: "45%", capacity: 78 },
      { id: "top-right", top: "3%", left: "75%", width: "40%", height: "35%", capacity: 28, flip: true },
      { id: "low-right", top: "25%", left: "-8%", width: "50%", height: "40%", capacity: 43, flip: true },
    ],
  },
  {
    id: "tree-3",
    top: "50.7%",
    anchor: "end",
    left: "-10%",
    width: "15%",
    height: "51%",
    scale: 1.1,
    flip: true,
    // Right third is past the end of the road — left side only. Last tree,
    // so its last box also takes the overflow buffer.
    leafBoxes: [
      { id: "top-left", top: "-10%", left: "10%", width: "55%", height: "45%", capacity: 45 },
      { id: "low-left", top: "25%", left: "2%", width: "45%", height: "40%", capacity: 30 },
    ],
  },
]
  .map(resolveAnchor)
  .map(scaleTree);

// The label on whichever tree is open.
const TREE_HOTSPOT = { label: "Colour the tree", level: "Easy", stars: 1 };

// Every tree's tap box runs between the same two lines, whatever each tree's
// own box is — TREE_HOTSPOT_TOP down to TREE_HOTSPOT_BOTTOM, as a % of the
// scene-ground box (like the trees' `top`). Widths follow each tree.
// `inFront` trees are the exception: their tap box is their own box.
const TREE_HOTSPOT_TOP = 45;
const TREE_HOTSPOT_BOTTOM = 105;

// Every tree's leaf boxes chained left to right, so placeDrawings fills
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
  const top = t.inFront ? parseFloat(t.top) : TREE_HOTSPOT_TOP;
  const bottom = t.inFront ? top + parseFloat(t.height) : TREE_HOTSPOT_BOTTOM;
  return {
    ...crayonTreeBox(t),
    top: `${top}%`,
    height: `${bottom - top}%`,
    paddingLeft: `${(hiddenLeft * 100) / STREET_LENGTH}%`,
    paddingRight: `${(hiddenRight * 100) / STREET_LENGTH}%`,
  };
};

// ---- Hidden window "surprise" ----------------------------------------------
// A pulsing button tucked into one of the house windows, view-mode only —
// it disappears once Start is tapped and the zone hotspots take over the
// screen. Box is a % of .scene-ground, same coordinate system as everything
// else above; `left` is from the left building's edge so it stays on its window.
const WINDOW_RADIO = resolveAnchor({ top: "78%", anchor: "left", left: "2.95%", width: "8%", height: "14%" });

// A second window surprise, same pattern as WINDOW_RADIO above — a different
// window pane so the two don't compete for attention. Opens the community
// bookshelf popup (see Bookshelf.jsx), the same way the boombox opens the
// radio.
const WINDOW_BOOK = resolveAnchor({ top: "81%", anchor: "left", left: "32.5%", width: "6%", height: "14%" });

// Street sign — a third tappable surprise, same glow as the window ones;
// opens the street's history (see StreetHistory.jsx). It stands on the footpath between the first tree and the left building.
// `left` is from the left building's edge (negative = before it). Height is
// the knob for its size; width follows the art.
const STREET_SIGN_POS = { anchor: "left", left: -13.5, bottom: 101, height: 40 };
// Where the sign sits in its 595x842 file (the rest is empty page).
const STREET_SIGN_CROP = { fileWidth: 595, fileHeight: 842, x: 135, y: 35, width: 387, height: 757 };
const STREET_SIGN = {
  top: `${STREET_SIGN_POS.bottom - STREET_SIGN_POS.height}%`,
  left: `${fromStreetStart(STREET_SIGN_POS.anchor, STREET_SIGN_POS.left)}%`,
  // height is a % of the scene-ground height; width a % of its width (660:285).
  width: `${(STREET_SIGN_POS.height * STREET_SIGN_CROP.width * 285) / (STREET_SIGN_CROP.height * 660)}%`,
  height: `${STREET_SIGN_POS.height}%`,
};

// The kangaroo, standing on the footpath between the street sign and the
// left building. Same knobs as the sign: `left` from the left building's
// edge, feet at `bottom`, `height` sets its size and width follows the art
// (1172 x 1342).
const STREET_KANGAROO_POS = { anchor: "left", left: -9, bottom: 101.7, height: 22 };
const STREET_KANGAROO = {
  top: `${STREET_KANGAROO_POS.bottom - STREET_KANGAROO_POS.height}%`,
  left: `${fromStreetStart(STREET_KANGAROO_POS.anchor, STREET_KANGAROO_POS.left)}%`,
  width: `${(STREET_KANGAROO_POS.height * 1172 * 285) / (1342 * 660)}%`,
  height: `${STREET_KANGAROO_POS.height}%`,
};

// ---- Scattered zone contributions -----------------------------------------
// Every zone's contributions pile up over time instead of only showing the
// most recent — each new drawing drops into a box (each tree's canopy has
// several, to cluster leaves naturally; each flower bed and the walk area
// just use one) at a scattered position. Boxes are positioned as a % of the
// thing they belong to (a tree, a bed, or the walk box). Leaves fill box 0 up
// to its `capacity`, then box 1, and so on; extras past the last box's
// capacity pile into the last box rather than disappearing.
//
// Flip SHOW_LEAF_BOXES on to see the crayon trees' canopy boxes (dashed
// outline + a live fill count) while you position them, then set it back to
// false.
const SHOW_LEAF_BOXES = false;

// Flower beds on the grass — the "stem" zone, split into beds the way the
// tree zone is split into trees. Same % coordinates as ZONES (of the
// scene-ground box). The road runs ≈ 104.5–124% down and the visible grass
// ≈ 124–140%, so beds sit in that band. Keep them clear of tree 2, which
// stands on the grass in the gap: bed 1 is before it, bed 2 after it.
//
// Every bed is its own tap target, but only one is open at a time: they fill
// left to right, and a bed stays locked (in contribute mode) until the one
// before it is full. All share the stem zone's drawings — which bed a flower
// lands in comes from its arrival order, not which bed was tapped.
// Capacities sum to 60 — keep drawingsStore.js's ZONE_LIMITS.stem at that
// plus its overflow buffer (the last bed takes the overflow).
// `left` is from each bed's `anchor` (see STREET_ANCHORS).
const FLOWER_BEDS = [
  { id: "bed-1", top: "127%", anchor: "left", left: "1%", width: "35%", height: "10%", capacity: 30 },
  { id: "bed-2", top: "127%", anchor: "right", left: "33.6%", width: "35%", height: "10%", capacity: 30 },
].map(resolveAnchor);

// The label on whichever bed is open.
const FLOWER_HOTSPOT = { label: "Draw a flower", level: "Medium", stars: 2 };

// Flip SHOW_BED_BOXES on to see each flower bed (dashed outline + a live fill
// count) and, inside it, the root box where flowers are planted, while you
// position them, then set it back to false.
const SHOW_BED_BOXES = false;

// One scatter box per bed, covering the bottom half of it — a flower is
// planted at its root and grows upward, so keeping roots low keeps the
// (big) flowers sitting down on the grass. Flowers don't need the
// tree's multi-box clustering. Chained left to right so placeDrawings fills
// bed 1, then bed 2, ...
const FLOWER_BOXES = FLOWER_BEDS.map((b) => ({
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
// since it is the only/last box (see placeDrawings).
const CHARACTER_BOXES = [{ id: "yard", top: "0%", left: "0%", width: "100%", height: "100%", capacity: 114 }];
// The whole road, bar the last 2% — its width follows the street length.
// Edit these numbers to move/resize where characters walk (same %
// coordinates as ZONES — of the scene-ground box).
const WALK_BOX = { top: "101.3%", left: "0%", width: `${STREET_LENGTH - 2}%`, height: "19.7%" };

// Flip SHOW_WALK_BOX on to see WALK_BOX on the street (dashed outline +
// its numbers) while you position it, then set it back to false.
const SHOW_WALK_BOX = false;

// Characters' size and movement, as a % of the scene-ground WIDTH — fixed,
// whatever shape WALK_BOX is, so resizing the box only changes how much
// room they have. Drawings are square, so CHARACTER_SIZE is both width and
// height.
//
// Each character strolls back and forth along the walk box (see
// planCharacterWalks). WALK_REACH is how much of the box's length one stroll covers
// ([min, max], seeded per character): 1 = end to end. They all walk at
// WALK_SPEED (% of the scene width per second), bobbing a WALK_HOP-high hop
// about every HOP_SECONDS.
const CHARACTER_SIZE = 7;
const WALK_REACH = [0.5, 1];
const WALK_SPEED = 2.5;
const WALK_HOP = [0.5, 1];
const HOP_SECONDS = 0.45;

// Stretches of road where a walking character would be hidden, as
// [from, to] in % of the scene width: the part of each `inFront` tree that
// covers the road (its `hidesWalkers` box), plus the notice board when it's
// standing in the street (not in the pull-up tab trial).
const WALK_HIDING_SPOTS = [
  ...CRAYON_TREES.filter((t) => t.hidesWalkers).map((t) => {
    const from = parseFloat(t.left) + (parseFloat(t.hidesWalkers.left) / 100) * parseFloat(t.width);
    return [from, from + (parseFloat(t.hidesWalkers.width) / 100) * parseFloat(t.width)];
  }),
  ...(NOTICE_TAB ? [] : [[NOTICE_BOARD_POS.left, NOTICE_BOARD_POS.left + NOTICE_BOARD_WIDTH]]),
];

// The same in the walk box's own units (the scatter's cqw / % of its box).
// The scene-ground is 660:285, so its height is 285/660 of its width.
const WALK_BOX_WIDTH = parseFloat(WALK_BOX.width);
const WALK_BOX_HEIGHT = (parseFloat(WALK_BOX.height) * 285) / 660;
const toWalkBoxWidth = (v) => (v / WALK_BOX_WIDTH) * 100;
const toWalkBoxHeight = (v) => (v / WALK_BOX_HEIGHT) * 100;

// The box is a hard limit. Left/right is handled by planCharacterWalks. Top/bottom:
// feet stay low enough for the whole character plus its highest hop to fit
// above them, and a touch up from the bottom edge. (If the box is shorter
// than a character, feet just sit on its bottom edge.)
const WALK_INSET_BOTTOM = 3;
const WALK_INSET_TOP = Math.min(toWalkBoxHeight(CHARACTER_SIZE + WALK_HOP[1]), 100 - WALK_INSET_BOTTOM);

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
const LEAF_TUNED_TREE_WIDTH = 15;
const treeLeafWidth = (t) => `calc(${LEAF_WIDTH} * ${LEAF_TUNED_TREE_WIDTH / parseFloat(t.width)})`;
const FLOWER_WIDTH = "44cqw";
// Same trick for flowers: FLOWER_WIDTH was tuned on a 15%-wide bed, so scale it
// per bed to keep every flower that size however wide its bed is.
const FLOWER_TUNED_BED_WIDTH = 15;
const bedFlowerWidth = (b) => `calc(${FLOWER_WIDTH} * ${FLOWER_TUNED_BED_WIDTH / parseFloat(b.width)})`;
// Flowers stand on their root point and grow upward, so they may rise past
// the top of their (short) bed — this replaces the default 92cqh clamp.
const FLOWER_MAX_HEIGHT = "170cqh";
const CHARACTER_WIDTH = `${toWalkBoxWidth(CHARACTER_SIZE)}cqw`;

// How far inside a box an item's centre is kept, as a % of the box, so its
// bulk doesn't spill past the box edge.
const LEAF_INSET = 14;
const FLOWER_INSET = 12;
// Flower beds pad their ends less than their top/bottom, so the flowers
// reach further along the bed.
const FLOWER_INSET_X = 2;

// Gentle "wind" sway applied to every item (see .scatter-item--wind in the
// CSS — it animates the image around a top pivot). The tree's leaves and the
// flowers sway; the standing characters stay put.
const LEAF_WIND = true;
const FLOWER_WIND = true;

// Deterministic 0..1 from an integer seed. Same item index -> same spot on
// every render, so adding item N never reshuffles items 0..N-1.
function stableRandom(seed) {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Where the n-th item in a box goes, as 0..1 across and down it. Plain
// random spots clump (lots of overlap, bare patches), so this follows the
// "R2" low-discrepancy sequence: each next point lands in the biggest gap
// left by the ones before, so a box fills evenly — and earlier items never
// move when a new one arrives. Each box starts the sequence at its own
// seeded offset so boxes don't share one pattern, and every point gets a
// small seeded wobble (a fraction of the spacing a full box would have) so
// it reads as scattered rather than gridded.
const EVEN_SPREAD_STEP_X = 0.7548776662466927; // 1/g, g = the plastic number 1.3247…
const EVEN_SPREAD_STEP_Y = 0.5698402909980532; // 1/g²
const SPREAD_WOBBLE = 0.35;
function scatterSpot(boxIdx, n, capacity, seed) {
  const frac = (x) => x - Math.floor(x);
  const u0 = frac(stableRandom(boxIdx * 5 + 101) + EVEN_SPREAD_STEP_X * (n + 1));
  const v0 = frac(stableRandom(boxIdx * 5 + 103) + EVEN_SPREAD_STEP_Y * (n + 1));
  const cell = 1 / Math.sqrt(Math.max(1, capacity ?? 25));
  const wobble = (s) => (stableRandom(s) - 0.5) * cell * SPREAD_WOBBLE;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return [clamp(u0 + wobble(seed * 2 + 1)), clamp(v0 + wobble(seed * 2 + 2))];
}

// Row spread, for tall items standing in a wide, shallow box (the flower
// beds): there, overlap is all about how far apart items are side to side,
// so the box is cut into `capacity` evenly spaced slots across and each next
// item takes the slot furthest from every slot already taken — the bed fills
// evenly at every count, and a full bed is perfectly evenly spaced. Side by
// side slots alternate between a back and a front row for depth, with a
// small seeded wobble (a fraction of one slot) so it isn't a grid.
const ROW_WOBBLE = 0.2;
const rowFillOrderCache = new Map();
function rowFillOrder(capacity) {
  if (rowFillOrderCache.has(capacity)) return rowFillOrderCache.get(capacity);
  const order = [];
  const taken = new Array(capacity).fill(false);
  for (let n = 0; n < capacity; n++) {
    let best = -1;
    let bestGap = -1;
    for (let s = 0; s < capacity; s++) {
      if (taken[s]) continue;
      // Distance to the nearest taken slot (or the bed's edges, counted as
      // half a slot away so the ends don't fill first).
      let gap = Math.min(s + 0.5, capacity - s - 0.5);
      for (const t of order) gap = Math.min(gap, Math.abs(s - t));
      if (gap > bestGap) {
        bestGap = gap;
        best = s;
      }
    }
    taken[best] = true;
    order.push(best);
  }
  rowFillOrderCache.set(capacity, order);
  return order;
}
function rowSpot(n, capacity, seed) {
  const cap = Math.max(1, capacity ?? 20);
  const slot = rowFillOrder(cap)[n % cap];
  const wobble = (s) => (stableRandom(s) - 0.5) * ROW_WOBBLE;
  const u = (slot + 0.5 + wobble(seed * 2 + 1)) / cap;
  const row = slot % 2 === 0 ? 0.2 : 0.8; // back row, front row
  const v = row + wobble(seed * 2 + 2);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return [clamp(u), clamp(v)];
}

// Assign each contribution (by arrival order) to a box, then a scattered
// position inside it — all expressed as a % of the container so items can
// live directly in it and the boxes stay pure visual guides. `maxRotDeg`
// caps the random resting tilt (0 keeps everything upright, e.g. the
// standing characters). `rows` swaps the area-filling spread for the row
// spread above (the flower beds).
// `insetX` / `insetTop` / `insetBottom` override `inset` for those edges.
function placeDrawings(
  urls,
  boxes,
  { inset = 14, insetX = inset, insetTop = inset, insetBottom = inset, maxRotDeg = 22, rows = false } = {},
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

    const bx = parseFloat(box.left);
    const by = parseFloat(box.top);
    const bw = parseFloat(box.width);
    const bh = parseFloat(box.height);
    const [u, v] = rows
      ? rowSpot(countInBox - 1, box.capacity, i)
      : scatterSpot(boxIdx, countInBox - 1, box.capacity, i);
    const rot = maxRotDeg ? (stableRandom(i * 3 + 7) - 0.5) * maxRotDeg : 0;

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
// Walking behind something in front of the road (WALK_HIDING_SPOTS) is fine,
// but nobody should hang about hidden there: a stroll that would turn around
// in a hiding spot has that end pushed out past its far side, so they walk
// straight through (or, if there's no road past it, pulled back short of its
// near side).
function planCharacterWalks(items) {
  const half = CHARACTER_SIZE / 2;
  const boxLeft = parseFloat(WALK_BOX.left);
  const lo = boxLeft + half;
  const hi = boxLeft + WALK_BOX_WIDTH - half;
  if (hi <= lo) return items.map((item) => ({ ...item, walkDist: 0, walkDur: 1 }));

  // Anywhere the character is even partly hidden.
  const hiding = WALK_HIDING_SPOTS.map(([from, to]) => [from - half, to + half]);
  // Move a turnaround point out of a hiding spot — past it in the direction
  // of travel if that's still on the road, else back before it.
  const clearOfHiding = (x, outward) => {
    for (const [from, to] of hiding) {
      if (x <= from || x >= to) continue;
      if (outward > 0) return to <= hi ? to : from;
      return from >= lo ? from : to;
    }
    return x;
  };

  return items.map((item) => {
    const spot = lo + (item.xPct / 100) * (hi - lo);
    const reach = WALK_REACH[0] + stableRandom(item.key * 7 + 3) * (WALK_REACH[1] - WALK_REACH[0]);
    const dist = ((hi - lo) * reach) / 2;
    const centre = Math.min(Math.max(spot, lo + dist), hi - dist);
    const left = clearOfHiding(centre - dist, -1);
    const right = clearOfHiding(centre + dist, 1);
    const walkDist = Math.max(0, (right - left) / 2);
    const walkDur = Math.max((2 * walkDist) / WALK_SPEED, 2 * HOP_SECONDS);
    return {
      ...item,
      xPct: (((left + right) / 2 - boxLeft) / WALK_BOX_WIDTH) * 100,
      walkDist,
      walkDur,
    };
  });
}

// Hand-drawn padlock for locked trees and beds, in the label's own colour.
function LockIcon() {
  return (
    <svg className="zone-lock-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.5 10.5V8.2C7.4 5.6 9.4 3.6 12 3.6s4.7 2.1 4.5 4.7v2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M5.2 11.3c4.5-.6 9-.5 13.6.1.5 2.8.4 5.6-.2 8.4-4.4.6-8.8.6-13.2-.1-.6-2.8-.7-5.6-.2-8.4z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M12 14.6v2.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function StreetScene({
  showTour = false,
  onTourDone,
  onReplayTour,
  onOpenRadio,
  onOpenBookshelf,
  onOpenStreetSign,
}) {
  const navigate = useNavigate();
  // The /draw/:zoneId child route (DrawZone). While it's open the street
  // stays mounted underneath, blurred, and the canvas floats over it.
  // Submitting a drawing drops back to the clean view (no hotspots, sun
  // says "Start") and plays its entrance (see DrawingArrival) via
  // onSubmitted; cancelling leaves contribute mode on.
  const [mode, setMode] = useState("view"); // "view" | "contribute"
  // The just-submitted drawing's entrance: { key, zone, imageUrl, paperRect,
  // thumbUrl } — thumbUrl arrives once the save lands, and marks which
  // scene item is the new one (hidden until the entrance hands over).
  const [arrival, setArrival] = useState(null);
  const drawingCanvasOverlay = useOutlet({
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
  // The arriving item shows the local copy of the export (already in memory)
  // rather than downloading its thumbnail, so the entrance can measure it the
  // moment the save lands. Once the entrance hands over it switches to the
  // thumbnail; the browser keeps showing the old image until that's loaded.
  const itemSrc = (item) => (isArriving(item) ? arrival.imageUrl : item.url);
  useEffect(() => {
    if (!saveFailed) return undefined;
    const timer = setTimeout(() => setSaveFailed(false), 5000);
    return () => clearTimeout(timer);
  }, [saveFailed]);

  // Each crayon tree with its own leaves and a status: "full", "open" (the
  // first tree that isn't full) or "locked" (every tree after that).
  const trees = useMemo(() => {
    const leaves = placeDrawings(drawings.tree ?? [], TREE_LEAF_BOXES, {
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
    const flowers = placeDrawings(drawings.stem ?? [], FLOWER_BOXES, {
      inset: FLOWER_INSET,
      insetX: FLOWER_INSET_X,
      maxRotDeg: 8,
      rows: true,
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
  const characters = useMemo(
    () =>
      planCharacterWalks(
        placeDrawings(drawings.free ?? [], CHARACTER_BOXES, {
          insetX: 0,
          insetTop: WALK_INSET_TOP,
          insetBottom: WALK_INSET_BOTTOM,
          maxRotDeg: 0,
        }),
      ),
    [drawings.free],
  );

  return (
    <div
      className="street-scene"
      data-mode={mode}
      data-drawing={drawingCanvasOverlay ? "" : undefined}
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

          {/* Notice board — see NOTICE_BOARD above for its box. One element:
             the button is the board, with the art and the "What's on" note
             inside it. A direct child of .scene-track (whose bottom edge is
             the screen bottom), so `bottom` anchors it there. High z-index
             keeps it above .scene-ground (2) and everything inside it.
             Tappable in view mode only, same as the window surprise — once
             Start reveals the zone hotspots it's just scenery (disabled, no
             note), back once Return drops back to the clean view. */}
          {!NOTICE_TAB && <button
            type="button"
            className="notice-board-button"
            onClick={() => navigate("/notices")}
            disabled={mode !== "view"}
            aria-label="What's on in the community"
            style={{
              bottom: NOTICE_BOARD.bottom,
              left: NOTICE_BOARD.left,
              width: NOTICE_BOARD.width,
              height: NOTICE_BOARD.height,
            }}
          >
            <img className="notice-board-art" src={ASSETS.noticeBoard} alt="" />
            {mode === "view" && (
              <span
                className="notice-board-badge"
                style={{ top: `${NOTICE_BADGE_POS.top}%`, left: `${NOTICE_BADGE_POS.left}%` }}
              >
                What's on in the community!
              </span>
            )}
          </button>}

          <div className="scene-ground">
            <div className="street-art">
              <div className="street-road-box" style={roadBoxStyle} />
              <div className="street-road-strip" style={{ width: `${STREET_LENGTH}%` }}>
                {Array.from({ length: ROAD_TILE_COUNT }, (_, i) => (
                  <div key={i} className="street-road-tile" style={roadTileStyle}>
                    <img className="cropped-img" src={ROAD_STRIP.src} alt="" style={cropImgStyle(ROAD_STRIP)} />
                  </div>
                ))}
              </div>
              {STREET_BUILDINGS.map((piece) => (
                <div key={piece.id} className="street-building" style={buildingBoxStyle(piece)}>
                  <img className="cropped-img" src={piece.src} alt="Street view" style={cropImgStyle(piece)} />
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
                        className={`zone-fixture crayon-tree${t.inFront ? " crayon-tree--front" : ""}${
                          locked ? " crayon-tree--locked" : ""
                        }`}
                        data-tour={t.status === "open" ? "tree" : undefined}
                        src={ASSETS.crayonTree}
                        alt=""
                        style={{ ...box, transform: t.flip ? "scaleX(-1)" : undefined }}
                      />

                      <div
                        className={`scatter${t.inFront ? " scatter--front" : ""}`}
                        style={{ ...box, "--item-w": treeLeafWidth(t) }}
                      >
                        {SHOW_LEAF_BOXES &&
                          t.leafBoxes.map((leafBox) => {
                            const fill = t.leaves.filter(
                              (l) => l.boxId === `${t.id}/${leafBox.id}`,
                            ).length;
                            return (
                              <div
                                key={`box-${leafBox.id}`}
                                className="guide-box"
                                style={{
                                  top: leafBox.top,
                                  left: leafBox.left,
                                  width: leafBox.width,
                                  height: leafBox.height,
                                }}
                              >
                                <span className="guide-box-tag">
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
                              src={itemSrc(leaf)}
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
                          className={`zone zone--label-only tree-zone zone--${TREE_HOTSPOT.level.toLowerCase()}`}
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
                                {t.status === "full" ? "Full" : <><LockIcon /> Locked</>}
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
                  className="street-surprise-button"
                  onClick={onOpenRadio}
                  aria-label="Something's playing in the window"
                  style={{
                    top: WINDOW_RADIO.top,
                    left: WINDOW_RADIO.left,
                    width: WINDOW_RADIO.width,
                    height: WINDOW_RADIO.height,
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
                  className="street-surprise-button"
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

              {/* Street sign — same view-mode-only, glowing pattern. */}
              {mode === "view" && (
                <button
                  type="button"
                  className="street-surprise-button"
                  onClick={onOpenStreetSign}
                  aria-label="Read the history of Cardigan St"
                  style={STREET_SIGN}
                >
                  <span className="street-sign">
                    <img
                      className="cropped-img"
                      src={ASSETS.streetSign}
                      alt=""
                      draggable="false"
                      style={cropImgStyle({ crop: STREET_SIGN_CROP })}
                    />
                  </span>
                </button>
              )}

              {/* The kangaroo by the sign — tap it to replay the street
                 tour. Hidden while the tour runs, since the tour's kangaroo
                 is the one talking; just scenery (disabled) once Start
                 reveals the zone hotspots, like the notice board. */}
              {!showTour && (
                <button
                  type="button"
                  className="street-surprise-button street-kangaroo-button"
                  onClick={onReplayTour}
                  disabled={mode !== "view"}
                  aria-label="Show me around the street again"
                  style={STREET_KANGAROO}
                >
                  <img className="street-kangaroo" src={ASSETS.kangaroo} alt="" draggable="false" />
                </button>
              )}

              {/* Flower beds — see FLOWER_BEDS above. Each bed is its scattered
                 flowers (same mechanism as the tree canopy) and, while
                 contributing, its hotspot. */}
              {beds.map((b, i) => (
                <Fragment key={b.id}>
                  <div
                    className="scatter scatter--front"
                    style={{ ...bedBox(b), "--item-w": bedFlowerWidth(b),"--item-max-h": FLOWER_MAX_HEIGHT }}
                  >
                    {/* The bed's patch while contributing — first in the
                       scatter so it sits behind the flowers. */}
                    {mode === "contribute" && (
                      <div className="bed-patch" data-status={b.status} aria-hidden="true" />
                    )}
                    {SHOW_BED_BOXES && (
                      <>
                        <div className="guide-box" style={{ top: 0, left: 0, width: "100%", height: "100%" }}>
                          <span className="guide-box-tag">
                            {b.id} · {b.flowers.length}/{b.capacity}
                          </span>
                        </div>
                        <div className="guide-box bed-root-box" style={bedBox(FLOWER_BOXES[i])} />
                      </>
                    )}
                    {b.flowers.map((item) => (
                      <div
                        key={`flower-${item.key}`}
                        data-arrival={isArriving(item) ? "" : undefined}
                        className={`scatter-item scatter-item--rooted${FLOWER_WIND ? " scatter-item--wind" : ""}${
                          isArriving(item) ? " scatter-item--arriving" : ""
                        }`}
                        style={{
                          left: `${item.xPct}%`,
                          top: `${item.yPct}%`,
                          "--item-rot": `${item.rot.toFixed(1)}deg`,
                          // front-row flowers (lower roots) draw over back-row ones
                          zIndex: Math.round(item.yPct * 10),
                          // spread the sway so flowers don't move in lockstep
                          animationDelay: `${-(((item.key * 0.53) % 3.4)).toFixed(2)}s`,
                        }}
                      >
                        <img
                          className="scatter-item-img"
                          src={itemSrc(item)}
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
                      className={`zone zone--bed zone--${FLOWER_HOTSPOT.level.toLowerCase()}`}
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
                            {b.status === "full" ? "Full" : <><LockIcon /> Locked</>}
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
                  top: WALK_BOX.top,
                  left: WALK_BOX.left,
                  width: WALK_BOX.width,
                  height: WALK_BOX.height,
                  "--item-w": CHARACTER_WIDTH,
                  // Feet placement already keeps them inside the box (see
                  // WALK_INSET_TOP), so no height clamp — it only squashed them.
                  "--item-max-h": "none",
                }}
              >
                {characters.map((item) => (
                  <div
                    key={`character-${item.key}`}
                    data-arrival={isArriving(item) ? "" : undefined}
                    className={`scatter-item scatter-item--rooted scatter-item--walking${
                      isArriving(item) ? " scatter-item--arriving" : ""
                    }`}
                    style={{
                      left: `${item.xPct}%`,
                      top: `${item.yPct}%`,
                      "--item-rot": `${item.rot.toFixed(1)}deg`,
                      // its stroll (see planCharacterWalks), a seeded WALK_HOP hop
                      // about every HOP_SECONDS (a whole number per leg, so
                      // hops land at the turns) and a staggered start so
                      // nobody walks in lockstep
                      "--walk-dist": `${toWalkBoxWidth(item.walkDist).toFixed(2)}cqw`,
                      "--walk-dur": `${item.walkDur.toFixed(2)}s`,
                      "--hop-dur": `${(
                        item.walkDur / Math.max(1, Math.round(item.walkDur / HOP_SECONDS))
                      ).toFixed(3)}s`,
                      "--walk-hop": `${toWalkBoxWidth(
                        WALK_HOP[0] + stableRandom(item.key * 13 + 9) * (WALK_HOP[1] - WALK_HOP[0]),
                      ).toFixed(2)}cqw`,
                      "--walk-delay": `${-(stableRandom(item.key * 11 + 5) * item.walkDur * 2).toFixed(2)}s`,
                    }}
                  >
                    <img
                      className="scatter-item-img"
                      src={itemSrc(item)}
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
                <div className="walk-box" style={WALK_BOX}>
                  <span className="guide-box-tag">
                    walk area · top {WALK_BOX.top} · left {WALK_BOX.left} · width{" "}
                    {WALK_BOX.width} · height {WALK_BOX.height}
                  </span>
                </div>
              )}
              {SHOW_WALK_BOX &&
                WALK_HIDING_SPOTS.map(([from, to]) => (
                  <div
                    key={`hide-${from}`}
                    className="walk-box walk-box--hiding"
                    style={{ top: WALK_BOX.top, height: WALK_BOX.height, left: `${from}%`, width: `${to - from}%` }}
                  >
                    <span className="guide-box-tag">no stopping here</span>
                  </div>
                ))}

              {/* Hotspots — only while contributing. */}
              {mode === "contribute" &&
                ZONES.map((zone) => (
                  <button
                    key={`hot-${zone.id}`}
                    className={`zone zone--label-only zone--${zone.level.toLowerCase()}`}
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

      {/* Pull-up notice board (trial, see NOTICE_TAB) — view mode only, so
         it's out of the way of the zone hotspots while contributing. */}
      {NOTICE_TAB && mode === "view" && <NoticeTab />}

      {saveFailed && (
        <p role="alert" className="save-toast">
          Couldn't save your drawing — check your connection and try again.
        </p>
      )}

      {/* First-visit kangaroo tour (see StreetTour) — the spotlight targets
         .scene-ground, .scene-cta and the open tree's data-tour="tree". */}
      {showTour && <StreetTour sceneRef={sceneRef} onDone={onTourDone} />}

      {drawingCanvasOverlay}

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
