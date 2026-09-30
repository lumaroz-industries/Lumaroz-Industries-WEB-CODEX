export type Point = { x: number; y: number; z?: number };

export type FaceFrame = {
  landmarks: Point[];
  center: Point;
  scale: number;
  rotation: number;
  width: number;
  height: number;
  timestamp: number;
};

export type HandFrame = {
  landmarks: Point[];
  center: Point;
  scale: number;
  handedness: "Left" | "Right" | "Unknown";
  gesture: "none" | "pinch" | "claw" | "open";
  timestamp: number;
};

export type VisionFrame = {
  face: FaceFrame | null;
  hands: HandFrame[];
};

export type EffectId = "orbit" | "grid" | "halo" | "scan" | "prism" | "constellation" | "neural";

export type EffectPreset = {
  id: EffectId;
  name: string;
  short: string;
  description: string;
};

export type WidgetKind = "vision" | "system" | "clock" | "browser";

export type WidgetFrame = {
  id: string;
  kind: WidgetKind;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  z: number;
  minimized: boolean;
};
