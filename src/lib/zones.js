import { ASSETS } from "./assets";

// Per-zone drawing config. Each zone hands the DrawingCanvas a small fixed
// palette (no colour picker), an optional background template that's shown
// live as a guide and also baked into the flattened export at the same
// scale/position (never clipped/masked — see DrawingCanvas's handleDone),
// and exportSize: the exported PNG is always exportSize x exportSize, the
// full square drawing area, so nothing drawn on it is ever cropped.
//
// Route zoneIds are "tree" | "stem" | "free". "flower" is accepted as an
// alias for "stem" so the component API in the brief still works verbatim.
//
// backgroundTemplate is still null for free — it gets its own template once
// that artwork is ready.
export const ZONE_CONFIG = {
  tree: {
    label: "Colour the tree",
    palette: [
      "#1b5e20", // deep leaf green
      "#2e7d32",
      "#4caf50",
      "#81c784",
      "#c8e6c9", // pale new growth
      "#6d4c41", // bark brown
      "#8d6e63",
      "#3e2723", // shadow brown
    ],
    backgroundTemplate: ASSETS.leafOutline,
    exportSize: 400,
  },

  stem: {
    label: "Draw a flower",
    palette: [
      "#e53935", // red
      "#f06292", // pink
      "#d81b60", // magenta
      "#8e24aa", // purple
      "#ffb300", // amber
      "#fdd835", // yellow
      "#fb8c00", // orange
      "#43a047", // leaf green
      "#ffffff", // white petals
    ],
    backgroundTemplate: ASSETS.stemOutline,
    exportSize: 400,
  },

  free: {
    label: "Draw a character",
    palette: [
      "#000000",
      "#ffffff",
      "#e53935", // red
      "#fb8c00", // orange
      "#fdd835", // yellow
      "#43a047", // green
      "#1e88e5", // blue
      "#8e24aa", // purple
      "#6d4c41", // brown
      "#f06292", // pink
      "#00acc1", // teal
      "#9e9e9e", // grey
    ],
    backgroundTemplate: null,
    exportSize: 400,
  },
};

// Normalise a route zoneId to a config key.
export function resolveZone(zoneId) {
  if (zoneId === "flower") return "stem";
  return ZONE_CONFIG[zoneId] ? zoneId : "free";
}
