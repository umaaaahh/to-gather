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

const BASE =
  import.meta.env.VITE_ASSET_BASE_URL ||
  "https://pub-c3a1d03c8bed4e6d8bc732274ae6b7b2.r2.dev";

// Encodes each path segment, so "folder/file name.png" keeps its slash.
const url = (name) => `${BASE}/${name.split("/").map(encodeURIComponent).join("/")}`;

// Optimised copies of the scene art: WebP (or SVGO'd SVG), and the buildings
// and road are pre-cropped to what StreetScene shows (+2px margin) — their
// crop numbers in StreetScene.jsx are in these files' pixels. building-56 is
// the copy with the sun erased (the Start button is the sun, see SunButton).
const resized = (name) => url(`resized assests/${name}`);

export const ASSETS = {
  logo: url("logo.svg"),
  clouds: resized("vector_clouds.svg"),
  streetLeft: resized("building-56.webp"),
  streetRight: resized("building-94.webp"),
  road: resized("the-road.webp"),
  crayonTree: resized("tree.webp"),
  leafOutline: leafOutlineSvg,
  stemOutline: stemOutlineSvg,
  kangaroo: resized("kangaroo.webp"),
  // TEMP: the 600x900 board art as its original PNG, until its WebP copy
  // replaces resized assests/noticeboard.webp (still the older 595x842 art).
  noticeBoard: url("Untitled - 30 September 2026 at 15.33.06-2.png"),
  // Crayon boombox in the street's music window (opens the radio).
  radio: url("Untitled - 30 September 2026 at 01.21.06 (1).png"),
  // Crayon book row in the street's bookshelf window (opens the Bookshelf).
  books: url("books 2.png"),
  // Crayon "Cardigan St" street sign, between the first tree and the left
  // building. A 595x842 page with the sign in the middle — StreetScene crops
  // it (STREET_SIGN_CROP).
  streetSign: url("Untitled design (2).svg"),
};
