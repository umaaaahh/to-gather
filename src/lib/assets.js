// Scene artwork lives in an R2 bucket, not the repo, so it can be swapped
// without a redeploy. Override the base with VITE_ASSET_BASE_URL if you move
// to a custom domain / different bucket.
//
// NOTE: `pub-*.r2.dev` is Cloudflare's dev-tier public domain — fine for now,
// but swap it for a custom domain before launch (it's rate-limited and not
// meant for production traffic).

// Exception: the drawing-canvas templates (leaf outline, flower stem) are
// bundled locally because DrawingCanvas draws them onto a <canvas> to bake
// them into the exported PNG. The pub-*.r2.dev domain sends no
// Access-Control-Allow-Origin header, so a crossOrigin image load from it
// fails (the template shows as a live guide but silently never makes it into
// the flattened artwork). Serving them same-origin via Vite sidesteps CORS.
// The stem is also the tight-cropped copy — the bucket's "Stem 2.svg" is a
// full A4 artboard with the stem in one corner, wrong scale for a template.
import leafOutlineSvg from "../assets/leaf-outline.svg";
import stemOutlineSvg from "../assets/Stem.svg";
// The crayon trunk is bundled too: the bucket's tree_transparent.svg is just
// this PNG wrapped in an <svg> with width/height but no viewBox, so as an
// <img> it clips at its intrinsic 800x1325 instead of scaling to its box.
import crayonTreePng from "../assets/tree.png";

const BASE =
  import.meta.env.VITE_ASSET_BASE_URL ||
  "https://pub-c3a1d03c8bed4e6d8bc732274ae6b7b2.r2.dev";

const url = (name) => `${BASE}/${encodeURIComponent(name)}`;

export const ASSETS = {
  clouds: url("vector_clouds.svg"),
  streetLeft: url("building 56.svg"),
  streetRight: url("building 94.svg"),
  road: url("the road.svg"),
  crayonTree: crayonTreePng,
  leafOutline: leafOutlineSvg,
  stemOutline: stemOutlineSvg,
  stem: url("Stem 2.svg"),
  kangaroo: url("Kangaroo.svg"),
  noticeBoard: url("noticeboard_try.png"),

  // Decorative frame behind the drawing surface (display only — not baked
  // into the exported PNG).
  canvasSurface: url("canvas-green.svg"),
};
