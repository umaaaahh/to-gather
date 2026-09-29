import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import DrawingCanvas from "../components/DrawingCanvas";
import { ZONE_CONFIG, resolveZone } from "../lib/zones";
import { saveDrawingInBackground } from "../lib/drawingsStore";
import "./DrawZone.css";

// zoneId is "tree" | "stem" | "free" (also accepts "flower" as an alias),
// pulled from the route. Rendered as a child route of the street (see
// App.jsx), so this is an overlay floating over the blurred scene.
export default function DrawZone() {
  const { zoneId } = useParams();
  const navigate = useNavigate();
  // From StreetScene's useOutlet — resets the street to its clean view.
  const { onSubmitted } = useOutletContext() ?? {};

  const key = resolveZone(zoneId);
  const zone = ZONE_CONFIG[key];

  function handleDone(pngBlob) {
    // Something drawn -> save it in the background and go straight back to
    // the scene rather than waiting on the uploads; the drawing appears there
    // once it lands, and a failed save shows up there as a toast (see
    // subscribeToSaveErrors in drawingsStore.js). saveDrawing() still emits
    // the "submitted" signal (subscribeToSubmissions/getLastSubmission) once
    // the write actually lands — that's the hook point for future consumers
    // (entry animation, kangaroo reaction), not this handler.
    // A real submission also takes the street back to its starting view and
    // plays the drawing's entrance: it starts from the paper's box on screen
    // (the drawn size and spot) with a local copy of the export.
    if (pngBlob) {
      saveDrawingInBackground(key, pngBlob);
      const paper = document.querySelector(".draw-overlay .dc-stage")?.getBoundingClientRect();
      onSubmitted?.(
        paper && {
          zone: key,
          imageUrl: URL.createObjectURL(pngBlob),
          fromRect: { left: paper.left, top: paper.top, width: paper.width, height: paper.height },
        },
      );
    }
    navigate("/");
  }

  return (
    <div className="draw-overlay" role="dialog" aria-modal="true" aria-label={zone.label}>
      <h2 className="draw-overlay-title">{zone.label}</h2>
      <DrawingCanvas
        zone={key}
        palette={zone.palette}
        backgroundTemplate={zone.backgroundTemplate}
        exportSize={zone.exportSize}
        onDone={handleDone}
        onCancel={() => navigate("/")}
      />
    </div>
  );
}
