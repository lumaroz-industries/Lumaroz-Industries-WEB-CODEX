import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult
} from "@mediapipe/tasks-vision";
import type { FaceFrame, Point } from "../types";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });
  }

  detect(video: HTMLVideoElement): FaceFrame | null {
    if (!this.landmarker || video.readyState < 2 || video.currentTime === this.lastVideoTime) {
      return null;
    }

    this.lastVideoTime = video.currentTime;
    const result: FaceLandmarkerResult = this.landmarker.detectForVideo(video, performance.now());
    const landmarks = result.faceLandmarks?.[0];

    if (!landmarks || landmarks.length < 20) return null;

    const points: Point[] = landmarks.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z
    }));

    const left = points[234];
    const right = points[454];
    const top = points[10];
    const bottom = points[152];
    const nose = points[1] ?? points[4];

    const width = Math.abs(right.x - left.x);
    const height = Math.abs(bottom.y - top.y);
    const center = { x: nose.x, y: nose.y };
    const rotation = Math.atan2(right.y - left.y, right.x - left.x);

    return {
      landmarks: points,
      center,
      scale: Math.max(width, height),
      rotation,
      width,
      height,
      timestamp: performance.now()
    };
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
  }
}