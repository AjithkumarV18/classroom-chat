import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ClassroomChat from "../ClassroomChat";
import { getAuthUser } from "../auth/auth";
import { whiteboardApi } from "../services/api";
import "./DigitalClassroom.css";

const STORAGE_KEY = "ai-education-whiteboard-elements";
const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 600;

const tools = [
  { id: "pen", label: "Pen" },
  { id: "eraser", label: "Eraser" },
  { id: "rectangle", label: "Rectangle" },
  { id: "circle", label: "Circle" },
  { id: "arrow", label: "Arrow" },
  { id: "text", label: "Text Box" },
  { id: "sticky", label: "Sticky Note" },
];

const colors = ["#17202a", "#2364d2", "#00a896", "#c73d4a", "#d98c00"];
const stickyColors = ["#fff3a3", "#c8f7dc", "#dbeafe", "#ffe0d6"];

function DigitalClassroom() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId") || "SESSION";
  const authUser = getAuthUser();
  const boardRef = useRef(null);
  const [activeTool, setActiveTool] = useState("pen");
  const [strokeColor, setStrokeColor] = useState("#2364d2");
  const [stickyColor, setStickyColor] = useState("#fff3a3");
  const [textValue, setTextValue] = useState("New text");
  const [elements, setElements] = useState(() => loadSavedElements());
  const [draft, setDraft] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}-${sessionId}`, JSON.stringify(elements));
  }, [elements, sessionId]);

  useEffect(() => {
    loadBoardFromServer();
  }, [sessionId]);

  const getBoardPoint = (event) => {
    const rect = boardRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT,
    };
  };

  const handlePointerDown = (event) => {
    if (!boardRef.current) return;

    const point = getBoardPoint(event);

    if (activeTool === "text") {
      addTextBox(point);
      return;
    }

    if (activeTool === "sticky") {
      addStickyNote(point);
      return;
    }

    if (activeTool === "eraser") {
      eraseAtPoint(point);
      setIsDrawing(true);
      return;
    }

    const nextDraft = {
      id: crypto.randomUUID(),
      type: activeTool,
      color: strokeColor,
      points: [point],
      start: point,
      end: point,
    };

    setDraft(nextDraft);
    setIsDrawing(true);
  };

  const handlePointerMove = (event) => {
    if (!isDrawing || !boardRef.current) return;

    const point = getBoardPoint(event);

    if (activeTool === "eraser") {
      eraseAtPoint(point);
      return;
    }

    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;

      if (currentDraft.type === "pen") {
        return {
          ...currentDraft,
          points: [...currentDraft.points, point],
          end: point,
        };
      }

      return {
        ...currentDraft,
        end: point,
      };
    });
  };

  const finishDrawing = () => {
    if (draft) {
      setElements((currentElements) => [...currentElements, draft]);
    }

    setDraft(null);
    setIsDrawing(false);
  };

  const addTextBox = (point) => {
    setElements((currentElements) => [
      ...currentElements,
      {
        id: crypto.randomUUID(),
        type: "text",
        x: point.x,
        y: point.y,
        text: textValue.trim() || "Text box",
        color: strokeColor,
      },
    ]);
  };

  const addStickyNote = (point) => {
    setElements((currentElements) => [
      ...currentElements,
      {
        id: crypto.randomUUID(),
        type: "sticky",
        x: point.x,
        y: point.y,
        text: "Sticky note",
        color: stickyColor,
      },
    ]);
  };

  const updateElementText = (id, text) => {
    setElements((currentElements) =>
      currentElements.map((element) =>
        element.id === id ? { ...element, text } : element
      )
    );
  };

  const eraseAtPoint = (point) => {
    setElements((currentElements) =>
      currentElements.filter((element) => !isPointNearElement(point, element))
    );
  };

  const clearBoard = () => {
    setElements([]);
    setDraft(null);
    localStorage.removeItem(`${STORAGE_KEY}-${sessionId}`);
  };


  const mapElementToPayload = (element) => ({
    session_id: sessionId,
    user_id: authUser?.id || "",
    drawing_data: element,
    tool_type: mapElementToolType(element.type),
    color: element.color || null,
    stroke_width: element.type === "pen" || element.type === "arrow" ? 5 : 4,
  });

  const saveBoardToServer = async () => {
    if (!authUser?.id) {
      setSyncStatus("Please login again before saving the whiteboard.");
      return;
    }

    try {
      setIsSaving(true);
      setSyncStatus("");
      await whiteboardApi.updateSession(sessionId, {
        user_id: authUser.id,
        drawings: elements.map(mapElementToPayload),
      });
      setSyncStatus("Whiteboard saved successfully.");
    } catch (error) {
      setSyncStatus(error.message || "Unable to save whiteboard.");
    } finally {
      setIsSaving(false);
    }
  };

  const loadBoardFromServer = async () => {
    try {
      setSyncStatus("");
      const response = await whiteboardApi.getBySession(sessionId);
      const serverElements = response.drawings.map((entry) => entry.drawing_data);
      if (serverElements.length > 0) {
        setElements(serverElements);
      }
    } catch (error) {
      setSyncStatus(error.message || "Unable to load saved whiteboard.");
    }
  };

  const clearBoardOnServer = async () => {
    try {
      setSyncStatus("");
      await whiteboardApi.clearSession(sessionId);
      clearBoard();
      setSyncStatus("Whiteboard cleared successfully.");
    } catch (error) {
      setSyncStatus(error.message || "Only trainers or admins can clear the server whiteboard.");
    }
  };
  const visibleElements = draft ? [...elements, draft] : elements;

  return (
    <main className="digital-classroom-page">
      <section className="classroom-workspace" aria-label="Whiteboard area">
        <div className="whiteboard-card">
          <div className="whiteboard-header">
            <div>
              <p>Digital Classroom</p>
              <h1>Whiteboard Development Sandbox</h1>
            </div>
            <div className="whiteboard-actions">
              <button className="whiteboard-save" disabled={isSaving} type="button" onClick={saveBoardToServer}>
                {isSaving ? "Saving..." : "Save Board"}
              </button>
              <button className="whiteboard-clear" type="button" onClick={loadBoardFromServer}>
                Reload Board
              </button>
              <button className="whiteboard-clear" type="button" onClick={clearBoardOnServer}>
                Clear Board
              </button>
            </div>
          </div>

          {syncStatus ? <p className="whiteboard-sync-status">{syncStatus}</p> : null}

          <div className="whiteboard-toolbar" aria-label="Whiteboard tools">
            <div className="tool-group">
              {tools.map((tool) => (
                <button
                  className={activeTool === tool.id ? "is-active" : ""}
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  type="button"
                >
                  {tool.label}
                </button>
              ))}
            </div>

            <div className="tool-group tool-group--compact" aria-label="Pen colors">
              {colors.map((color) => (
                <button
                  aria-label={`Use color ${color}`}
                  className={strokeColor === color ? "color-swatch is-active" : "color-swatch"}
                  key={color}
                  onClick={() => setStrokeColor(color)}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>

            <div className="tool-group tool-group--compact" aria-label="Sticky note colors">
              {stickyColors.map((color) => (
                <button
                  aria-label={`Use sticky note color ${color}`}
                  className={stickyColor === color ? "sticky-swatch is-active" : "sticky-swatch"}
                  key={color}
                  onClick={() => setStickyColor(color)}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>

            <label className="text-tool-input" htmlFor="whiteboard-text">
              <span>Text</span>
              <input
                id="whiteboard-text"
                onChange={(event) => setTextValue(event.target.value)}
                type="text"
                value={textValue}
              />
            </label>
          </div>

          <div
            className={`whiteboard-canvas whiteboard-canvas--${activeTool}`}
            onPointerDown={handlePointerDown}
            onPointerLeave={finishDrawing}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrawing}
            ref={boardRef}
            role="application"
            style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
          >
            <svg
              className="whiteboard-svg"
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto"
                  refX="7"
                  refY="4"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
                </marker>
              </defs>
              {visibleElements.map((element) => renderSvgElement(element))}
            </svg>

            {visibleElements
              .filter((element) => element.type === "text" || element.type === "sticky")
              .map((element) => (
                <textarea
                  className={element.type === "sticky" ? "whiteboard-sticky" : "whiteboard-textbox"}
                  key={element.id}
                  onChange={(event) => updateElementText(element.id, event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    left: `${(element.x / BOARD_WIDTH) * 100}%`,
                    top: `${(element.y / BOARD_HEIGHT) * 100}%`,
                    color: element.type === "text" ? element.color : "#17202a",
                    backgroundColor: element.type === "sticky" ? element.color : "#ffffff",
                  }}
                  value={element.text}
                />
              ))}
          </div>
        </div>
      </section>

      <aside className="classroom-sidebar" aria-label="Classroom chat sidebar">
        <ClassroomChat sessionId={sessionId} />
      </aside>
    </main>
  );
}

function mapElementToolType(type) {
  if (type === "pen") return "Pen";
  if (type === "eraser") return "Eraser";
  if (type === "text") return "Text";
  if (type === "sticky") return "Sticky";
  return "Shape";
}

function loadSavedElements() {
  try {
    const savedElements = localStorage.getItem(STORAGE_KEY);
    return savedElements ? JSON.parse(savedElements) : [];
  } catch {
    return [];
  }
}

function renderSvgElement(element) {
  if (element.type === "pen") {
    return (
      <polyline
        fill="none"
        key={element.id}
        points={element.points.map((point) => `${point.x},${point.y}`).join(" ")}
        stroke={element.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    );
  }

  if (element.type === "rectangle") {
    const box = getShapeBox(element);
    return (
      <rect
        fill="transparent"
        height={box.height}
        key={element.id}
        rx="8"
        stroke={element.color}
        strokeWidth="4"
        width={box.width}
        x={box.x}
        y={box.y}
      />
    );
  }

  if (element.type === "circle") {
    const box = getShapeBox(element);
    return (
      <ellipse
        cx={box.x + box.width / 2}
        cy={box.y + box.height / 2}
        fill="transparent"
        key={element.id}
        rx={box.width / 2}
        ry={box.height / 2}
        stroke={element.color}
        strokeWidth="4"
      />
    );
  }

  if (element.type === "arrow") {
    return (
      <line
        key={element.id}
        markerEnd="url(#arrowhead)"
        stroke={element.color}
        strokeLinecap="round"
        strokeWidth="5"
        x1={element.start.x}
        x2={element.end.x}
        y1={element.start.y}
        y2={element.end.y}
      />
    );
  }

  return null;
}

function getShapeBox(element) {
  const x = Math.min(element.start.x, element.end.x);
  const y = Math.min(element.start.y, element.end.y);
  const width = Math.abs(element.end.x - element.start.x);
  const height = Math.abs(element.end.y - element.start.y);

  return { x, y, width, height };
}

function isPointNearElement(point, element) {
  if (element.type === "pen") {
    return element.points.some((penPoint) => distance(point, penPoint) < 18);
  }

  if (element.type === "rectangle" || element.type === "circle" || element.type === "arrow") {
    const box = getShapeBox(element);
    return (
      point.x >= box.x - 18 &&
      point.x <= box.x + box.width + 18 &&
      point.y >= box.y - 18 &&
      point.y <= box.y + box.height + 18
    );
  }

  if (element.type === "text") {
    return point.x >= element.x && point.x <= element.x + 180 && point.y >= element.y && point.y <= element.y + 70;
  }

  if (element.type === "sticky") {
    return point.x >= element.x && point.x <= element.x + 170 && point.y >= element.y && point.y <= element.y + 145;
  }

  return false;
}

function distance(firstPoint, secondPoint) {
  return Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
}

export default DigitalClassroom;

