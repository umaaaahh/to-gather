import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/a11y";
import { ASSETS } from "../lib/assets";
import { playSound, useDuckAmbience, warmSound } from "../lib/sounds";
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
// Hopping between spots along the road (a step's kangarooAt). Must match
// the left transition and tour-hops-move in StreetTour.css.
const MOVE_MS = 1500;
// Gap (px) the kangaroo, and a targetAt target, keep from the screen edges.
const EDGE_GAP = 12;

// Each step spotlights the first selector that matches something in the
// scene. padTop stretches the spotlight
// upwards past the element's own box (the tree's leaves hang above it).
// boardCutout dims everything but the notice board's own silhouette, instead
// of lighting a box around it.
//
// The spotlit area is live — the street underneath really pans and taps —
// and doneWhen says what doing the step looks like, so the tour moves on by
// itself: "scroll" = the street gets panned, a selector = that gets tapped.
// look: true makes a step look-only (the spotlight is blocked too), for
// things that would leave the street and cut the tour short if tapped.
// kangarooAt: "right" hops the kangaroo along the road to the right of the
// screen, instead of mid-screen; "target" stands it beside the target, on
// whichever side has more room (pinKangaroo: and stays where it first
// lands, rather than following the target). targetAt: "left" always pans the street so
// the target sits at the left of the screen, wherever it was left — the two
// together keep the kangaroo's bubble clear of what it's pointing out.
const TOUR_STEPS = [
  {
    text: "Welcome to To Gather, Cardigan Street's digital fun hub! Doodle, explore and see what's on. Scroll along the street to start.",
    target: [".scene-ground"],
    doneWhen: "scroll",
  },
  {
    text: "Hidden details are everywhere! Find community radio to listen to while you draw, or book picks from other users.",
    target: [".window-boombox", ".window-books"],
    look: true,
    kangarooAt: "right",
    targetAt: "left",
  },
  {
    text: "Ready to draw? Tap the sun, then pick a drawing zone!",
    target: [".scene-cta"],
    doneWhen: ".scene-cta",
  },
  {
    text: "Don't forget the notice board for real life events around Cardigan Street!",
    target: [".notice-board-art"],
    look: true,
    boardCutout: true,
  },
];

// The kangaroo's cheer once a new drawing has landed in the street: a well
// done over the street, then Next to the notice board. Tapping the board
// (or "Let's go!") opens what's on and sends the kangaroo off.
export const DRAWING_DONE_STEPS = [
  {
    text: "Good job, you've left your unique mark on this digital community!",
    // The drawing that just landed (StreetScene marks it), else the street
    target: ["[data-landed] .scatter-item-img", ".scene-ground"],
    look: true,
    kangarooAt: "target",
    pinKangaroo: true, // a character drawing walks off; the kangaroo stays put
  },
  {
    text: "Now leave your mark on the real-life community by getting involved in real-life events going on around here!",
    target: [".notice-board-art"],
    kangarooAt: "target", // hops over to stand by the board
    doneWhen: ".notice-board-button",
    boardCutout: true,
  },
];

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

// Everything the overlay positions, measured from the live scene. pinnedX,
// if given, is where the kangaroo already stands for this step.
function measureTourLayout(scene, step, pinnedX = null) {
  const sceneBox = scene.getBoundingClientRect();
  const el = findTarget(scene, step.target);
  const spot = el ? spotlightRect(sceneBox, el, step.padTop) : null;

  const road = scene.querySelector(".street-road-box")?.getBoundingClientRect();
  const feetY = road
    ? road.top - sceneBox.top + road.height * FEET_DOWN_ROAD
    : sceneBox.height * 0.85;

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

  // Where along the road the kangaroo stands (its centre, px from the
  // frame's left): mid-screen, at the right, or beside the target
  // (kangarooAt).
  const kangarooW = scene.querySelector(".tour-kangaroo")?.offsetWidth ?? 0;
  const edge = kangarooW / 2 + EDGE_GAP;
  let kangarooX = sceneBox.width / 2;
  if (step.kangarooAt === "right") kangarooX = sceneBox.width - edge;
  if (step.kangarooAt === "target" && el) {
    if (pinnedX !== null) kangarooX = pinnedX;
    else {
      const r = el.getBoundingClientRect();
      const left = r.left - sceneBox.left;
      const right = r.right - sceneBox.left;
      let nextTo = sceneBox.width - right > left ? right + edge : left - edge;
      // Not behind the notice board, where it'd be hidden: step out past
      // whichever side of it is nearer and still on screen.
      if (board && nextTo + edge > board.left && nextTo - edge < board.left + board.width) {
        const beforeBoard = board.left - edge;
        const afterBoard = board.left + board.width + edge;
        const fits = (x) => x >= edge && x <= sceneBox.width - edge;
        const options = [beforeBoard, afterBoard].filter(fits);
        if (options.length) nextTo = options.sort((a, b) => Math.abs(a - nextTo) - Math.abs(b - nextTo))[0];
      }
      kangarooX = clamp(nextTo, edge, Math.max(sceneBox.width - edge, edge));
    }
  }

  // The bubble follows the kangaroo but stays on screen; its tail makes up
  // the difference, so it still points at the kangaroo's head.
  const guideEl = scene.querySelector(".tour-guide");
  const bubbleEl = scene.querySelector(".tour-bubble");
  const guideW = guideEl?.clientWidth ?? 0;
  const bubbleW = bubbleEl?.offsetWidth ?? 0;
  const dx = kangarooX - sceneBox.width / 2;
  const maxShift = Math.max((guideW - bubbleW) / 2, 0);
  const bubbleShift = clamp(dx, -maxShift, maxShift);
  const maxTail = Math.max(bubbleW / 2 - 24, 0);
  const tailShift = clamp(dx - bubbleShift, -maxTail, maxTail);

  // On a targetAt step, if the bubble would still cover the target (a
  // narrow or short screen), it rises until it sits above it — but no
  // higher than just under the Skip button. Measured from where the bubble
  // sits before it's lifted: the top of the guide, which the lift (a
  // relative `top`) doesn't move.
  let bubbleLift = 0;
  if (step.targetAt && spot && guideEl && bubbleEl) {
    const top = guideEl.getBoundingClientRect().top - sceneBox.top;
    const bottom = top + bubbleEl.offsetHeight;
    const left = guideEl.getBoundingClientRect().left - sceneBox.left + maxShift + bubbleShift;
    const right = left + bubbleW;
    const covers =
      left < spot.left + spot.width &&
      right > spot.left &&
      top < spot.top + spot.height &&
      bottom > spot.top;
    if (covers) {
      const skip = scene.querySelector(".tour-skip")?.getBoundingClientRect();
      const ceiling = (skip ? skip.bottom - sceneBox.top : 0) + EDGE_GAP;
      bubbleLift = clamp(bottom - spot.top + EDGE_GAP, 0, Math.max(top - ceiling, 0));
    }
  }

  return {
    spot,
    board,
    kangarooBottom: sceneBox.height - feetY,
    kangarooX: Math.round(kangarooX),
    bubbleShift: Math.round(bubbleShift),
    bubbleLift: Math.round(bubbleLift),
    tailShift: Math.round(tailShift),
  };
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

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
// (swipe, arrows or dots) while a spotlight picks out what each
// step is about. Rendered inside .street-scene, which sceneRef points at.
// steps defaults to the first-visit tour; a single step is just a message,
// with no arrows or dots. onGo, if given, runs when "Let's go!" is tapped
// (not Skip), as the kangaroo hops off.
export default function StreetTour({
  sceneRef,
  onDone,
  steps = TOUR_STEPS,
  label = "How to play",
  onGo,
}) {
  const [step, setStep] = useState(0);
  // "enter" for the first bubble (pops in once the kangaroo has landed),
  // then which side each new bubble slides in from.
  const [dir, setDir] = useState("enter");
  const [leaving, setLeaving] = useState(false);
  const [layout, setLayout] = useState(null);
  // Hopping between spots along the road (see kangarooAt).
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);
  movingRef.current = moving;
  const moveTimer = useRef(null);
  useEffect(() => () => clearTimeout(moveTimer.current), []);
  const swipeStartX = useRef(null);

  const current = steps[step];
  const isLast = step === steps.length - 1;

  // Re-measureTourLayout every frame: the street art loads in late, the user can
  // resize or rotate, and the street may be panning towards the target.
  // A pinKangaroo step picks the kangaroo's spot once, on the first frame
  // it has a size, and stays there — a drawing that walks about (the
  // characters) would otherwise have it sliding along after it. Other
  // steps keep re-measuring, so the street panning to a target is followed.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;
    let raf;
    let pinnedX = null;
    const tick = () => {
      const next = measureTourLayout(scene, current, pinnedX);
      if (current.pinKangaroo && pinnedX === null && scene.querySelector(".tour-kangaroo")?.offsetWidth) {
        pinnedX = next.kangarooX;
      }
      setLayout((prev) => (sameLayout(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sceneRef, current]);

  // Tells the street when the bubble is about the notice board
  // (data-tour-board), so the cheer can bring back its What's on label.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !current.boardCutout) return undefined;
    scene.dataset.tourBoard = "";
    return () => delete scene.dataset.tourBoard;
  }, [sceneRef, current]);

  // Pan the street to the target if none of it is on screen. (Only then —
  // the whole-street target of step 1 is never "centred", and the first
  // tree hangs off the start of the street, so it can't be.) A targetAt
  // step always pans, to put the target at that side of the screen.
  useEffect(() => {
    const scene = sceneRef.current;
    const el = scene && findTarget(scene, current.target);
    const scroller = el?.closest(".street-scroll");
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let left;
    if (current.targetAt === "left") {
      left = r.left - (view.left + EDGE_GAP + SPOT_PAD);
      if (Math.abs(left) < 2) return;
    } else {
      if (r.right > view.left && r.left < view.right) return;
      left = r.left + r.width / 2 - (view.left + view.width / 2);
    }
    scroller.scrollBy({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [sceneRef, current]);

  // Move on once the user actually does a step. A tap can also finish a
  // later step early (tapping the sun while still on the swipe step).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || leaving) return undefined;
    let timer;
    const advanceTo = (i) => {
      clearTimeout(timer);
      timer = setTimeout(() => (i >= steps.length ? finish() : goTo(i)), ADVANCE_MS);
    };

    function onClick(e) {
      const done = steps.findIndex(
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
  }, [sceneRef, steps, step, leaving]);

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

  // The street ambience stays turned down through the intro tour (not the
  // one-bubble cheer), and comes up once it's done.
  useDuckAmbience(steps === TOUR_STEPS);

  // The hop starts straight away — get its sound loading now.
  useEffect(() => warmSound("hop"), []);

  // Kangaroo hops back off, then the tour unmounts.
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(onDone, prefersReducedMotion() ? 0 : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  function goTo(i) {
    if (leaving || i < 0 || i >= steps.length || i === step) return;
    setDir(i > step ? "next" : "prev");
    setStep(i);
    // Off to (or back from) another spot on the road: hop the way there.
    // Two "target" steps stand by different things, so that's a move too.
    if (steps[i].kangarooAt !== current.kangarooAt || steps[i].kangarooAt === "target") {
      setMoving(true);
      clearTimeout(moveTimer.current);
      moveTimer.current = setTimeout(() => setMoving(false), MOVE_MS);
    }
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

  // A jump sound as each hop starts — hopping in, the small hops while it
  // stands about, hopping along the road, and hopping off. Each of these
  // animations starts, then iterates, once per hop. A small hop that comes
  // round mid-move is hidden under the move's hops, so it stays quiet.
  // (Reduced motion turns the hops off, so they stay quiet too.)
  const HOP_ANIMATIONS = ["tour-hops", "tour-idle", "tour-hops-move", "tour-hops-off"];
  function onHop(e) {
    if (!HOP_ANIMATIONS.includes(e.animationName)) return;
    if (e.animationName === "tour-idle" && movingRef.current) return;
    playSound("hop");
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
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeStartX.current = null)}
    >
      {layout?.spot ? (
        <>
          <div
            className="tour-spotlight"
            data-hidden={(current.boardCutout && layout.board) || undefined}
            data-follow={current.kangarooAt === "target" || undefined}
            style={layout.spot}
          />
          {current.boardCutout && layout.board && (
            <div className="tour-dim" style={behindBoardMask(layout.board)} />
          )}
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

      {layout && (
        <div className="tour-kangaroo-layer" style={behindBoardMask(layout.board)}>
          <div
            className="tour-kangaroo"
            data-moving={moving || undefined}
            style={{ bottom: layout.kangarooBottom, "--kangaroo-x": `${layout.kangarooX}px` }}
          >
            <img
              className="tour-kangaroo-img"
              src={ASSETS.kangaroo}
              alt=""
              draggable="false"
              onAnimationStart={onHop}
              onAnimationIteration={onHop}
            />
          </div>
        </div>
      )}

      {layout && (
        <div className="tour-guide" style={{ bottom: layout.kangarooBottom }}>
          {/* Keyed on the step so each new bubble remounts and animates in. */}
          <div
            key={step}
            className="tour-bubble"
            data-dir={dir}
            aria-live="polite"
            // Its sound as it appears: the first one pops in once the
            // kangaroo has landed, later ones slide in.
            onAnimationStart={(e) => e.target === e.currentTarget && playSound("bubble")}
            style={{
              left: layout.bubbleShift,
              top: -layout.bubbleLift,
              "--tail-dx": `${layout.tailShift}px`,
            }}
          >
            <p className="tour-step">{current.text}</p>

            <div className="tour-nav">
              {steps.length > 1 && (
                <>
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
                    {steps.map((_, i) => (
                      <button
                        type="button"
                        key={i}
                        className="tour-dot"
                        aria-current={i === step ? "step" : undefined}
                        aria-label={`Step ${i + 1} of ${steps.length}`}
                        onClick={() => goTo(i)}
                      />
                    ))}
                  </div>
                </>
              )}

              {isLast ? (
                <button
                  type="button"
                  className="px-btn tour-go"
                  onClick={() => {
                    finish();
                    onGo?.();
                  }}
                >
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
