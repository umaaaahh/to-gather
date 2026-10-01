import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ASSETS } from "../lib/assets";
import "./SplashScreen.css";
import "./DrawingArrival.css";

// The logo holds at least this long, even if the drawing lands sooner.
const MIN_LOADING_MS = 1000;
// Give up on finding the new drawing in the scene (e.g. its zone is already
// full, so it's stored but never shown) this long after the save lands...
const FIND_AFTER_SAVE_MS = 2500;
// ...or this long after submitting, if the save is just very slow.
const MAX_LOADING_MS = 12000;
// Must match the .splash opacity transition (SplashScreen.css).
const FADE_MS = 500;
// The drawing sits at its drawn size on the street this long before flying.
const HOLD_MS = 700;
// How long the drawing takes to shrink into its spot (passed to the CSS as
// --fly-ms, so the transition always matches).
const FLY_MS = 2800;
// How long the glow stays up after landing, then how long it fades (must
// match the glow's opacity transition in DrawingArrival.css).
const GLOW_MS = 2800;
const GLOW_FADE_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A just-submitted drawing's entrance (see StreetScene's `arrival`):
//   loading — the logo, with loading dots, while the save lands and the new
//             drawing turns up in the scene (hidden, see scatter-item--arriving)
//   reveal  — the logo fades; the drawing sits over the street at the size
//             and spot it was drawn at (paperRect, the drawing paper's box)
//   fly     — it shrinks and moves into its real spot in the scene
//   glow    — the clone hands over to the real scene item, which glows: the
//             glow is the item's own ::before, so it sits behind the
//             thumbnail in its final spot (and behind any neighbour over it)
//   fading  — the glow fades
// then onDone, which clears the item's arrival marking.
// If the drawing never turns up (zone full / slow save) it just fades out.
export default function DrawingArrival({ arrival, sceneRef, onDone }) {
  const [phase, setPhase] = useState("loading");
  const [target, setTarget] = useState(null); // landing box, see measureLandingSpot()
  const startRef = useRef(Date.now());
  const savedAtRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (arrival.thumbUrl && savedAtRef.current == null) savedAtRef.current = Date.now();
  }, [arrival.thumbUrl]);

  // Wait (at least MIN_LOADING_MS) for the new item to be in the scene with
  // its thumbnail loaded, then run the rest of the sequence.
  useEffect(() => {
    let cancelled = false;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let sceneItem = null;

    async function run() {
      let img = null;
      for (;;) {
        if (cancelled) return;
        const now = Date.now();
        img = findArrivingImg(sceneRef.current);
        const minDone = now - startRef.current >= MIN_LOADING_MS;
        if (img && minDone) break;
        const gaveUpAfterSave =
          savedAtRef.current != null && now - savedAtRef.current >= FIND_AFTER_SAVE_MS;
        if ((gaveUpAfterSave || now - startRef.current >= MAX_LOADING_MS) && minDone) {
          img = null;
          break;
        }
        await wait(100);
      }

      if (img) {
        scrollIntoCentre(sceneRef.current, img);
        setTarget(measureLandingSpot(img));
      }
      setPhase("reveal");
      await wait(FADE_MS + HOLD_MS);
      if (cancelled) return;

      if (img && !reduceMotion) {
        setPhase("fly");
        await wait(FLY_MS);
        if (cancelled) return;
      }
      if (img) {
        // Shows the real item in the clone's place and lights its glow (see
        // DrawingArrival.css).
        sceneItem = img.closest(".scatter-item");
        sceneItem.dataset.glow = "on";
        setPhase("glow");
        await wait(GLOW_MS);
        if (cancelled) return;
        sceneItem.dataset.glow = "off";
      }
      setPhase("fading");
      await wait(GLOW_FADE_MS);
      if (!cancelled) onDoneRef.current?.();
    }

    run();
    return () => {
      cancelled = true;
      if (sceneItem) delete sceneItem.dataset.glow;
    };
    // One run per arrival (StreetScene keys this component by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const from = arrival.paperRect;
  const landed = target && phase !== "loading" && phase !== "reveal";
  // Drawn size/spot -> scene size/spot, as one transform from the paper box
  // so the transition can animate it.
  const transform = landed
    ? `translate(${target.centerX - (from.left + from.width / 2)}px, ${
        target.centerY - (from.top + from.height / 2)
      }px) rotate(${target.rot}deg) scale(${(target.w / from.width) * (target.flip ? -1 : 1)}, ${
        target.h / from.height
      })`
    : undefined;
  // Once it's landed the real scene item takes over, so the clone goes.
  const realItemShowing = target && (phase === "glow" || phase === "fading");

  return createPortal(
    <>
      <div className="splash arrival-loading" data-phase={phase === "loading" ? "showing" : "fading"} aria-hidden="true">
        <img className="splash-logo" src={ASSETS.logo} alt="" />
        <div className="arrival-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      {phase !== "loading" && !realItemShowing && (
        <div
          className="arrival-clone"
          data-phase={phase}
          data-landing={target ? "" : undefined}
          style={{
            left: from.left,
            top: from.top,
            width: from.width,
            height: from.height,
            transform,
            "--fly-ms": `${FLY_MS}ms`,
          }}
          aria-hidden="true"
        >
          <img className="arrival-img" src={arrival.imageUrl} alt="" draggable={false} />
        </div>
      )}
      <span className="arrival-sr" role="status">
        {phase === "loading" ? "Adding your drawing to the street…" : "Your drawing is on the street!"}
      </span>
    </>,
    document.body,
  );
}

function findArrivingImg(scene) {
  const img = scene?.querySelector("[data-arrival] .scatter-item-img");
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

// Pan the street so the landing spot is mid-screen before the logo fades.
function scrollIntoCentre(scene, img) {
  const scroller = scene?.querySelector(".street-scroll");
  if (!scroller) return;
  const r = img.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  scroller.scrollTo({
    left: scroller.scrollLeft + (r.left + r.width / 2) - (s.left + s.width / 2),
    behavior: "instant",
  });
}

// The scene item's centre on screen (its bounding box's centre holds even
// when it's rotated), its un-rotated size, rotation and mirror.
function measureLandingSpot(img) {
  const sceneItem = img.closest(".scatter-item");
  const style = getComputedStyle(sceneItem);
  const r = img.getBoundingClientRect();
  return {
    centerX: r.left + r.width / 2,
    centerY: r.top + r.height / 2,
    w: img.offsetWidth,
    h: img.offsetHeight || img.offsetWidth,
    // The live `rotate` (the wind sway rocks it, paused mid-rock), else the
    // resting tilt.
    rot: parseFloat(style.rotate) || parseFloat(style.getPropertyValue("--item-rot")) || 0,
    flip: sceneItem.classList.contains("scatter-item--flip"),
  };
}
