import { useEffect, useRef, useState } from "react";
import LoadingLogo from "./LoadingLogo";
import "./Boombox.css";

// Local community radio, streamed live. `pos` is where the tuner needle sits
// on the dial for that station.
const STATIONS = [
  {
    id: "rrr",
    label: "Triple R",
    name: "Triple R 102.7FM",
    src: "https://ondemand.rrr.org.au/getstream?id=wsmq",
    link: "https://www.rrr.org.au",
    about:
      "Melbourne's independent community station since 1976, broadcasting from Brunswick East. Triple R is kept on air by its subscribers and a big crew of volunteer presenters, and it's been the soundtrack to the city's live music scene for decades: local bands, record store finds and gig guides.",
    color: "#ff9f3f",
    pos: "14%",
  },
  {
    id: "syn",
    label: "SYN",
    name: "SYN 90.7FM",
    // MP3 mount rather than SYN's AAC+ one (3SYNAAC.aac): raw AAC+ streams
    // don't play in every browser, MP3 does.
    src: "https://playerservices.streamtheworld.com/api/livestream-redirect/3SYN.mp3",
    link: "https://www.syn.org.au",
    about:
      "SYN is Melbourne's youth-run community station, on air across Naarm/Melbourne on 90.7FM. Every show is made by young people under 26, so for lots of Melbourne musicians, journalists and presenters, SYN was the first place they ever spoke into a mic.",
    color: "#6fd38a",
    pos: "50%",
  },
  {
    id: "fodder",
    label: "Fodder",
    name: "Radio Fodder",
    src: "https://radio-fodder.radiocult.fm/stream",
    link: "https://radiofodder.live",
    about:
      "Radio Fodder is the University of Melbourne's student radio station, streaming online from the Parkville campus. It's run by students for students, and it's a small, scrappy corner of Melbourne radio where anyone can have a go at a show.",
    color: "#c9a4ff",
    pos: "86%",
  },
];

/**
 * Crayon boombox radio. The speaker cones pump to the real bass when a
 * station allows cross-origin audio (so it can be run through an analyser),
 * and fall back to a steady beat animation when it doesn't.
 *
 * Keep it mounted to keep the music going — the audio lives in this
 * component, so unmounting it stops playback.
 *
 * @param {(station: object|null, playing: boolean) => void} [onNowPlaying]
 *   called whenever the selected station or its playing state changes —
 *   station is null once nothing's on (paused, failed, or never started).
 *   Drives the mini radio on the street (see MiniRadio).
 */
export default function Boombox({ onNowPlaying }) {
  const conesRef = useRef([]);
  // All the playback plumbing is mutable and not rendered, so it lives in a
  // ref rather than state. Two players: one wired to the analyser (needs the
  // station to allow CORS), and a plain one for stations that don't.
  const playerRef = useRef(null);

  const [current, setCurrent] = useState(null); // station the needle is on
  const [active, setActive] = useState(null); // station button held down
  const [status, setStatus] = useState("idle"); // idle|off|tuning|live|paused|blocked|unavailable
  const [playing, setPlaying] = useState(false);
  const [reactive, setReactive] = useState(false);
  const [volume, setVolume] = useState(0.8); // 0..1

  // A station counts as "on" while its button is held down — that covers
  // tuning in and buffering, and clears on pause or a failed stream.
  const stationOn = active ? current : null;
  useEffect(() => {
    onNowPlaying?.(stationOn, playing);
  }, [stationOn, playing, onNowPlaying]);

  useEffect(() => {
    const analyserEl = new Audio();
    analyserEl.crossOrigin = "anonymous";
    analyserEl.preload = "none";
    const fallbackEl = new Audio();
    fallbackEl.preload = "none";

    const player = {
      analyserEl,
      fallbackEl,
      analyserBlocked: new Set(), // stations that refused analyser access
      ctx: null,
      analyser: null,
      gain: null,
      levels: null,
      volume: 0.8,
      activeEl: null, // whichever audio element is currently in use
      current: null,
      rafId: null,
      bounce: 0,
    };
    playerRef.current = player;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Read the bass frequencies each frame and push the speaker cones out.
    const pulse = () => {
      player.analyser.getByteFrequencyData(player.levels);
      let sum = 0;
      for (let i = 0; i < 6; i++) sum += player.levels[i];
      const bass = sum / (6 * 255);
      const hit = Math.min(1, Math.max(0, (bass - 0.4) / 0.5));
      player.bounce = Math.max(hit, player.bounce * 0.86); // snap out, ease back in
      const scale = 1 + player.bounce * 0.16;
      for (const c of conesRef.current) if (c) c.style.transform = `scale(${scale.toFixed(3)})`;
      player.rafId = requestAnimationFrame(pulse);
    };
    player.stopPulse = () => {
      if (player.rafId) cancelAnimationFrame(player.rafId);
      player.rafId = null;
      player.bounce = 0;
      for (const c of conesRef.current) if (c) c.style.transform = "";
    };

    const cleanups = [];
    for (const el of [analyserEl, fallbackEl]) {
      const onPlaying = () => {
        if (el !== player.activeEl) return;
        const live = el === analyserEl && !!player.analyser && !reduceMotion;
        setPlaying(true);
        setReactive(live);
        if (live && !player.rafId) pulse();
      };
      const onStop = () => {
        if (el !== player.activeEl) return;
        setPlaying(false);
        setReactive(false);
        player.stopPulse();
      };
      el.addEventListener("playing", onPlaying);
      const stopEvents = ["pause", "waiting", "error", "emptied"];
      for (const evt of stopEvents) el.addEventListener(evt, onStop);
      cleanups.push(() => {
        el.removeEventListener("playing", onPlaying);
        for (const evt of stopEvents) el.removeEventListener(evt, onStop);
      });
    }

    return () => {
      cleanups.forEach((fn) => fn());
      player.stopPulse();
      for (const el of [analyserEl, fallbackEl]) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      player.ctx?.close();
      playerRef.current = null;
    };
  }, []);

  // Volume goes through a gain node on the analyser path (after the
  // analyser, so the cones still react at low volume) and through the
  // element's own volume on the plain path. The analyser element itself
  // stays at full volume so the two never stack. Declared after the player
  // effect above so it also applies on mount, once the players exist.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    player.volume = volume;
    if (player.gain) player.gain.gain.value = volume;
    player.fallbackEl.volume = volume;
  }, [volume]);

  function setupAnalyser(player) {
    if (player.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    player.ctx = new AC();
    const source = player.ctx.createMediaElementSource(player.analyserEl);
    player.analyser = player.ctx.createAnalyser();
    player.analyser.fftSize = 256;
    player.analyser.smoothingTimeConstant = 0.55;
    player.gain = player.ctx.createGain();
    player.gain.gain.value = player.volume;
    source.connect(player.analyser);
    player.analyser.connect(player.gain);
    player.gain.connect(player.ctx.destination);
    player.levels = new Uint8Array(player.analyser.frequencyBinCount);
  }

  function playOn(player, station, el) {
    // Stop the other audio element so two stations never overlap.
    for (const other of [player.analyserEl, player.fallbackEl]) {
      if (other !== el && other.src) {
        other.pause();
        other.removeAttribute("src");
        other.load();
      }
    }
    player.activeEl = el;
    // Setting src fresh always jumps back to the live broadcast.
    el.src = station.src;

    el.play()
      .then(() => {
        if (player.current === station) setStatus("live");
      })
      .catch((err) => {
        if (player.current !== station || err?.name === "AbortError") return;

        // Station won't share its audio levels: play it normally instead.
        if (el === player.analyserEl && err?.name !== "NotAllowedError") {
          player.analyserBlocked.add(station.src);
          playOn(player, station, player.fallbackEl);
          return;
        }
        console.warn("Radio playback failed:", station.name, err);
        setStatus(err?.name === "NotAllowedError" ? "blocked" : "unavailable");
        setActive(null);
      });
  }

  function handleStation(station) {
    const player = playerRef.current;
    if (!player) return;

    // Tapping the playing station pauses it.
    if (player.current === station && player.activeEl && !player.activeEl.paused) {
      player.activeEl.pause();
      setStatus("paused");
      setActive(null);
      return;
    }

    setupAnalyser(player);
    if (player.ctx?.state === "suspended") player.ctx.resume();

    player.current = station;
    setCurrent(station);
    setActive(station.id);
    setStatus("tuning");

    const canReact = player.ctx && !player.analyserBlocked.has(station.src);
    playOn(player, station, canReact ? player.analyserEl : player.fallbackEl);
  }

  // Off: stop and drop the stream entirely (not just pause, so nothing keeps
  // downloading). On: back to the last station, or the first one.
  function handlePower() {
    const player = playerRef.current;
    if (!player) return;

    if (active) {
      for (const el of [player.analyserEl, player.fallbackEl]) {
        if (!el.src) continue;
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      setActive(null);
      setStatus("off");
      return;
    }
    handleStation(current ?? STATIONS[0]);
  }

  let nowPlaying;
  if (status === "live" && current) {
    nowPlaying = (
      <>
        live:{" "}
        <a href={current.link} target="_blank" rel="noopener noreferrer">
          {current.name}
        </a>
      </>
    );
  } else if (status === "tuning") nowPlaying = "tuning in...";
  else if (status === "paused") nowPlaying = "paused";
  else if (status === "blocked") nowPlaying = "blocked, tap again";
  else if (status === "unavailable") nowPlaying = `${current?.name} unavailable`;
  else if (status === "off") nowPlaying = "radio off";
  else nowPlaying = "pick a station";

  return (
    <div className="boombox-wrap">
      <div
        className={["boombox", playing && "playing", reactive && "reactive"]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Stations can take a while to tune in: the logo flashes above the
           boombox until the stream actually starts. */}
        {status === "tuning" && (
          <LoadingLogo className="boombox-tuning-logo" label="Tuning in" />
        )}
        <svg className="boombox-body" viewBox="0 0 640 400" aria-hidden="true">
          <defs>
            {/* Wobbly lines plus waxy speckled coverage = crayon */}
            <filter id="boombox-crayon" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="4" result="warp" />
              <feDisplacementMap in="SourceGraphic" in2="warp" scale="5" xChannelSelector="R" yChannelSelector="G" result="wobble" />
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="grain" />
              <feColorMatrix
                in="grain"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.5"
                result="grainMask"
              />
              <feComposite in="wobble" in2="grainMask" operator="in" />
            </filter>
            <pattern id="boombox-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="#b8332a" strokeWidth="3" />
            </pattern>
            <pattern id="boombox-hatch-blue" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#1f4f9e" strokeWidth="2.5" />
            </pattern>
          </defs>

          <g filter="url(#boombox-crayon)">
            {/* Handle */}
            <path
              d="M188 80 L204 30 Q209 16 224 16 L416 16 Q431 16 436 30 L452 80"
              fill="none"
              stroke="#2b2b2b"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Antenna */}
            <line x1="545" y1="78" x2="608" y2="12" stroke="#2b2b2b" strokeWidth="5" strokeLinecap="round" />
            <circle cx="608" cy="12" r="7" fill="#2b2b2b" />

            {/* Cassette keys */}
            <rect x="70" y="58" width="34" height="24" rx="4" fill="#ffd23f" stroke="#2b2b2b" strokeWidth="4" />
            <rect x="112" y="58" width="34" height="24" rx="4" fill="#2e9e52" stroke="#2b2b2b" strokeWidth="4" />
            <rect x="154" y="58" width="34" height="24" rx="4" fill="#8a4fd8" stroke="#2b2b2b" strokeWidth="4" />

            {/* Feet */}
            <rect x="70" y="376" width="56" height="18" rx="6" fill="#2b2b2b" />
            <rect x="514" y="376" width="56" height="18" rx="6" fill="#2b2b2b" />

            {/* Body */}
            <rect x="20" y="76" width="600" height="308" rx="34" fill="#ef5a4c" stroke="#2b2b2b" strokeWidth="6" />
            <rect x="26" y="82" width="588" height="296" rx="30" fill="url(#boombox-hatch)" opacity="0.35" />

            {/* Speakers */}
            {[130, 510].map((centerX, i) => (
              <g key={centerX}>
                <circle cx={centerX} cy="238" r="98" fill="#2f6fd6" stroke="#2b2b2b" strokeWidth="6" />
                <circle cx={centerX} cy="238" r="94" fill="url(#boombox-hatch-blue)" opacity="0.4" />
                <g
                  className={`boombox-cone ${i === 0 ? "left" : "right"}`}
                  ref={(el) => {
                    conesRef.current[i] = el;
                  }}
                >
                  <circle cx={centerX} cy="238" r="68" fill="#ffd23f" stroke="#2b2b2b" strokeWidth="5" />
                  <circle cx={centerX} cy="238" r="47" fill="none" stroke="#e0a800" strokeWidth="4" strokeDasharray="14 8" />
                  <circle cx={centerX} cy="238" r="22" fill="#2b2b2b" />
                </g>
              </g>
            ))}

            {/* Tuner window */}
            <rect x="242" y="100" width="156" height="76" rx="10" fill="#fff4c9" stroke="#2b2b2b" strokeWidth="5" />
          </g>
        </svg>

        <div className="boombox-display">
          <div className="boombox-dial">
            <span>RRR</span>
            <span>SYN</span>
            <span>FDR</span>
          </div>
          <div className="boombox-needle" style={current ? { left: current.pos } : undefined} />
          <p className="boombox-now-playing" aria-live="polite">
            {nowPlaying}
          </p>
        </div>

        <div className="boombox-stations">
          {STATIONS.map((station) => (
            <button
              type="button"
              key={station.id}
              className={`boombox-station${active === station.id ? " active" : ""}`}
              style={{ "--c": station.color }}
              onClick={() => handleStation(station)}
              aria-pressed={active === station.id}
            >
              {station.label}
            </button>
          ))}
        </div>

        <span className="boombox-note n1" aria-hidden="true">
          ♪
        </span>
        <span className="boombox-note n2" aria-hidden="true">
          ♫
        </span>
        <span className="boombox-note n3" aria-hidden="true">
          ♪
        </span>
      </div>

      {/* Power and volume, under the radio rather than drawn onto it: the
         boombox scales with the screen, and at phone width anything on its
         body would be too small to hit reliably. */}
      <div className="boombox-controls">
        <button
          type="button"
          className={`boombox-power${active ? " on" : ""}`}
          onClick={handlePower}
          aria-pressed={!!active}
        >
          <span className="boombox-power-icon" aria-hidden="true">
            ⏻
          </span>
          {active ? "On" : "Off"}
        </button>

        <label className="boombox-volume">
          <span className="boombox-volume-icon" aria-hidden="true">
            {volume === 0 ? "🔇" : volume < 0.5 ? "🔈" : "🔊"}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
            style={{ "--fill": `${volume * 100}%` }}
          />
        </label>
      </div>

      {/* A little about whichever station the needle is on. */}
      {current && (
        <section className="boombox-about" style={{ "--c": current.color }}>
          <h2 className="boombox-about-title">
            <a href={current.link} target="_blank" rel="noopener noreferrer">
              {current.name}
            </a>
          </h2>
          <p>{current.about}</p>
        </section>
      )}
    </div>
  );
}
