import { useParams, useNavigate } from "react-router-dom";
import DrawingCanvas from "../components/DrawingCanvas";
import { ZONE_CONFIG, resolveZone } from "../lib/zones";
import { saveDrawing, blobToDataUrl } from "../lib/drawingsStore";

// zoneId is "tree" | "stem" | "free" (also accepts "flower" as an alias),
// pulled from the route.
//
// Phase 2 will upload pngBlob to Firebase Storage + write a Firestore doc.
// For now we stash it locally so it shows on the street straight away.
export default function DrawZone() {
  const { zoneId } = useParams();
  const navigate = useNavigate();

  const key = resolveZone(zoneId);
  const zone = ZONE_CONFIG[key];

  async function handleDone(pngBlob) {
    // Nothing drawn -> save nothing, just go back to the clean scene.
    if (pngBlob) {
      // TODO(phase 2): const url = await uploadToStorage(pngBlob); addFirestoreDoc(...)
      const dataUrl = await blobToDataUrl(pngBlob);
      saveDrawing(key, dataUrl);
    }
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
