import React, { useEffect, useRef, useState } from "react";
import { getAuthUser } from "../../auth/auth";
import { whiteboardApi } from "../../services/api";

const COLORS = ["#2563eb", "#111827", "#dc2626", "#16a34a"];

function MiniWhiteboard({ sessionId, live }) {
  const canvasRef = useRef(null);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [status, setStatus] = useState("Loading whiteboard...");
  const authUser = getAuthUser();
  const canControl = ["Teacher", "Admin"].includes(authUser?.role);
  const canDraw = canControl || live.you?.permissions?.can_chat;

  useEffect(() => {
    let isMounted = true;
    async function loadWhiteboard() {
      try {
        setStatus("Loading whiteboard...");
        const response = await whiteboardApi.getBySession(sessionId);
        if (!isMounted) return;
        historyRef.current = response.drawings.map((drawing) => normalizeStoredStroke(drawing)).filter(Boolean);
        redoRef.current = [];
        redraw();
        setStatus(historyRef.current.length ? "Whiteboard restored" : "Whiteboard ready");
      } catch (error) {
        if (isMounted) setStatus(error.message || "Unable to load whiteboard.");
      }
    }
    loadWhiteboard();
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const latest = live.whiteboardEvents[live.whiteboardEvents.length - 1];
    if (!latest) return;
    if (latest.type === "WHITEBOARD_DRAW" && latest.payload?.stroke) {
      historyRef.current = [...historyRef.current, latest.payload.stroke];
      redoRef.current = [];
      redraw();
      setStatus("Whiteboard synced");
    }
    if (latest.type === "WHITEBOARD_CLEAR") {
      historyRef.current = [];
      redoRef.current = [];
      redraw();
      setStatus("Whiteboard cleared");
    }
    if (latest.type === "WHITEBOARD_STATE_SYNC") {
      historyRef.current = (latest.payload?.drawings || []).map(normalizeStoredStroke).filter(Boolean);
      redoRef.current = [];
      redraw();
      setStatus("Whiteboard restored");
    }
  }, [live.whiteboardEvents]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current.forEach((stroke) => drawStroke(context, stroke));
  };

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvas.width,
      y: ((source.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event) => {
    if (!canDraw) return;
    event.preventDefault();
    activeStrokeRef.current = {
      tool,
      color,
      strokeWidth,
      points: [getPoint(event)],
    };
  };

  const continueDrawing = (event) => {
    if (!activeStrokeRef.current) return;
    event.preventDefault();
    activeStrokeRef.current.points.push(getPoint(event));
    redraw();
    drawStroke(canvasRef.current.getContext("2d"), activeStrokeRef.current);
  };

  const stopDrawing = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    if (stroke.points.length < 2) return;
    historyRef.current = [...historyRef.current, stroke];
    redoRef.current = [];
    live.sendWhiteboardStroke(stroke);
    redraw();
  };

  const undo = () => {
    if (!canControl || historyRef.current.length === 0) return;
    const next = [...historyRef.current];
    const removed = next.pop();
    redoRef.current = [removed, ...redoRef.current];
    historyRef.current = next;
    live.send("WHITEBOARD_UNDO", { removed });
    redraw();
  };

  const redo = () => {
    if (!canControl || redoRef.current.length === 0) return;
    const [restored, ...remaining] = redoRef.current;
    redoRef.current = remaining;
    historyRef.current = [...historyRef.current, restored];
    live.send("WHITEBOARD_REDO", { restored });
    redraw();
  };

  const clearBoard = () => {
    if (!canControl) return;
    historyRef.current = [];
    redoRef.current = [];
    live.clearWhiteboard();
    redraw();
  };

  return (
    <section className="mini-whiteboard" aria-label="Mini whiteboard">
      <div className="mini-whiteboard__toolbar">
        <button className={tool === "pen" ? "active" : ""} disabled={!canDraw} onClick={() => setTool("pen")} type="button">Pen</button>
        <button className={tool === "eraser" ? "active" : ""} disabled={!canDraw} onClick={() => setTool("eraser")} type="button">Eraser</button>
        <select disabled={!canDraw} onChange={(event) => setStrokeWidth(Number(event.target.value))} value={strokeWidth}>
          {[2, 4, 8, 12].map((size) => <option key={size} value={size}>{size}px</option>)}
        </select>
      </div>
      <div className="mini-whiteboard__colors">
        {COLORS.map((item) => (
          <button
            aria-label={`Use ${item}`}
            className={color === item ? "active" : ""}
            disabled={!canDraw}
            key={item}
            onClick={() => setColor(item)}
            style={{ background: item }}
            type="button"
          />
        ))}
      </div>
      <canvas
        height="420"
        onMouseDown={startDrawing}
        onMouseLeave={stopDrawing}
        onMouseMove={continueDrawing}
        onMouseUp={stopDrawing}
        onTouchCancel={stopDrawing}
        onTouchEnd={stopDrawing}
        onTouchMove={continueDrawing}
        onTouchStart={startDrawing}
        ref={canvasRef}
        width="620"
      />
      <div className="mini-whiteboard__actions">
        <span>{canDraw ? `Tool: ${tool}` : "View only"}</span>
        <button disabled={!canControl} onClick={undo} type="button">Undo</button>
        <button disabled={!canControl} onClick={redo} type="button">Redo</button>
        <button disabled={!canControl} onClick={clearBoard} type="button">Clear</button>
      </div>
      <p>{status}</p>
    </section>
  );
}

function drawStroke(context, stroke) {
  const points = stroke.points || [];
  if (points.length < 2) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.strokeWidth || 4;
  context.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color || "#2563eb";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
  context.restore();
}

function normalizeStoredStroke(drawing) {
  const data = drawing.drawing_data || drawing;
  if (!data || !Array.isArray(data.points)) return null;
  return {
    tool: data.tool || (drawing.tool_type === "Eraser" ? "eraser" : "pen"),
    color: data.color || drawing.color || "#2563eb",
    strokeWidth: data.strokeWidth || drawing.stroke_width || 4,
    points: data.points,
  };
}

export default MiniWhiteboard;
