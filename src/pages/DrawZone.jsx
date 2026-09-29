import { useParams, useNavigate } from "react-router-dom";
import DrawingCanvas from "../components/DrawingCanvas";
import { ZONE_CONFIG, resolveZone } from "../lib/zones";
import { saveDrawingInBackground } from "../lib/drawingsStore";

// zoneId is "tree" | "stem" | "free" (also accepts "flower" as an alias),
// pulled from the route.
export default function DrawZone() {
  const { zoneId } = useParams();
  const navigate = useNavigate();

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
    if (pngBlob) saveDrawingInBackground(key, pngBlob);
    navigate("/");
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", paddingTop: "0.5rem" }}>
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
