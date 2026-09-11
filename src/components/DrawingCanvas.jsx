import { useCallback, useEffect, useRef, useState } from "react";
import { ASSETS } from "../lib/assets";
import "./DrawingCanvas.css";

// Internal raster resolution (square). The canvas is displayed scaled to fit
// the phone width; all drawing + flood-fill happens at this fixed resolution
// so behaviour is identical regardless of device size. Export is downscaled
// from here to the zone's exportSize.
const RES = 768;

const BRUSH_SIZES = [
  { key: "s", label: "S", width: 10 },
  { key: "m", label: "M", width: 24 },
  { key: "l", label: "L", width: 48 },
];

const UNDO_LIMIT = 6;

/**
 * Standalone drawing surface for a zone. Works with zero Firebase wiring —
 * calls onDone(pngBlob) with a flattened PNG at the zone's export resolution.
 *
 * @param {"tree"|"flower"|"free"|string} zone     zone id (for labelling/behaviour hooks)
 * @param {string[]} palette                        fixed list of hex colours shown as swatches
 * @param {string|null} backgroundTemplate          url of a template image shown live as a guide to
 *                                                   draw/fill against, and also baked into the export
 *                                                   at the same scale/position (object-fit: contain,
 *                                                   centred — see handleDone), never cropped
 * @param {number} [exportSize=400]                 the exported PNG is always exportSize x exportSize
 *                                                   — the full square drawing area, matching the live
 *                                                   paper box exactly, so nothing drawn is ever clipped
 * @param {(pngBlob: Blob) => void} onDone          called when the user taps Done
 * @param {() => void} [onCancel]                   optional — renders a Back control
 */
export default function DrawingCanvas({
  zone = "free",
  palette = ["#000000"],
  backgroundTemplate = null,
  exportSize = 400,
  onDone,
  onCancel,
}) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef(null);
  const undoStackRef = useRef([]);
  const bgImgRef = useRef(null);
  const dirtyRef = useRef(false); // has anything actually been drawn?

  const [tool, setTool] = useState("brush"); // "brush" | "eraser" | "fill"
  const [color, setColor] = useState(palette[0] ?? "#000000");
  const [brushKey, setBrushKey] = useState("m");
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  // Keep the selected colour valid if the palette prop changes (zone swap).
  useEffect(() => {
    if (!palette.includes(color)) setColor(palette[0] ?? "#000000");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

  // One-time canvas setup.
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = RES;
    canvas.height = RES;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, []);

  // Preload the background template so it's ready for export compositing.
  useEffect(() => {
    if (!backgroundTemplate) {
      bgImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = backgroundTemplate;
    img.onload = () => {
      bgImgRef.current = img;
    };
    img.onerror = () => {
      bgImgRef.current = null;
    };
  }, [backgroundTemplate]);

  // ---- history -----------------------------------------------------------
  const pushUndo = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, RES, RES);
    const stack = undoStackRef.current;
    stack.push(snap);
    if (stack.length > UNDO_LIMIT) stack.shift();
    setCanUndo(stack.length > 0);
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    const ctx = ctxRef.current;
    if (!stack.length || !ctx) return;
    const snap = stack.pop();
    ctx.putImageData(snap, 0, 0);
    dirtyRef.current = true;
    setCanUndo(stack.length > 0);
  }, []);

  const clearAll = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, RES, RES);
    dirtyRef.current = false;
  }, [pushUndo]);

  // ---- pointer -> canvas coords -----------------------------------------
  const toCanvasPt = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = RES / rect.width;
    const scaleY = RES / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const strokeSettings = useCallback(() => {
    const ctx = ctxRef.current;
    const width = BRUSH_SIZES.find((b) => b.key === brushKey).width;
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = width * 1.6; // eraser reads a touch bigger than the brush
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
    }
  }, [tool, color, brushKey]);

  const handleDown = useCallback(
    (e) => {
      e.preventDefault();
      const ctx = ctxRef.current;
      const pt = toCanvasPt(e);
      canvasRef.current.setPointerCapture?.(e.pointerId);

      if (tool === "fill") {
        pushUndo();
        dirtyRef.current = true;
        setBusy(true);
        // let the busy state paint before the (blocking) fill
        requestAnimationFrame(() => {
          floodFill(ctx, RES, Math.round(pt.x), Math.round(pt.y), color);
          setBusy(false);
        });
        return;
      }

      pushUndo();
      dirtyRef.current = true;
      drawingRef.current = true;
      lastPtRef.current = pt;
      strokeSettings();
      // a dot, so a tap leaves a mark
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    },
    [tool, color, toCanvasPt, pushUndo, strokeSettings],
  );

  const handleMove = useCallback(
    (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const ctx = ctxRef.current;
      const pt = toCanvasPt(e);
      const last = lastPtRef.current;
      // getCoalescedEvents gives smoother lines on fast strokes
      const pts = e.getCoalescedEvents?.().map(toCanvasPt) ?? [pt];
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastPtRef.current = pts[pts.length - 1] ?? pt;
    },
    [toCanvasPt],
  );

  const handleUp = useCallback((e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPtRef.current = null;
    const ctx = ctxRef.current;
    ctx.globalCompositeOperation = "source-over";
    canvasRef.current.releasePointerCapture?.(e.pointerId);
  }, []);

  // ---- export -----------------------------------------------------------
  const handleDone = useCallback(() => {
    if (busy) return;
    // Untouched canvas -> don't bother exporting or storing anything.
    if (!dirtyRef.current) {
      onDone?.(null);
      return;
    }
    setBusy(true);

    // The export frame is always the same square as the live paper box —
    // that's the actual drawable area (nothing drawn on it should ever be
    // clipped), so the strokes canvas is copied in at 1:1, full frame, no
    // scaling or offset. The template guide is drawn with the same
    // object-fit: contain math the live <img class="dc-bg"> uses (scaled to
    // fit within the square, centred, no cropping), so the export always
    // matches what was shown while drawing.
    const bg = bgImgRef.current;
    const out = document.createElement("canvas");
    out.width = exportSize;
    out.height = exportSize;
    const octx = out.getContext("2d");

    if (bg?.naturalWidth && bg?.naturalHeight) {
      const scale = Math.min(exportSize / bg.naturalWidth, exportSize / bg.naturalHeight);
      const w = bg.naturalWidth * scale;
      const h = bg.naturalHeight * scale;
      octx.drawImage(bg, (exportSize - w) / 2, (exportSize - h) / 2, w, h);
    }

    octx.drawImage(canvasRef.current, 0, 0, exportSize, exportSize);

    out.toBlob(
      (blob) => {
        setBusy(false);
        onDone?.(blob);
      },
      "image/png",
    );
  }, [busy, exportSize, onDone]);

  return (
    <div className="dc-root" data-zone={zone}>
      <div className="dc-stage">
        <img
          className="dc-surface"
          src={ASSETS.canvasSurface}
          alt=""
          draggable={false}
        />
        {/* Shown live as a guide to draw/fill against, and baked into the
           flattened export too (see handleDone) so it's also part of the
           finished artwork that lands on the street. */}
        {backgroundTemplate && (
          <img className="dc-bg" src={backgroundTemplate} alt="" draggable={false} />
        )}
        <canvas
          ref={canvasRef}
          className="dc-canvas"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={handleUp}
        />
        {busy && <div className="dc-busy" aria-hidden="true" />}
      </div>

      <div className="dc-toolbar">
        <div className="dc-tools" role="group" aria-label="Tools">
          <button
            type="button"
            className={cx("dc-tool", tool === "brush" && "dc-tool--active")}
            onClick={() => setTool("brush")}
            aria-pressed={tool === "brush"}
          >
            ✏️ Brush
          </button>
          <button
            type="button"
            className={cx("dc-tool", tool === "eraser" && "dc-tool--active")}
            onClick={() => setTool("eraser")}
            aria-pressed={tool === "eraser"}
          >
            🧽 Eraser
          </button>
          <button
            type="button"
            className={cx("dc-tool", tool === "fill" && "dc-tool--active")}
            onClick={() => setTool("fill")}
            aria-pressed={tool === "fill"}
          >
            🪣 Fill
          </button>
        </div>

        <div className="dc-sizes" role="group" aria-label="Brush size">
          {BRUSH_SIZES.map((b) => (
            <button
              type="button"
              key={b.key}
              className={cx("dc-size", brushKey === b.key && "dc-size--active")}
              onClick={() => setBrushKey(b.key)}
              aria-pressed={brushKey === b.key}
            >
              <span
                className="dc-size-dot"
                style={{ width: b.width / 2, height: b.width / 2 }}
              />
              {b.label}
            </button>
          ))}
        </div>

        <div className="dc-palette" role="group" aria-label="Colours">
          {palette.map((hex) => (
            <button
              type="button"
              key={hex}
              className={cx("dc-swatch", color === hex && "dc-swatch--active")}
              style={{ background: hex }}
              onClick={() => {
                setColor(hex);
                if (tool === "eraser") setTool("brush");
              }}
              aria-label={`Colour ${hex}`}
              aria-pressed={color === hex}
            />
          ))}
        </div>

        <div className="dc-actions">
          {onCancel && (
            <button type="button" className="dc-btn" onClick={onCancel}>
              Back
            </button>
          )}
          <button
            type="button"
            className="dc-btn"
            onClick={undo}
            disabled={!canUndo || busy}
          >
            Undo
          </button>
          <button type="button" className="dc-btn" onClick={clearAll} disabled={busy}>
            Clear
          </button>
          <button
            type="button"
            className="dc-btn dc-btn--primary"
            onClick={handleDone}
            disabled={busy}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

// ---- flood fill --------------------------------------------------------
// Scanline flood fill over the canvas' raw pixels. Treats transparent
// (un-painted) pixels as fillable and stops at any painted edge, within a
// small colour tolerance so anti-aliased brush edges act as walls.
function floodFill(ctx, res, sx, sy, hex) {
  if (sx < 0 || sy < 0 || sx >= res || sy >= res) return;
  const image = ctx.getImageData(0, 0, res, res);
  const data = image.data;
  const visited = new Uint8Array(res * res);

  const startIdx = (sy * res + sx) * 4;
  const target = [
    data[startIdx],
    data[startIdx + 1],
    data[startIdx + 2],
    data[startIdx + 3],
  ];
  const fill = hexToRgba(hex);
  const tol = 40;

  if (within(target, fill, 4)) return; // already this colour

  const matches = (x, y) => {
    const p = y * res + x;
    if (visited[p]) return false;
    const q = p * 4;
    return (
      Math.abs(data[q] - target[0]) <= tol &&
      Math.abs(data[q + 1] - target[1]) <= tol &&
      Math.abs(data[q + 2] - target[2]) <= tol &&
      Math.abs(data[q + 3] - target[3]) <= tol
    );
  };
  const paint = (x, y) => {
    const p = y * res + x;
    const q = p * 4;
    data[q] = fill[0];
    data[q + 1] = fill[1];
    data[q + 2] = fill[2];
    data[q + 3] = fill[3];
    visited[p] = 1;
  };

  const stack = [[sx, sy]];
  while (stack.length) {
    const [cx0, cy] = stack.pop();
    let y1 = cy;
    while (y1 >= 0 && matches(cx0, y1)) y1--;
    y1++;
    let spanLeft = false;
    let spanRight = false;
    while (y1 < res && matches(cx0, y1)) {
      paint(cx0, y1);
      if (cx0 > 0) {
        if (matches(cx0 - 1, y1)) {
          if (!spanLeft) {
            stack.push([cx0 - 1, y1]);
            spanLeft = true;
          }
        } else {
          spanLeft = false;
        }
      }
      if (cx0 < res - 1) {
        if (matches(cx0 + 1, y1)) {
          if (!spanRight) {
            stack.push([cx0 + 1, y1]);
            spanRight = true;
          }
        } else {
          spanRight = false;
        }
      }
      y1++;
    }
  }

  ctx.putImageData(image, 0, 0);
}

function within(a, b, tol) {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol &&
    Math.abs(a[3] - b[3]) <= tol
  );
}

function hexToRgba(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const int = parseInt(h, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255, 255];
}
