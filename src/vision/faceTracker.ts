import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult
} from "@mediapipe/tasks-vision";
import type { FaceFrame, HandFrame, Point, VisionFrame } from "../types";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";


async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchModel(url: string, label: string, timeoutMs = 20000): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "force-cache",
      signal: controller.signal,
      mode: "cors"
    });

    if (!response.ok) {
      throw new Error(`${label} download returned HTTP ${response.status} ${response.statusText}.`);
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) {
      throw new Error(`${label} download returned an empty file.`);
    }

    return new Uint8Array(buffer);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${label} download timed out after ${timeoutMs / 1000}s.`);
    }
    if (error instanceof TypeError) {
      throw new Error(`${label} download was blocked by the browser/network. Check access to storage.googleapis.com.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function classifyHand(points: Point[]): HandFrame["gesture"] {
  if (points.length < 21) return "none";

  const palm = distance(points[5], points[17]) || 0.1;
  const pinch = distance(points[4], points[8]) / palm;
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  const extended = tips.filter((tip, i) =>
    distance(points[tip], points[0]) > distance(points[pips[i]], points[0])
  ).length;

  if (pinch < 0.55) return "pinch";
  if (extended >= 4) return "open";
  if (extended <= 1) return "claw";
  return "none";
}

export class FaceTracker {
  private face: FaceLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private lastVideoTime = -1;

  async init() {
    let vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

    try {
      vision = await withTimeout(
        FilesetResolver.forVisionTasks(WASM_URL),
        15000,
        "MediaPipe WASM initialization timed out. Check cdn.jsdelivr.net and reload."
      );
    } catch (error) {
      console.error("LUMAROZ VISION: MediaPipe WASM failed to load.", error);
      throw new Error(
        "MediaPipe WASM could not load. Check that Chrome can reach cdn.jsdelivr.net."
      );
    }

    // FACE IS THE CRITICAL PATH.
    // Fetch the model explicitly so a network problem becomes a visible,
    // actionable error instead of leaving the UI stuck on "LOADING".
    let faceModel: Uint8Array;
    try {
      faceModel = await fetchModel(FACE_MODEL_URL, "Face model");
    } catch (error) {
      console.error("LUMAROZ VISION: face model download failed.", error);
      throw error;
    }

    try {
      this.face = await this.createFaceTracker(vision, faceModel);
    } catch (error) {
      console.error("LUMAROZ VISION: face model failed to initialize.", error);
      throw new Error(
        "MediaPipe face model could not initialize. Check that Chrome can reach storage.googleapis.com."
      );
    }

    // Start hand tracking independently. The camera + face engine can become
    // ONLINE immediately while the larger hand model loads in the background.
    void this.initHands(vision);
  }

  private async createFaceTracker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    model: Uint8Array
  ) {
    try {
      return await withTimeout(FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: model, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      });
    } catch (gpuError) {
      console.warn(
        "LUMAROZ VISION: GPU face tracker unavailable; falling back to CPU.",
        gpuError
      );

      try {
        return await withTimeout(FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: model, delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false
        }), 15000, "CPU face tracker initialization timed out.");
      } catch (cpuError) {
        console.error("LUMAROZ VISION: CPU face tracker failed.", cpuError);
        throw cpuError;
      }
    }
  }

  private async initHands(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
  ) {
    try {
      const handModel = await fetchModel(HAND_MODEL_URL, "Hand model");
      this.hands = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetBuffer: handModel, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      console.info("LUMAROZ VISION: hand tracker online.");
    } catch (gpuError) {
      console.warn("LUMAROZ VISION: GPU hand tracker unavailable; trying CPU.", gpuError);

      try {
        this.hands = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: handModel, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        console.info("LUMAROZ VISION: hand tracker online on CPU.");
      } catch (handError) {
        console.warn(
          "LUMAROZ VISION: optional hand tracker unavailable; face tracking remains online.",
          handError
        );
        this.hands = null;
      }
    }
  }

  detect(video: HTMLVideoElement): VisionFrame {
    if (!this.face || video.readyState < 2 || video.currentTime === this.lastVideoTime) {
      return { face: null, hands: [] };
    }

    this.lastVideoTime = video.currentTime;
    const now = performance.now();

    let faceResult: FaceLandmarkerResult;
    try {
      faceResult = this.face.detectForVideo(video, now);
    } catch (error) {
      console.warn("LUMAROZ VISION: face detection frame skipped.", error);
      return { face: null, hands: [] };
    }
    const landmarks = faceResult.faceLandmarks?.[0];

    let face: FaceFrame | null = null;
    if (landmarks && landmarks.length >= 20) {
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

      face = {
        landmarks: points,
        center: { x: nose.x, y: nose.y },
        scale: Math.max(width, height),
        width,
        height,
        rotation: Math.atan2(right.y - left.y, right.x - left.x),
        timestamp: now
      };
    }

    const handFrames: HandFrame[] = [];

    // Hand detection is optional and never blocks face detection.
    if (this.hands) {
      try {
        const handResult: HandLandmarkerResult = this.hands.detectForVideo(video, now);

        (handResult.landmarks ?? []).forEach((hand, index) => {
          const points: Point[] = hand.map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z
          }));

          const xs = points.map((p) => p.x);
          const ys = points.map((p) => p.y);
          const center = {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2
          };
          const scale = Math.max(
            Math.max(...xs) - Math.min(...xs),
            Math.max(...ys) - Math.min(...ys)
          );

          const displayName = handResult.handednesses?.[index]?.[0]?.displayName;
          const handedness: HandFrame["handedness"] =
            displayName === "Left" || displayName === "Right"
              ? displayName
              : "Unknown";

          handFrames.push({
            landmarks: points,
            center,
            scale,
            handedness,
            gesture: classifyHand(points),
            timestamp: now
          });
        });
      } catch (error) {
        console.warn("LUMAROZ VISION: hand detection frame skipped.", error);
      }
    }

    return { face, hands: handFrames };
  }

  close() {
    this.face?.close();
    this.hands?.close();
    this.face = null;
    this.hands = null;
  }
}
