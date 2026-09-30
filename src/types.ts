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

export type EffectId = "orbit" | "grid" | "halo" | "scan" | "prism";

export type EffectPreset = {
  id: EffectId;
  name: string;
  short: string;
  description: string;
};