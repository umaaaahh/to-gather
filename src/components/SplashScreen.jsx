import { useEffect, useState } from "react";
import { ASSETS } from "../lib/assets";
import "./SplashScreen.css";

// How long the logo holds before the splash starts fading out.
const SPLASH_MS = 5000;
// Must match the opacity transition in SplashScreen.css.
const FADE_MS = 500;

// Sky-gradient + logo overlay shown once per page load. It sits on top of
// the routes rather than in front of them, so the street scene mounts and
// fetches its artwork underneath while the splash is up. onDone fires as the
// fade starts, so whatever comes next (the street tour) fades in underneath
// it rather than popping in afterwards.
export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState("showing"); // showing -> fading -> done

  useEffect(() => {
    // Warm the cache for the tour's kangaroo (a big PNG) while the logo is
    // up, so it's there for its hop in rather than loading in mid-air.
    new Image().src = ASSETS.kangaroo;

    const fade = setTimeout(() => {
      setPhase("fading");
      onDone?.();
    }, SPLASH_MS);
    const done = setTimeout(() => setPhase("done"), SPLASH_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
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
