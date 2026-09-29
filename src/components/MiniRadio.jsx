import MiniBoomboxArt from "./MiniBoomboxArt";
import "./MiniRadio.css";

/**
 * A pocket-sized boombox that sits in the sky while the radio is on and its
 * popup is closed. It bobs along while the stream is actually playing and
 * reopens the full Boombox when tapped.
 *
 * @param {{label: string, name: string, color: string}} station  what's on
 * @param {boolean} playing  true while audio is actually coming out
 * @param {() => void} onOpen
 */
export default function MiniRadio({ station, playing, onOpen, className = "" }) {
  return (
    <button
      type="button"
      className={["mini-radio", playing && "playing", className].filter(Boolean).join(" ")}
      onClick={onOpen}
      aria-label={`Radio: ${station.name}${playing ? "" : " (tuning in)"}. Open the radio`}
    >
      <MiniBoomboxArt className="mini-radio-art" accent={station.color} />

      <span className="mini-radio-label" style={{ "--c": station.color }}>
        {station.label}
      </span>

      <span className="mini-radio-note" aria-hidden="true">
        ♪
      </span>
    </button>
  );
}
