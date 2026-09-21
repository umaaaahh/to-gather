import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DrawingCanvas from "../components/DrawingCanvas";
import { ZONE_CONFIG, resolveZone } from "../lib/zones";
import { saveDrawing } from "../lib/drawingsStore";

// zoneId is "tree" | "stem" | "free" (also accepts "flower" as an alias),
// pulled from the route.
export default function DrawZone() {
  const { zoneId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  const key = resolveZone(zoneId);
  const zone = ZONE_CONFIG[key];

  async function handleDone(pngBlob) {
    // Nothing drawn -> save nothing, just go back to the clean scene.
    if (!pngBlob) {
      navigate("/");
      return;
    }
    try {
      // saveDrawing() itself emits the "submitted" signal (see
      // subscribeToSubmissions/getLastSubmission in drawingsStore.js) once
      // the write actually lands — that's the hook point for future
      // consumers (entry animation, kangaroo reaction), not this handler.
      await saveDrawing(key, pngBlob);
      navigate("/");
    } catch (err) {
      console.error("Failed to save drawing:", err);
      setError("Couldn't save your drawing — check your connection and try again.");
    }
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", paddingTop: "0.5rem" }}>
      {error && (
        <p role="alert" style={{ color: "#b00020", textAlign: "center", margin: "0 1rem 0.5rem" }}>
          {error}
        </p>
      )}
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
