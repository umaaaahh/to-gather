import { useCallback, useState } from "react";
import Boombox from "./Boombox";
import MiniRadio from "./MiniRadio";
import "./RadioLayer.css";

/**
 * The radio as an app-wide layer over every page: the full Boombox popup,
 * plus the mini radio widget up in the sky opposite the sun while a station
 * is on and the popup is closed.
 *
 * Lives in App, not a page, so the music (which lives in Boombox) carries on
 * across routes. The popup is only hidden when closed, never unmounted, for
 * the same reason.
 *
 * @param {boolean} open        popup showing
 * @param {() => void} onOpen   e.g. the mini radio or the street's 🎵 window
 * @param {() => void} onClose
 */
export default function RadioLayer({ open, onOpen, onClose }) {
  // Stable callback: Boombox reports from an effect that depends on it.
  const [radio, setRadio] = useState(null); // { station, playing } | null
  const handleNowPlaying = useCallback(
    (station, playing) => setRadio(station ? { station, playing } : null),
    [],
  );

  return (
    <div className="radio-layer">
      {radio && !open && (
        <MiniRadio
          className="radio-layer-mini"
          station={radio.station}
          playing={radio.playing}
          onOpen={onOpen}
        />
      )}

      <div className="radio-modal-backdrop" hidden={!open} onClick={onClose}>
        <div
          className="radio-modal"
          role="dialog"
          aria-label="Radio"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="radio-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
          <Boombox onNowPlaying={handleNowPlaying} />
        </div>
      </div>
    </div>
  );
}
