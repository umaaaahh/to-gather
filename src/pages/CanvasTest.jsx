import { useState } from "react";
import { Link } from "react-router-dom";
import DrawingCanvas from "../components/DrawingCanvas";
import { ZONE_CONFIG } from "../lib/zones";

// Standalone harness for Phase 1 — no Firebase. Pick a zone, draw, hit Done,
// and the exported PNG blob is logged and previewed below.
export default function CanvasTest() {
  const [zoneKey, setZoneKey] = useState("tree");
  const [result, setResult] = useState(null); // { url, size, bytes }

  const zone = ZONE_CONFIG[zoneKey];

  function handleDone(blob) {
    console.log("[CanvasTest] onDone PNG blob:", blob);
    if (!blob) return; // nothing was drawn
    if (result?.url) URL.revokeObjectURL(result.url);
    setResult({
      url: URL.createObjectURL(blob),
      bytes: blob.size,
      size: zone.exportSize,
    });
  }

  return (
    <div
      style={{
        padding: "1rem",
        color: "#f5f5f7",
        height: "100%",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          maxWidth: 480,
          margin: "0 auto 0.75rem",
        }}
      >
        <Link to="/" style={{ color: "#0a84ff" }}>
          ← street
        </Link>
        <select
          value={zoneKey}
          onChange={(e) => setZoneKey(e.target.value)}
          style={{ marginLeft: "auto", padding: "0.4rem", borderRadius: 8 }}
        >
          {Object.keys(ZONE_CONFIG).map((k) => (
            <option key={k} value={k}>
              {k} — {ZONE_CONFIG[k].label}
            </option>
          ))}
        </select>
      </div>

      <DrawingCanvas
        key={zoneKey}
        zone={zoneKey}
        palette={zone.palette}
        backgroundTemplate={zone.backgroundTemplate}
        exportSize={zone.exportSize}
        onDone={handleDone}
      />

      {result && (
        <div style={{ maxWidth: 480, margin: "1rem auto 0", textAlign: "center" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
            Exported {result.size}×{result.size} PNG — {(result.bytes / 1024).toFixed(1)} KB
          </p>
          <img
            src={result.url}
            alt="exported result"
            style={{
              width: result.size,
              maxWidth: "100%",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              background:
                "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 20px 20px",
            }}
          />
          <div>
            <a href={result.url} download="drawing.png" style={{ color: "#0a84ff" }}>
              download png
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
