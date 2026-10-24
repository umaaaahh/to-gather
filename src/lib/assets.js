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
// Same again for the UI sounds that must start on the tap (the click pop,
// popups opening): lib/sounds.js plays them through Web Audio, which starts
// instantly but has to fetch the file, so it needs CORS too.
import clickPopMp3 from "../assets/sounds/click-pop.mp3";
import popupOpenMp3 from "../assets/sounds/popup-open.mp3";

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
  // Crayon neon "Street stats!" poster on the left building (opens the
  // street stats popup).
  streetStats: url("street stats.png"),
  // Crayon kangaroo head, either side of the street stats "tap a bar" hint.
  kangarooHead: url("Kangaroo L.svg"),
  // Pixel pencil and eraser on the drawing canvas's tool buttons (see
  // DrawingCanvas).
  brushIcon: url("Sound/dot2026_1024_1840_22.png"),
  eraserIcon: url("dot2026_1024_1842_55.png"),
  // UI pop played on every button press (see lib/sounds.js).
  // Bundled, see above — the bucket's floraphonic-minimal-pop-click-ui-1-198301.mp3.
  clickPop: clickPopMp3,
  // "Your drawing is on the street!" (see DrawingArrival). 3.8s, so it ends
  // just before the glow's harp.
  revealSound: url(
    "Sound/diogodasilvasimoes-magical-notification-tone-soft-fantasy-digital-alert-438278.mp3",
  ),
  // Every other popup opening: Radio, The Shelf, About, Stats (usePopupSound
  // in lib/sounds.js). Bundled, see above — the bucket's
  // Sound/freesound_community-plastic-wow-4-83016.mp3.
  popupOpenSound: popupOpenMp3,
  // The notice board, opening What's on (see EventsPopout).
  noticeBoardSound: url("Sound/tithuh-level-up-523624.mp3"),
  // The boombox's station keys and its power button (see Boombox).
  radioButtonSound: url("Sound/dragon-studio-button-press-386165.mp3"),
  radioPowerSound: url("Sound/dragon-studio-button-press-2-386176.mp3"),
  // Static while a radio station tunes in (see Boombox).
  radioStaticSound: url("Sound/freesound_community-fm-radio-static-82334.mp3"),
  // Each tour speech bubble popping or sliding in (see StreetTour).
  bubbleSound: url("Sound/u_iozlfd2w96-bubble-pop-283674.mp3"),
  // The kangaroo cheering a just-landed drawing (see StreetScene).
  cheerSound: url("Sound/floraphonic-cute-character-wee-1-188162.mp3"),
  // Harp flourish: a new drawing glowing on the street (see DrawingArrival),
  // and a book recommendation added to the Shelf (see Bookshelf).
  harpSound: url("Sound/chrysalyn-cheerful-traditional-harp-positive-ui-alert-540977.mp3"),
  // Looping background music under the street (see lib/sounds.js).
  streetAmbience: url("Sound/zephiramusic-cute-lofi-613381.mp3"),
  // One jump per hop of the tour kangaroo (see StreetTour).
  kangarooHopSound: url("Sound/jump-1.mp3"),
};

// Where the street sign sits in its 595x842 file (the rest is empty page).
// Used by the sign on the street and in the About popup.
export const STREET_SIGN_CROP = { fileWidth: 595, fileHeight: 842, x: 135, y: 35, width: 387, height: 757 };

// Style for an <img> showing just the `crop` region of its file, inside an
// overflow-hidden box with the crop's aspect ratio (the img is absolutely
// positioned, see .cropped-img).
export const cropImgStyle = ({ crop }) => ({
  width: `${(crop.fileWidth / crop.width) * 100}%`,
  left: `${(-crop.x / crop.width) * 100}%`,
  top: `${(-crop.y / crop.height) * 100}%`,
});
