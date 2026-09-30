# LUMAROZ VISION

Real-time browser face tracking and visual effects — built independently for LUMAROZ.

## V0.1 scope

- Webcam capture in the browser
- MediaPipe Face Landmarker tracking
- Face-locked visual effects
- Five modular visual presets
- Live tracking status + FPS
- Client-side WebM recording with microphone/camera audio
- No backend, accounts, or REN dependency

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL, allow camera/microphone access, and activate the camera.

## Architecture

```
Webcam
  ↓
MediaPipe Face Landmarker
  ↓
FaceFrame (normalized landmarks + pose)
  ↓
LUMAROZ Effect Renderer
  ↓
Camera canvas + VFX canvas
  ↓
Live preview / WebM recording
```

The effect engine is intentionally modular. Add a new EffectId and renderer without changing the camera/tracking pipeline.

## Notes

The reference material informed the category and interaction goals. The implementation, UI, rendering code, and effect presets are original LUMAROZ work.
