import { useEffect, useState } from "react";
import { ASSETS } from "../lib/assets";
import { whenDrawingsLoaded } from "../lib/drawingsStore";
import "./SplashScreen.css";

// The splash holds until the street's art and its drawings have loaded, but
// for at least MIN_MS (so the logo gets a moment after its 0.8s entrance)
// and at most MAX_MS (so one slow image or listener can't keep it up forever).
const MIN_MS = 1500;
const MAX_MS = 4000;
// Must match the opacity transition in SplashScreen.css.
const FADE_MS = 500;

// What's on screen the moment the splash lifts. The kangaroo is here too:
// the tour hops it in straight after, so it shouldn't load in mid-air.
const PRELOAD = [
  ASSETS.clouds,
  ASSETS.streetLeft,
  ASSETS.streetRight,
  ASSETS.road,
  ASSETS.crayonTree,
  ASSETS.noticeBoard,
  ASSETS.kangaroo,
];

// Resolves once the image has loaded (or failed — a broken image shouldn't
// hold the splash up; the MAX_MS cap covers one that hangs).
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = src;
  });

// Sky-gradient + logo overlay shown once per page load. It sits on top of
// the routes rather than in front of them, so the street scene mounts and
// fetches its artwork underneath while the splash is up. onDone fires as the
// fade starts, so whatever comes next (the street tour) fades in underneath
// it rather than popping in afterwards.
export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState("showing"); // showing -> fading -> done

  useEffect(() => {
    let cancelled = false;
    let done;
    const minWait = new Promise((resolve) => setTimeout(resolve, MIN_MS));
    const loaded = Promise.all([minWait, whenDrawingsLoaded(), ...PRELOAD.map(loadImage)]);
    const cap = new Promise((resolve) => setTimeout(resolve, MAX_MS));

    Promise.race([loaded, cap]).then(() => {
      if (cancelled) return;
      setPhase("fading");
      onDone?.();
      done = setTimeout(() => setPhase("done"), FADE_MS);
    });
    return () => {
      cancelled = true;
      clearTimeout(done);
    };
    // Runs once per page load; onDone is only read when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "done") return null;

  return (
    <div className="splash" data-phase={phase} aria-hidden="true">
      <img className="splash-logo" src={ASSETS.logo} alt="" />
    </div>
  );
}
