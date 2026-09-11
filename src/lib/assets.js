// Scene artwork lives in an R2 bucket, not the repo, so it can be swapped
// without a redeploy. Override the base with VITE_ASSET_BASE_URL if you move
// to a custom domain / different bucket.
//
// NOTE: `pub-*.r2.dev` is Cloudflare's dev-tier public domain — fine for now,
// but swap it for a custom domain before launch (it's rate-limited and not
// meant for production traffic).

// Exception: clouds are bundled locally. The R2 copy of Clouds.svg has an
// opaque white full-canvas rectangle behind the clouds that boxes them off
// against the sky; this copy is the same artwork with that background removed.
import cloudsSvg from "../assets/Clouds.svg";

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

const BASE =
  import.meta.env.VITE_ASSET_BASE_URL ||
  "https://pub-c3a1d03c8bed4e6d8bc732274ae6b7b2.r2.dev";

const url = (name) => `${BASE}/${encodeURIComponent(name)}`;

export const ASSETS = {
  clouds: cloudsSvg,
  house: url("Home page house 2.svg"),
  tree: url("Tree.svg"),
  leafOutline: leafOutlineSvg,
  stemOutline: stemOutlineSvg,
  stem: url("Stem 2.svg"),
  kangaroo: url("Kangaroo.svg"),
  noticeBoard: url("Notice Board.svg"),

  // Decorative frame behind the drawing surface (display only — not baked
  // into the exported PNG).
  canvasSurface: url("canvas-green.svg"),
};
