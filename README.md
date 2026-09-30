# LUMAROZ VISION

A standalone browser-based LUMAROZ visual experience inspired by the category demonstrated in the supplied reference videos.

## V0.2

- Live webcam preview
- MediaPipe face landmark tracking
- MediaPipe hand tracking
- Face-locked visual effects
- Seven original visual presets
- Effect intensity control
- Gesture mode
- Pinch gesture intensity interaction
- Live FPS and engine telemetry
- Snapshot export
- Client-side WebM recording
- Fullscreen camera stage
- No backend, accounts, database, or REN dependency

## Gestures

- PINCH: changes effect intensity while gesture mode is enabled.
- OPEN PALM: detected and shown in the vision HUD.
- CLAW: detected and shown as an interaction state.

The gesture layer is intentionally modular so additional gesture mappings can be added without changing the rendering pipeline.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL and allow camera access.

## Architecture

```
Webcam
  ↓
MediaPipe Face + Hand Landmarkers
  ↓
VisionFrame
  ↓
LUMAROZ Interaction Layer
  ↓
Original Effect Renderer
  ↓
Live camera + transparent VFX layer
  ↓
Snapshot / WebM export
```

All vision processing happens locally in the browser. The implementation does not use REN, a backend, accounts, or a database.
