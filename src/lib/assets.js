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
// The left building is bundled too: it's the bucket's "building 56.svg" with
// the sun that was painted into its sky erased — the Start button is the sun
// now (see SunButton). Swap back to url("building 56.svg") if the bucket
// copy is ever re-exported without it.
import streetLeftSvg from "../assets/building-56.svg";

const BASE =
  import.meta.env.VITE_ASSET_BASE_URL ||
  "https://pub-c3a1d03c8bed4e6d8bc732274ae6b7b2.r2.dev";

const url = (name) => `${BASE}/${encodeURIComponent(name)}`;

export const ASSETS = {
  logo: url("logo.svg"),
  clouds: url("vector_clouds.svg"),
  streetLeft: streetLeftSvg,
  streetRight: url("building 94.svg"),
  road: url("the road.svg"),
  crayonTree: url("lighter tree.svg"),
  leafOutline: leafOutlineSvg,
  stemOutline: stemOutlineSvg,
  kangaroo: url("Kangaroo_Crayon Style.PNG"),
  noticeBoard: url("noticeboard_try.png"),
  // Crayon boombox in the street's music window (opens the radio).
  radio: url("Untitled - 30 September 2026 at 01.21.06 (1).png"),
  // Crayon book row in the street's bookshelf window (opens the Bookshelf).
  books: url("books 2.png"),
};
