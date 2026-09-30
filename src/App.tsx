import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, CircleStop, Download, Expand, Gauge, Hand, Play, RotateCcw,
  Settings2, Sparkles, Video, X, Zap
} from "lucide-react";
import { FaceTracker } from "./vision/faceTracker";
import { renderEffect } from "./effects/effectRenderer";
import type { EffectId, EffectPreset, VisionFrame } from "./types";

const EFFECTS: EffectPreset[] = [
  { id: "orbit", name: "ORBIT", short: "01", description: "Rotating spatial rings locked to your face." },
  { id: "grid", name: "MATRIX", short: "02", description: "Geometric tracking field around the head." },
  { id: "halo", name: "HALO", short: "03", description: "Layered orbital arcs that follow head rotation." },
  { id: "scan", name: "SCAN", short: "04", description: "Technical scan frame anchored to facial movement." },
  { id: "prism", name: "PRISM", short: "05", description: "Rotating polygonal geometry around the head." },
  { id: "constellation", name: "CONSTELLATION", short: "06", description: "Landmark constellation mapped across your face." },
  { id: "neural", name: "NEURAL", short: "07", description: "Animated neural-style network driven by landmarks." }
];

const DEFAULT_EFFECT: EffectId = "orbit";

function getCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    const messages: Record<string, string> = {
      NotAllowedError: "Camera access was denied. Check Chrome's camera permission and Windows Camera privacy settings.",
      NotFoundError: "Chrome cannot find a camera. Check that a webcam is connected.",
      NotReadableError: "The camera is busy. Close Camera, OBS, Discord, Zoom, Teams, or another browser tab using it.",
      OverconstrainedError: "The camera rejected the requested settings.",
      SecurityError: "The browser blocked camera access. Use localhost or HTTPS.",
      AbortError: "Camera startup was interrupted. Try again."
    };
    return messages[error.name] ?? `Camera error [${error.name}]: ${error.message || "Unknown browser error."}`;
  }
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const fpsAccumulatorRef = useRef(0);
  const fpsFrameCountRef = useRef(0);
  const lastTrackingRef = useRef(false);
  const lastGestureRef = useRef("none");
  const pinchCooldownRef = useRef(0);
  const latestVisionRef = useRef<VisionFrame>({ face: null, hands: [] });

  const [activeEffect, setActiveEffect] = useState<EffectId>(DEFAULT_EFFECT);
  const [cameraOn, setCameraOn] = useState(false);
  const [trackerReady, setTrackerReady] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [handTracking, setHandTracking] = useState(false);
  const [gesture, setGesture] = useState("none");
  const [gestureMode, setGestureMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [fps, setFps] = useState(0);
  const [intensity, setIntensity] = useState(0.72);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const cycleEffect = useCallback((direction: number) => {
    setActiveEffect((current) => {
      const index = EFFECTS.findIndex((effect) => effect.id === current);
      return EFFECTS[(index + direction + EFFECTS.length) % EFFECTS.length].id;
    });
  }, []);

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const base = baseCanvasRef.current;
    const fx = fxCanvasRef.current;
    const tracker = trackerRef.current;
    if (!video || !base || !fx) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (base.width !== width || base.height !== height) {
      base.width = width;
      base.height = height;
      fx.width = width;
      fx.height = height;
    }

    const baseCtx = base.getContext("2d");
    const fxCtx = fx.getContext("2d");
    if (!baseCtx || !fxCtx) return;

    baseCtx.save();
    baseCtx.translate(width, 0);
    baseCtx.scale(-1, 1);
    baseCtx.drawImage(video, 0, 0, width, height);
    baseCtx.restore();

    const vision = tracker ? tracker.detect(video) : { face: null, hands: [] };
    latestVisionRef.current = vision;

    const face = vision.face;
    if (face) {
      if (!lastTrackingRef.current) {
        lastTrackingRef.current = true;
        setTracking(true);
      }

      const mirrored = {
        ...face,
        center: { x: 1 - face.center.x, y: face.center.y },
        landmarks: face.landmarks.map((p) => ({ ...p, x: 1 - p.x }))
      };
      renderEffect(activeEffect, mirrored, vision.hands, fxCtx, fx, performance.now(), intensity);
    } else {
      if (lastTrackingRef.current) {
        lastTrackingRef.current = false;
        setTracking(false);
      }
      fxCtx.clearRect(0, 0, fx.width, fx.height);
    }

    const currentGesture = vision.hands[0]?.gesture ?? "none";
    if (currentGesture !== lastGestureRef.current) {
      lastGestureRef.current = currentGesture;
      setGesture(currentGesture);
    }
    const hasHands = vision.hands.length > 0;
    if (hasHands !== handTracking) setHandTracking(hasHands);

    if (gestureMode && currentGesture === "pinch" && lastGestureRef.current === "pinch") {
      const hand = vision.hands[0];
      if (hand && performance.now() > pinchCooldownRef.current) {
        pinchCooldownRef.current = performance.now() + 1200;
        setIntensity((value) => Math.min(.98, Math.max(.15, value + (hand.center.y < .5 ? .08 : -.08))));
      }
    }

    const now = performance.now();
    if (lastFrameTimeRef.current > 0) {
      fpsAccumulatorRef.current += now - lastFrameTimeRef.current;
      fpsFrameCountRef.current += 1;
      if (fpsAccumulatorRef.current >= 500) {
        setFps(Math.round((fpsFrameCountRef.current * 1000) / fpsAccumulatorRef.current));
        fpsAccumulatorRef.current = 0;
        fpsFrameCountRef.current = 0;
      }
    }
    lastFrameTimeRef.current = now;
    rafRef.current = requestAnimationFrame(drawFrame);
  }, [activeEffect, gestureMode, handTracking, intensity]);

  const retryVision = useCallback(async () => {
    if (!cameraOn || loading) return;
    setLoading(true);
    try {
      await initializeTracker();
    } finally {
      setLoading(false);
    }
  }, [cameraOn, loading, initializeTracker]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
    trackerRef.current?.close();
    trackerRef.current = null;
    lastFrameTimeRef.current = 0;
    fpsAccumulatorRef.current = 0;
    fpsFrameCountRef.current = 0;
    lastTrackingRef.current = false;
    lastGestureRef.current = "none";
    setFps(0);
    setCameraOn(false);
    setTrackerReady(false);
    setTracking(false);
    setHandTracking(false);
    setGesture("none");
    setRecording(false);
  }, []);

  const initializeTracker = useCallback(async () => {
    trackerRef.current?.close();
    trackerRef.current = null;
    setTrackerReady(false);
    setTracking(false);
    setError("");

    const tracker = new FaceTracker();
    try {
      await Promise.race([
        tracker.init(),
        new Promise<never>((_, reject) =>
          window.setTimeout(
            () => reject(new Error("Vision engine initialization timed out after 45 seconds.")),
            45000
          )
        )
      ]);
      trackerRef.current = tracker;
      setTrackerReady(true);
      return true;
    } catch (trackerError) {
      tracker.close();
      console.error("LUMAROZ VISION: tracker initialization failed", trackerError);
      setError(
        trackerError instanceof Error
          ? trackerError.message
          : String(trackerError)
      );
      return false;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (cameraOn || loading) return;
    setError("");
    setLoading(true);

    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        throw new Error("Camera access requires HTTPS or localhost.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not expose camera access. Use current Chrome, Edge, or Firefox.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera surface is unavailable.");

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      if (video.readyState < 2 || !video.videoWidth) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("Camera opened, but no video frames were received.")), 5000);
          video.addEventListener("loadeddata", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
        });
      }

      setCameraOn(true);
      await initializeTracker();
    } catch (err) {
      setError(getCameraError(err));
      stopCamera();
    } finally {
      setLoading(false);
    }
  }, [cameraOn, loading, stopCamera, initializeTracker]);

  useEffect(() => {
    if (cameraOn) rafRef.current = requestAnimationFrame(drawFrame);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [cameraOn, drawFrame]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingTime(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const record = () => {
    const base = baseCanvasRef.current;
    const fx = fxCanvasRef.current;
    if (!base || !fx || !streamRef.current || !tracking) return;

    const composite = document.createElement("canvas");
    composite.width = base.width;
    composite.height = base.height;
    const ctx = composite.getContext("2d");
    if (!ctx) return;

    const paint = () => {
      ctx.clearRect(0, 0, composite.width, composite.height);
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(fx, 0, 0);
      if (recorderRef.current) requestAnimationFrame(paint);
    };

    const canvasStream = composite.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(canvasStream, { mimeType: mime });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `lumaroz-vision-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    recorderRef.current = recorder;
    recorder.start(200);
    startedAtRef.current = Date.now();
    setRecordingTime(0);
    setRecording(true);
    paint();
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const takeSnapshot = () => {
    const base = baseCanvasRef.current;
    const fx = fxCanvasRef.current;
    if (!base || !fx) return;
    const canvas = document.createElement("canvas");
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(fx, 0, 0);
    const anchor = document.createElement("a");
    anchor.download = `lumaroz-vision-${Date.now()}.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
  };

  const toggleFullscreen = async () => {
    const target = document.querySelector(".camera-frame");
    if (!target) return;
    if (!document.fullscreenElement) {
      await (target as HTMLElement).requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const active = EFFECTS.find((effect) => effect.id === activeEffect)!;
  const gestureLabel = gesture === "pinch" ? "PINCH / INTENSITY" : gesture === "claw" ? "CLAW / READY" : gesture === "open" ? "OPEN PALM" : "IDLE";

  return (
    <main className="app-shell">
      <div className="grain" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Sparkles size={15} /></span><span>LUMAROZ</span><b>VISION</b></div>
        <div className="status-line">
          <span className={cameraOn ? "status-dot live" : "status-dot"} />
          {cameraOn ? (tracking ? "FACE TRACKING" : error ? "VISION ERROR" : "SEARCHING") : "SYSTEM STANDBY"}
          <span className="status-separator" /><span>{fps || "—"} FPS</span>
        </div>
      </header>

      <section className="workspace">
        <div className={`stage ${fullscreen ? "stage-fullscreen" : ""}`}>
          <div className="camera-frame">
            <div className="stage-grid" />
            <video ref={videoRef} playsInline muted className="source-video" />
            <canvas ref={baseCanvasRef} className="render-layer base-layer" />
            <canvas ref={fxCanvasRef} className="render-layer effects-layer" />

            {cameraOn && (
              <>
                <div className="corner-label tl">CAM // 01</div>
                <div className="corner-label tr">LIVE / {active.name}</div>
                <div className="corner-label bl">{tracking ? "TRACK LOCKED" : "SEARCHING FACE"}</div>
                <div className="corner-label br">{Math.round(videoRef.current?.videoWidth || 1280)} × {Math.round(videoRef.current?.videoHeight || 720)}</div>
                <div className="vision-hud">
                  <span>VISION CORE</span>
                  <b>{trackerReady ? "ONLINE" : "LOADING"}</b>
                  <i>{handTracking ? "HAND LINK" : "FACE LINK"}</i>
                  <i>{gestureLabel}</i>
                </div>
                {error && (
                  <div className="live-error">
                    <div>
                      <strong>VISION ENGINE ERROR</strong>
                      <span>{error}</span>
                    </div>
                    <button onClick={retryVision} disabled={loading}>
                      {loading ? "RETRYING..." : "RETRY VISION"}
                    </button>
                  </div>
                )}
              </>
            )}

            {!cameraOn && (
              <div className="standby">
                <div className="standby-core"><Camera size={32} strokeWidth={1.2} /></div>
                <div className="eyebrow">LUMAROZ / VISION ENGINE</div>
                <h1>FACE. TRACK. <em>CREATE.</em></h1>
                <p>Real-time face tracking, hand interaction, visual effects and recording — locally in your browser.</p>
                <button className="primary-btn" onClick={startCamera} disabled={loading}>
                  {loading ? "INITIALIZING..." : <><Play size={15} fill="currentColor" /> ACTIVATE CAMERA</>}
                </button>
                {error && <div className="error">{error}</div>}
              </div>
            )}
          </div>

          <div className="stage-footer">
            <div><span className="micro">ACTIVE EFFECT</span><strong>{active.name}</strong><span className="desc">{active.description}</span></div>
            <div className="stage-actions">
              <button className="icon-btn" title="Snapshot" onClick={takeSnapshot} disabled={!cameraOn}><Camera size={16} /></button>
              <button className="icon-btn" title="Fullscreen" onClick={toggleFullscreen} disabled={!cameraOn}><Expand size={16} /></button>
              {recording ? (
                <button className="record-btn recording" onClick={stopRecording}><CircleStop size={16} /> STOP / SAVE <span>{String(Math.floor(recordingTime / 60)).padStart(2, "0")}:{String(recordingTime % 60).padStart(2, "0")}</span></button>
              ) : (
                <button className="record-btn" onClick={record} disabled={!cameraOn || !tracking}><Video size={16} /> RECORD</button>
              )}
              {cameraOn && <button className="icon-btn" title="Stop camera" onClick={stopCamera}><X size={17} /></button>}
            </div>
          </div>
        </div>

        <aside className="control-panel">
          <div className="panel-heading">
            <div><span className="micro">EFFECT LIBRARY</span><h2>Visual presets</h2></div><Gauge size={17} />
          </div>

          <div className="effect-list">
            {EFFECTS.map((effect) => (
              <button key={effect.id} className={`effect-card ${activeEffect === effect.id ? "selected" : ""}`} onClick={() => setActiveEffect(effect.id)}>
                <span className="effect-number">{effect.short}</span>
                <span className="effect-copy"><strong>{effect.name}</strong><small>{effect.description}</small></span>
                <span className="effect-arrow">↗</span>
              </button>
            ))}
          </div>

          <div className="control-block">
            <div className="control-title"><span><Settings2 size={13} /> EFFECT INTENSITY</span><b>{Math.round(intensity * 100)}%</b></div>
            <input type="range" min="0.15" max="1" step="0.01" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
          </div>

          <button className={`gesture-toggle ${gestureMode ? "on" : ""}`} onClick={() => setGestureMode((value) => !value)}>
            <span><Hand size={14} /> HAND GESTURES</span><b>{gestureMode ? "ON" : "OFF"}</b>
          </button>

          <div className="gesture-help">
            <div><Zap size={12} /> PINCH</div><span>adjust intensity</span>
            <div><Hand size={12} /> OPEN</div><span>gesture detected</span>
            <div>◈ CLAW</div><span>interaction state</span>
          </div>

          <div className="panel-info">
            <div className="micro">ENGINE STATUS</div>
            <div className="metric"><span>FACE TRACKER</span><b>{trackerReady ? "ONLINE" : cameraOn ? "LOADING" : "OFFLINE"}</b></div>
            <div className="metric"><span>HAND TRACKER</span><b>{handTracking ? "ACTIVE" : trackerReady ? "READY" : "STANDBY"}</b></div>
            <div className="metric"><span>GPU / WASM</span><b>{trackerReady ? "READY" : cameraOn ? "INITIALIZING" : "STANDBY"}</b></div>
            <div className="metric"><span>PROCESSING</span><b>LOCAL</b></div>
          </div>

          <button className="reset-btn" onClick={() => { setActiveEffect(DEFAULT_EFFECT); setIntensity(.72); }}><RotateCcw size={14} /> RESET EFFECT</button>
        </aside>
      </section>

      <footer className="footer">
        <span>LUMAROZ INDUSTRIES PVT. LTD.</span>
        <span>VISION ENGINE / V0.2</span>
        <span><Download size={12} /> BROWSER-BASED / CLIENT-SIDE</span>
      </footer>
    </main>
  );
}
