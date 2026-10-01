import { useEffect, useRef, useState } from "react";
import { ASSETS } from "../lib/assets";
// Alpha-only silhouette of the notice board art, bundled so it's same-origin:
// a CSS mask-image needs CORS, which the asset bucket doesn't send.
import noticeBoardMask from "../assets/notice-board-mask.png";
import "./StreetTour.css";

// Horizontal drag (px) that counts as a swipe between steps.
const SWIPE_PX = 40;
// Breathing room (px) between a spotlighted element and the spotlight edge.
const SPOT_PAD = 8;
// How far down the grey road (0 = its top edge, 1 = its bottom) the
// kangaroo's feet land.
const FEET_DOWN_ROAD = 0.75;
// Must match the tour-hop-out animation in StreetTour.css.
const LEAVE_MS = 900;
// How far (px) the street has to pan before the swipe step counts as done.
const SCROLL_DONE_PX = 60;
// Pause between doing a step and the next bubble, so the user sees their
// swipe/tap land first.
const ADVANCE_MS = 700;

// Each step spotlights the first selector that matches something in the
// scene. hint is the pointer drawn on it: "tap" points down at the target,
// "swipe" slides side to side along the road. padTop stretches the spotlight
// upwards past the element's own box (the tree's leaves hang above it).
//
// The spotlit area is live — the street underneath really pans and taps —
// and doneWhen says what doing the step looks like, so the tour moves on by
// itself: "scroll" = the street gets panned, a selector = that gets tapped.
// look: true makes a step look-only (the spotlight is blocked too), for
// things that would leave the street and cut the tour short if tapped.
const TOUR_STEPS = [
  {
    text: "Swipe left and right to explore the street.",
    target: [".scene-ground"],
    hint: "swipe",
    doneWhen: "scroll",
  },
  {
    text: "This is the notice board. Tap it any time to see what's on around the street!",
    target: [".notice-board-art", ".notice-tab"],
    hint: "tap",
    look: true,
  },
  {
    text: "Tap the sun to start, then pick a leaf, a flower or a character to draw.",
    target: [".scene-cta"],
    hint: "tap",
    doneWhen: ".scene-cta",
  },
  {
    text: "Tap Done and your drawing joins the street for everyone to see, like the leaves on this tree!",
    target: ['[data-tour="tree"]', ".crayon-tree"],
    hint: "tap",
    padTop: 36,
  },
];

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function findTarget(scene, selectors) {
  for (const sel of selectors) {
    const el = scene.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// el's box relative to the scene frame, padded and clipped to the frame (the
// street pans, so a target can hang off either side). null if none of it is
// on screen.
function spotlightRect(sceneBox, el, padTop = 0) {
  const r = el.getBoundingClientRect();
  const left = Math.max(r.left - sceneBox.left - SPOT_PAD, 0);
  const top = Math.max(r.top - sceneBox.top - SPOT_PAD - padTop, 0);
  const right = Math.min(r.right - sceneBox.left + SPOT_PAD, sceneBox.width);
  const bottom = Math.min(r.bottom - sceneBox.top + SPOT_PAD, sceneBox.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

// Everything the overlay positions, measured from the live scene.
function measureTourLayout(scene, step) {
  const sceneBox = scene.getBoundingClientRect();
  const el = findTarget(scene, step.target);
  const spot = el ? spotlightRect(sceneBox, el, step.padTop) : null;

  const road = scene.querySelector(".street-road-box")?.getBoundingClientRect();
  const feetY = road
    ? road.top - sceneBox.top + road.height * FEET_DOWN_ROAD
    : sceneBox.height * 0.85;

  let pointer = null;
  if (step.hint === "swipe") {
    // Along the road, left of the kangaroo.
    pointer = { x: sceneBox.width * 0.28, y: feetY - 30 };
  } else if (spot) {
    const x = spot.left + spot.width / 2;
    pointer = { x: Math.min(Math.max(x, 28), sceneBox.width - 28), y: spot.top };
  }

  // The notice board's box, so it can be cut out of the kangaroo layer.
  const boardEl = scene.querySelector(".notice-board-art");
  let board = null;
  if (boardEl) {
    const r = boardEl.getBoundingClientRect();
    if (r.right > sceneBox.left && r.left < sceneBox.right) {
      board = {
        left: r.left - sceneBox.left,
        top: r.top - sceneBox.top,
        width: r.width,
        height: r.height,
      };
    }
  }

  return { spot, pointer, board, kangarooBottom: sceneBox.height - feetY };
}

// The board stands at the front of the street, so the kangaroo should hop
// behind it — but the kangaroo lives up in the tour overlay, above the whole
// street. So its layer is masked: everything visible except the board's
// silhouette, where the real board (dimmed or lit like the rest of the
// scene) shows through from underneath.
function behindBoardMask(board) {
  if (!board) return undefined;
  const image = `linear-gradient(#000, #000), url(${noticeBoardMask})`;
  const position = `0 0, ${board.left}px ${board.top}px`;
  const size = `100% 100%, ${board.width}px ${board.height}px`;
  return {
    maskImage: image,
    maskPosition: position,
    maskSize: size,
    maskRepeat: "no-repeat",
    maskComposite: "exclude",
    WebkitMaskImage: image,
    WebkitMaskPosition: position,
    WebkitMaskSize: size,
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskComposite: "xor",
  };
}

const sameLayout = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Guided first-visit tour over the live street scene: the kangaroo hops in
// along the road, then talks through the steps one speech bubble at a time
// (swipe, arrows or dots) while a spotlight and pointer pick out what each
// step is about. Rendered inside .street-scene, which sceneRef points at.
export default function StreetTour({ sceneRef, onDone }) {
  const [step, setStep] = useState(0);
  // "enter" for the first bubble (pops in once the kangaroo has landed),
  // then which side each new bubble slides in from.
  const [dir, setDir] = useState("enter");
  const [leaving, setLeaving] = useState(false);
  const [layout, setLayout] = useState(null);
  const swipeStartX = useRef(null);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  // Re-measureTourLayout every frame: the street art loads in late, the user can
  // resize or rotate, and the street may be panning towards the target.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;
    let raf;
    const tick = () => {
      const next = measureTourLayout(scene, current);
      setLayout((prev) => (sameLayout(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sceneRef, current]);

  // Pan the street to the target if none of it is on screen. (Only then —
  // the whole-street target of step 1 is never "centred", and the first
  // tree hangs off the start of the street, so it can't be.)
  useEffect(() => {
    const scene = sceneRef.current;
    const el = scene && findTarget(scene, current.target);
    const scroller = el?.closest(".street-scroll");
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.right > view.left && r.left < view.right) return;
    scroller.scrollBy({
      left: r.left + r.width / 2 - (view.left + view.width / 2),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [sceneRef, current]);

  // Move on once the user actually does a step. A tap can also finish a
  // later step early (tapping the sun while still on the swipe step).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || leaving) return undefined;
    let timer;
    const advanceTo = (i) => {
      clearTimeout(timer);
      timer = setTimeout(() => (i >= TOUR_STEPS.length ? finish() : goTo(i)), ADVANCE_MS);
    };

    function onClick(e) {
      const done = TOUR_STEPS.findIndex(
        (s, i) => i >= step && s.doneWhen && s.doneWhen !== "scroll" && e.target.closest(s.doneWhen),
      );
      if (done !== -1) advanceTo(done + 1);
    }

    // Keeps pushing the timer back while the street is still moving, so the
    // next bubble comes once the swipe settles.
    const scroller = scene.querySelector(".street-scroll");
    const startX = scroller?.scrollLeft ?? 0;
    function onScroll() {
      if (Math.abs(scroller.scrollLeft - startX) > SCROLL_DONE_PX) advanceTo(step + 1);
    }

    scene.addEventListener("click", onClick, true);
    if (current.doneWhen === "scroll") scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      scene.removeEventListener("click", onClick, true);
      scroller?.removeEventListener("scroll", onScroll);
    };
    // goTo/finish are re-created each render but only read step, which is a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneRef, step, leaving]);

  // Leaving the street mid-tour (a tap in the live spotlight can navigate —
  // the open tree's hotspot, the notice board) counts as finishing it, so it
  // doesn't replay on the way back. The timer is so StrictMode's dev-only
  // unmount/remount cancels it instead of ending the tour on the spot.
  const unmountTimer = useRef(null);
  useEffect(() => {
    clearTimeout(unmountTimer.current);
    return () => {
      unmountTimer.current = setTimeout(onDone, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kangaroo hops back off, then the tour unmounts.
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(onDone, prefersReducedMotion() ? 0 : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  function goTo(i) {
    if (leaving || i < 0 || i >= TOUR_STEPS.length || i === step) return;
    setDir(i > step ? "next" : "prev");
    setStep(i);
  }

  const finish = () => setLeaving(true);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowRight") goTo(step + 1);
      if (e.key === "ArrowLeft") goTo(step - 1);
      if (e.key === "Escape") finish();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPointerDown(e) {
    swipeStartX.current = e.clientX;
  }

  function onPointerUp(e) {
    if (swipeStartX.current === null) return;
    const dx = e.clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (dx <= -SWIPE_PX) goTo(step + 1);
    if (dx >= SWIPE_PX) goTo(step - 1);
  }

  return (
    <div
      className="tour"
      data-leaving={leaving || undefined}
      role="dialog"
      aria-label="How to play"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeStartX.current = null)}
    >
      {layout?.spot ? (
        <>
          <div className="tour-spotlight" style={layout.spot} />
          {/* Four invisible blockers around the spotlight: they swallow
             taps and drags on the dimmed parts, leaving only the lit hole
             open to the street underneath. */}
          <div className="tour-block" style={{ left: 0, right: 0, top: 0, height: layout.spot.top }} />
          <div
            className="tour-block"
            style={{ left: 0, right: 0, top: layout.spot.top + layout.spot.height, bottom: 0 }}
          />
          <div
            className="tour-block"
            style={{ left: 0, width: layout.spot.left, top: layout.spot.top, height: layout.spot.height }}
          />
          <div
            className="tour-block"
            style={{
              left: layout.spot.left + layout.spot.width,
              right: 0,
              top: layout.spot.top,
              height: layout.spot.height,
            }}
          />
          {current.look && <div className="tour-block" style={layout.spot} />}
        </>
      ) : (
        <div className="tour-dim tour-block" />
      )}

      {layout?.pointer && (
        <div
          className="tour-pointer"
          data-hint={current.hint}
          data-first={dir === "enter" || undefined}
          style={{ left: layout.pointer.x, top: layout.pointer.y }}
          aria-hidden="true"
        >
          {/* Keyed so the bob/sway restarts when the pointer moves on. */}
          <span key={step} className="tour-pointer-hand">
            {current.hint === "swipe" ? "👆" : "👇"}
          </span>
        </div>
      )}

      {layout && (
        <div className="tour-kangaroo-layer" style={behindBoardMask(layout.board)}>
          <div className="tour-kangaroo" style={{ bottom: layout.kangarooBottom }}>
            <img
              className="tour-kangaroo-img"
              src={ASSETS.kangaroo}
              alt=""
              draggable="false"
            />
          </div>
        </div>
      )}

      {layout && (
        <div className="tour-guide" style={{ bottom: layout.kangarooBottom }}>
          {/* Keyed on the step so each new bubble remounts and animates in. */}
          <div key={step} className="tour-bubble" data-dir={dir} aria-live="polite">
            <p className="tour-step">{current.text}</p>

            <div className="tour-nav">
              <button
                type="button"
                className="tour-arrow"
                onClick={() => goTo(step - 1)}
                disabled={step === 0}
                aria-label="Previous step"
              >
                ‹
              </button>

              <div className="tour-dots">
                {TOUR_STEPS.map((_, i) => (
                  <button
                    type="button"
                    key={i}
                    className="tour-dot"
                    aria-current={i === step ? "step" : undefined}
                    aria-label={`Step ${i + 1} of ${TOUR_STEPS.length}`}
                    onClick={() => goTo(i)}
                  />
                ))}
              </div>

              {isLast ? (
                <button type="button" className="tour-go" onClick={finish}>
                  Let's go!
                </button>
              ) : (
                <button
                  type="button"
                  className="tour-arrow"
                  onClick={() => goTo(step + 1)}
                  aria-label="Next step"
                >
                  ›
                </button>
              )}
            </div>
          </div>

          {/* Holds the kangaroo's place under the bubble (the kangaroo
             itself is drawn in .tour-kangaroo-layer above) and takes swipes. */}
          <div className="tour-kangaroo-spot" />
        </div>
      )}

      <button type="button" className="tour-skip" onClick={finish}>
        Skip
      </button>
    </div>
  );
}
