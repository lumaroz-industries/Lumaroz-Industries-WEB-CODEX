import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, Download, Gauge, Play, RotateCcw, Sparkles, Video, X } from "lucide-react";
import { FaceTracker } from "./vision/faceTracker";
import { renderEffect } from "./effects/effectRenderer";
import type { EffectPreset, EffectId } from "./types";

const EFFECTS: EffectPreset[] = [
  { id: "orbit", name: "ORBIT", short: "01", description: "Rotating spatial rings locked to your face." },
  { id: "grid", name: "MATRIX", short: "02", description: "Geometric tracking field around the head." },
  { id: "halo", name: "HALO", short: "03", description: "Layered orbital arcs that follow head rotation." },
  { id: "scan", name: "SCAN", short: "04", description: "Technical scan frame anchored to facial movement." },
  { id: "prism", name: "PRISM", short: "05", description: "A rotating polygonal frame built from tracking data." }
];

const DEFAULT_EFFECT: EffectId = "orbit";

function getCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return "Camera or microphone permission was denied. Click the camera icon in the address bar, allow access, then try again.";
      case "NotFoundError":
        return "No camera was found. Connect a webcam and try again.";
      case "NotReadableError":
        return "The camera is already being used by another app. Close apps such as Camera, Teams, Discord, OBS, or another browser tab and try again.";
      case "OverconstrainedError":
        return "The requested camera mode is unavailable. Retrying with a basic camera configuration may fix this.";
      case "SecurityError":
        return "The browser blocked camera access for security reasons. Run the app from localhost or HTTPS.";
      case "AbortError":
        return "The camera startup was interrupted. Try activating it again.";
    }
    return `${error.name}: ${error.message || "Camera access failed."}`;
  }

  if (error instanceof Error) return error.message;
  return "Unable to start the camera. Check browser permissions and your connected webcam.";
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

  const [activeEffect, setActiveEffect] = useState<EffectId>(DEFAULT_EFFECT);
  const [cameraOn, setCameraOn] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState("");

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const base = baseCanvasRef.current;
    const fx = fxCanvasRef.current;
    const tracker = trackerRef.current;
    if (!video || !base || !fx || !tracker) return;

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

    const frame = tracker.detect(video);
    if (frame) {
      if (!lastTrackingRef.current) {
        lastTrackingRef.current = true;
        setTracking(true);
      }

      const mirrored = {
        ...frame,
        center: { x: 1 - frame.center.x, y: frame.center.y },
        landmarks: frame.landmarks.map((p) => ({ ...p, x: 1 - p.x }))
      };
      renderEffect(activeEffect, mirrored, fxCtx, fx, performance.now());
    } else {
      if (lastTrackingRef.current) {
        lastTrackingRef.current = false;
        setTracking(false);
      }
      fxCtx.clearRect(0, 0, fx.width, fx.height);
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
  }, [activeEffect]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    recorderRef.current?.stop();
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    trackerRef.current?.close();
    trackerRef.current = null;

    lastFrameTimeRef.current = 0;
    fpsAccumulatorRef.current = 0;
    fpsFrameCountRef.current = 0;
    lastTrackingRef.current = false;
    setFps(0);
    setCameraOn(false);
    setTracking(false);
    setRecording(false);
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
        throw new Error("This browser does not expose camera access. Use a current Chrome, Edge, or Firefox browser.");
      }

      let stream: MediaStream;
      try {
        // Request camera + microphone first so recording can include audio.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: true
        });
      } catch (mediaError) {
        // A microphone permission/device failure should not prevent the visual experience.
        if (mediaError instanceof DOMException &&
            ["NotAllowedError", "NotFoundError", "NotReadableError"].includes(mediaError.name)) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: false
          });
        } else {
          throw mediaError;
        }
      }

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
          const onReady = () => {
            window.clearTimeout(timeout);
            video.removeEventListener("loadeddata", onReady);
            resolve();
          };
          video.addEventListener("loadeddata", onReady, { once: true });
        });
      }

      const tracker = new FaceTracker();
      await tracker.init();
      trackerRef.current = tracker;

      setCameraOn(true);
    } catch (err) {
      const message = getCameraError(err);
      setError(message);
      stopCamera();
    } finally {
      setLoading(false);
    }
  }, [cameraOn, loading, stopCamera]);

  useEffect(() => {
    if (cameraOn && trackerRef.current) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraOn, drawFrame]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setRecordingTime(Math.floor((Date.now() - startedAtRef.current) / 1000)),
      250
    );
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const record = () => {
    const base = baseCanvasRef.current;
    const fx = fxCanvasRef.current;
    if (!base || !fx || !streamRef.current) return;

    const composite = document.createElement("canvas");
    composite.width = base.width;
    composite.height = base.height;
    const ctx = composite.getContext("2d");
    if (!ctx) return;

    const paint = () => {
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(fx, 0, 0);
      if (recorderRef.current) requestAnimationFrame(paint);
    };

    const canvasStream = composite.captureStream(30);
    streamRef.current.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
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
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const active = EFFECTS.find((effect) => effect.id === activeEffect)!;

  return (
    <main className="app-shell">
      <div className="grain" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Sparkles size={15} /></span>
          <span>LUMAROZ</span>
          <b>VISION</b>
        </div>
        <div className="status-line">
          <span className={cameraOn ? "status-dot live" : "status-dot"} />
          {cameraOn ? (tracking ? "FACE TRACKING" : "SEARCHING") : "SYSTEM STANDBY"}
          <span className="status-separator" />
          <span>{fps || "—"} FPS</span>
        </div>
      </header>

      <section className="workspace">
        <div className="stage">
          <div className="stage-grid" />
          <div className="camera-frame">
            <video ref={videoRef} playsInline muted className="source-video" />
            <canvas ref={baseCanvasRef} className="render-layer" />
            <canvas ref={fxCanvasRef} className="render-layer effects-layer" />

            {!cameraOn && (
              <div className="standby">
                <div className="standby-core"><Camera size={32} strokeWidth={1.2} /></div>
                <div className="eyebrow">LUMAROZ / VISION ENGINE</div>
                <h1>FACE. TRACK. <em>CREATE.</em></h1>
                <p>Real-time visual effects driven by your movement.</p>
                <button className="primary-btn" onClick={startCamera} disabled={loading}>
                  {loading ? "INITIALIZING..." : <><Play size={15} fill="currentColor" /> ACTIVATE CAMERA</>}
                </button>
                {error && <div className="error">{error}</div>}
              </div>
            )}

            {cameraOn && (
              <>
                <div className="corner-label tl">CAM // 01</div>
                <div className="corner-label tr">LIVE / {active.name}</div>
                <div className="corner-label bl">{tracking ? "TRACK LOCKED" : "SEARCHING FACE"}</div>
                <div className="corner-label br">{Math.round(videoRef.current?.videoWidth || 1280)} × {Math.round(videoRef.current?.videoHeight || 720)}</div>
              </>
            )}
          </div>

          <div className="stage-footer">
            <div>
              <span className="micro">ACTIVE EFFECT</span>
              <strong>{active.name}</strong>
              <span className="desc">{active.description}</span>
            </div>
            <div className="stage-actions">
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
            <div>
              <span className="micro">EFFECT LIBRARY</span>
              <h2>Visual presets</h2>
            </div>
            <Gauge size={17} />
          </div>

          <div className="effect-list">
            {EFFECTS.map((effect) => (
              <button
                key={effect.id}
                className={`effect-card ${activeEffect === effect.id ? "selected" : ""}`}
                onClick={() => setActiveEffect(effect.id)}
              >
                <span className="effect-number">{effect.short}</span>
                <span className="effect-copy">
                  <strong>{effect.name}</strong>
                  <small>{effect.description}</small>
                </span>
                <span className="effect-arrow">↗</span>
              </button>
            ))}
          </div>

          <div className="panel-info">
            <div className="micro">ENGINE STATUS</div>
            <div className="metric"><span>FACE TRACKER</span><b>{cameraOn ? "ONLINE" : "OFFLINE"}</b></div>
            <div className="metric"><span>GPU DELEGATE</span><b>{cameraOn ? "READY" : "STANDBY"}</b></div>
            <div className="metric"><span>PROCESSING</span><b>LOCAL</b></div>
          </div>

          <button className="reset-btn" onClick={() => setActiveEffect(DEFAULT_EFFECT)}><RotateCcw size={14} /> RESET EFFECT</button>
        </aside>
      </section>

      <footer className="footer">
        <span>LUMAROZ INDUSTRIES PVT. LTD.</span>
        <span>VISION ENGINE / V0.1</span>
        <span><Download size={12} /> BROWSER-BASED / CLIENT-SIDE</span>
      </footer>
    </main>
  );
}
