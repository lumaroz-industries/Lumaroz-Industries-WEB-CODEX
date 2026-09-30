import { useEffect, useRef, useState } from "react";
import {
  Activity, ChevronLeft, ChevronRight, Clock3, ExternalLink, Globe2, GripVertical,
  Lock, Maximize2, Minimize2, RefreshCw, RotateCcw, Search, Sparkles, Unlock, X
} from "lucide-react";
import type { MutableRefObject, RefObject, PointerEvent as ReactPointerEvent } from "react";
import type { WidgetFrame, WidgetKind } from "../types";

type HandControl = { point: { x: number; y: number } | null; pinch: boolean };

type Props = {
  frameRef: RefObject<HTMLDivElement | null>;
  handControlRef: MutableRefObject<HandControl>;
  fps: number;
  tracking: boolean;
  handTracking: boolean;
  activeEffect: string;
  intensity: number;
};

const DEFAULT_WIDGETS: WidgetFrame[] = [
  { id: "vision", kind: "vision", title: "VISION CORE", x: 3, y: 5, width: 220, height: 122, rotation: 0, locked: false, z: 10, minimized: false },
  { id: "system", kind: "system", title: "SYSTEM", x: 68, y: 7, width: 235, height: 156, rotation: 0, locked: false, z: 9, minimized: false },
  { id: "clock", kind: "clock", title: "TIME", x: 4, y: 70, width: 210, height: 126, rotation: 0, locked: false, z: 8, minimized: false },
  { id: "browser", kind: "browser", title: "CHROME // WEB", x: 47, y: 42, width: 430, height: 280, rotation: 0, locked: false, z: 7, minimized: false }
];

function WidgetIcon({ kind }: { kind: WidgetKind }) {
  if (kind === "browser") return <Globe2 size={13} />;
  if (kind === "system") return <Activity size={13} />;
  if (kind === "clock") return <Clock3 size={13} />;
  return <Sparkles size={13} />;
}

function BrowserWidget() {
  const [url, setUrl] = useState("https://www.google.com/search?igu=1&q=LUMAROZ");
  const [src, setSrc] = useState(url);

  const navigate = () => {
    let next = url.trim();
    if (!next) return;
    if (!/^https?:\\/\\//i.test(next)) {
      next = "https://www.google.com/search?igu=1&q=" + encodeURIComponent(next);
    }
    setSrc(next);
  };

  return (
    <div className="widget-browser">
      <div className="browser-toolbar">
        <button title="Back" onClick={() => window.history.back()}><ChevronLeft size={13} /></button>
        <button title="Forward" onClick={() => window.history.forward()}><ChevronRight size={13} /></button>
        <button title="Reload" onClick={() => setSrc(src)}><RefreshCw size={12} /></button>
        <form onSubmit={(event) => { event.preventDefault(); navigate(); }}>
          <Search size={11} />
          <input value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Web address" />
        </form>
        <button title="Open in Chrome" onClick={() => window.open(src, "_blank", "noopener,noreferrer")}><ExternalLink size={12} /></button>
      </div>
      <div className="browser-viewport">
        <iframe title="LUMAROZ Web" src={src} sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts" referrerPolicy="no-referrer" />
        <div className="browser-note">Some sites block embedded views. Use ↗ to open the page in Chrome.</div>
      </div>
    </div>
  );
}

function ClockBody() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="clock-body">
      <strong>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong>
      <span>{now.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</span>
    </div>
  );
}

export function WidgetLayer({ frameRef, handControlRef, fps, tracking, handTracking, activeEffect, intensity }: Props) {
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const widgetsRef = useRef(widgets);
  const pinchRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{
    id: string; mode: "move" | "resize" | "rotate";
    startX: number; startY: number; startLeft: number; startTop: number;
    startW: number; startH: number; startRotation: number;
  } | null>(null);

  useEffect(() => { widgetsRef.current = widgets; }, [widgets]);

  const updateWidget = (id: string, patch: Partial<WidgetFrame>) => {
    setWidgets((current) => current.map((w) => w.id === id ? { ...w, ...patch } : w));
  };

  const bringFront = (id: string) => {
    const max = Math.max(...widgetsRef.current.map((w) => w.z), 0);
    updateWidget(id, { z: max + 1 });
  };

  const beginPointer = (event: ReactPointerEvent, widget: WidgetFrame, mode: "move" | "resize" | "rotate") => {
    if (widget.locked) return;
    event.preventDefault();
    event.stopPropagation();
    bringFront(widget.id);
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    dragRef.current = {
      id: widget.id, mode, startX: event.clientX, startY: event.clientY,
      startLeft: widget.x / 100 * rect.width, startTop: widget.y / 100 * rect.height,
      startW: widget.width, startH: widget.height, startRotation: widget.rotation
    };

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const patch: Partial<WidgetFrame> = {};
      if (d.mode === "move") {
        patch.x = Math.max(0, Math.min(92, (d.startLeft + dx) / rect.width * 100));
        patch.y = Math.max(0, Math.min(92, (d.startTop + dy) / rect.height * 100));
      } else if (d.mode === "resize") {
        patch.width = Math.max(160, Math.min(rect.width * 0.82, d.startW + dx));
        patch.height = Math.max(90, Math.min(rect.height * 0.82, d.startH + dy));
      } else {
        patch.rotation = d.startRotation + Math.atan2(dy, dx) * 35;
      }
      setWidgets((current) => current.map((w) => w.id === d.id ? { ...w, ...patch } : w));
    };

    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handPointInFrame = () => {
    const frame = frameRef.current;
    const video = frame ? frame.querySelector("video") : null;
    const hand = handControlRef.current;
    if (!frame || !video || !hand.point) return null;
    const rect = frame.getBoundingClientRect();
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const videoAspect = vw / vh;
    const frameAspect = rect.width / rect.height;
    let renderedW = rect.width;
    let renderedH = rect.width / videoAspect;
    let offsetX = 0;
    let offsetY = (rect.height - renderedH) / 2;
    if (renderedH > rect.height) {
      renderedH = rect.height;
      renderedW = rect.height * videoAspect;
      offsetX = (rect.width - renderedW) / 2;
      offsetY = 0;
    }
    return {
      x: offsetX + hand.point.x * renderedW,
      y: offsetY + hand.point.y * renderedH,
      frameRect: rect
    };
  };

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const hand = handControlRef.current;
      const p = handPointInFrame();
      if (p && hand.pinch) {
        if (!pinchRef.current) {
          const candidates = Array.from(frameRef.current?.querySelectorAll<HTMLElement>(".holo-widget") || [])
            .map((element) => ({ element, rect: element.getBoundingClientRect(), z: Number(element.dataset.z || 0) }))
            .filter(({ element, rect }) => {
              const widget = widgetsRef.current.find((w) => w.id === element.dataset.widgetId);
              return widget && !widget.locked && p.x + p.frameRect.left >= rect.left && p.x + p.frameRect.left <= rect.right && p.y + p.frameRect.top >= rect.top && p.y + p.frameRect.top <= rect.bottom;
            })
            .sort((a, b) => b.z - a.z);

          const hit = candidates[0];
          if (hit) {
            const id = hit.element.dataset.widgetId || "";
            bringFront(id);
            pinchRef.current = { id, x: p.x, y: p.y };
          }
        } else {
          const active = pinchRef.current;
          const dx = p.x - active.x;
          const dy = p.y - active.y;
          if (Math.abs(dx) + Math.abs(dy) > 0.5) {
            const widget = widgetsRef.current.find((w) => w.id === active.id);
            if (widget) {
              updateWidget(active.id, {
                x: Math.max(0, Math.min(92, widget.x + dx / p.frameRect.width * 100)),
                y: Math.max(0, Math.min(92, widget.y + dy / p.frameRect.height * 100))
              });
            }
          }
          pinchRef.current = { id: active.id, x: p.x, y: p.y };
        }
      } else {
        pinchRef.current = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="widget-layer">
      {widgets.map((widget) => (
        <div key={widget.id} className={"holo-widget " + (widget.minimized ? "minimized " : "") + (widget.locked ? "locked" : "")}
          data-widget-id={widget.id} data-z={widget.z}
          style={{ left: widget.x + "%", top: widget.y + "%", width: widget.width + "px", height: widget.minimized ? "36px" : widget.height + "px", zIndex: widget.z, transform: "rotate(" + widget.rotation + "deg)" }}>
          <div className="widget-header" onPointerDown={(event) => beginPointer(event, widget, "move")}>
            <div className="widget-title"><WidgetIcon kind={widget.kind} /><span>{widget.title}</span></div>
            <div className="widget-actions">
              <button title={widget.locked ? "Unlock" : "Lock"} onPointerDown={(event) => event.stopPropagation()} onClick={() => updateWidget(widget.id, { locked: !widget.locked })}>{widget.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
              <button title={widget.minimized ? "Maximize" : "Minimize"} onPointerDown={(event) => event.stopPropagation()} onClick={() => updateWidget(widget.id, { minimized: !widget.minimized })}>{widget.minimized ? <Maximize2 size={11} /> : <Minimize2 size={11} />}</button>
              <button title="Close" onPointerDown={(event) => event.stopPropagation()} onClick={() => setWidgets((current) => current.filter((w) => w.id !== widget.id))}><X size={11} /></button>
            </div>
          </div>
          {!widget.minimized && (
            <>
              <div className="widget-content">
                {widget.kind === "browser" ? <BrowserWidget /> :
                 widget.kind === "clock" ? <ClockBody /> :
                 widget.kind === "system" ? (
                  <div className="widget-body system-body">
                    <div><span>VISION FPS</span><b>{fps || "—"}</b></div>
                    <div><span>CPU THREADS</span><b>{navigator.hardwareConcurrency || "—"}</b></div>
                    <div><span>MEMORY</span><b>{(navigator as Navigator & { deviceMemory?: number }).deviceMemory ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory + " GB" : "N/A"}</b></div>
                    <div><span>PIPELINE</span><b>LOCAL</b></div>
                    <div className="system-meter"><i style={{ width: Math.min(96, Math.max(8, fps ? 100 - Math.max(0, fps - 60) : 18)) + "%" }} /></div>
                  </div>
                ) : (
                  <div className="widget-body vision-body">
                    <div className="vision-orb"><span /></div>
                    <div className="vision-copy">
                      <div><span>FACE</span><b>{tracking ? "LOCKED" : "SEARCHING"}</b></div>
                      <div><span>HAND</span><b>{handTracking ? "ACTIVE" : "STANDBY"}</b></div>
                      <div><span>EFFECT</span><b>{activeEffect}</b></div>
                      <div><span>POWER</span><b>{Math.round(intensity * 100)}%</b></div>
                    </div>
                  </div>
                )}
              </div>
              {!widget.locked && <button className="widget-resize" title="Resize" onPointerDown={(event) => beginPointer(event, widget, "resize")}><GripVertical size={12} /></button>}
              {!widget.locked && <button className="widget-rotate" title="Rotate" onPointerDown={(event) => beginPointer(event, widget, "rotate")}><RotateCcw size={11} /></button>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
