import type { EffectId, FaceFrame, Point } from "../types";

const FACE_OUTLINE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function p(frame: FaceFrame, index: number, canvas: HTMLCanvasElement): [number, number] {
  const q = frame.landmarks[index];
  return [q.x * canvas.width, q.y * canvas.height];
}

function line(ctx: CanvasRenderingContext2D, points: Point[], canvas: HTMLCanvasElement, close = false) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((q, i) => {
    const x = q.x * canvas.width;
    const y = q.y * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

function faceOutline(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  line(ctx, FACE_OUTLINE.map((i) => frame.landmarks[i]), canvas, true);
}

function drawOrbit(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number) {
  const [cx, cy] = p(frame, 1, canvas);
  const r = frame.scale * canvas.width * 0.52;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  ctx.strokeStyle = "rgba(222,231,255,.86)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1 + i * 0.16), r * (0.27 + i * 0.05), t * 0.00025 * (i % 2 ? -1 : 1), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const a = t * 0.0011 + (i / 10) * Math.PI * 2;
    const x = Math.cos(a) * r * 1.05;
    const y = Math.sin(a) * r * 0.3;
    ctx.fillStyle = i % 3 === 0 ? "rgba(190,196,255,.95)" : "rgba(255,255,255,.45)";
    ctx.beginPath();
    ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGrid(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const [cx, cy] = p(frame, 1, canvas);
  const w = frame.width * canvas.width * 0.9;
  const h = frame.height * canvas.height * 0.92;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  ctx.strokeStyle = "rgba(215,225,245,.34)";
  ctx.lineWidth = 0.75;
  for (let i = -5; i <= 5; i++) {
    const x = (i / 5) * w * 0.52;
    ctx.beginPath(); ctx.moveTo(x, -h * 0.55); ctx.lineTo(x, h * 0.55); ctx.stroke();
  }
  for (let i = -4; i <= 4; i++) {
    const y = (i / 4) * h * 0.52;
    ctx.beginPath(); ctx.moveTo(-w * 0.55, y); ctx.lineTo(w * 0.55, y); ctx.stroke();
  }
  ctx.restore();
}

function drawHalo(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number) {
  const [cx, cy] = p(frame, 10, canvas);
  const r = frame.height * canvas.height * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r + i * 12, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = `rgba(236,240,255,${0.65 - i * 0.1})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  const pulse = 1 + Math.sin(t * 0.004) * 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,.17)";
  ctx.stroke();
  ctx.restore();
}

function drawScan(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number) {
  const [cx, cy] = p(frame, 1, canvas);
  const w = frame.width * canvas.width * 1.1;
  const h = frame.height * canvas.height * 1.12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.lineWidth = 1;
  const y = ((t * 0.08) % (h * 1.15)) - h * 0.57;
  ctx.beginPath(); ctx.moveTo(-w * .52, y); ctx.lineTo(w * .52, y); ctx.stroke();
  ctx.strokeStyle = "rgba(220,230,255,.24)";
  ctx.setLineDash([4, 6]);
  ctx.strokeRect(-w * .48, -h * .5, w * .96, h);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPrism(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number) {
  const [cx, cy] = p(frame, 1, canvas);
  const r = frame.scale * canvas.width * 0.48;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation + t * 0.0002);
  ctx.strokeStyle = "rgba(235,240,255,.72)";
  ctx.lineWidth = 1;
  const sides = 6;
  for (let ring = 0; ring < 2; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const rr = r * (0.72 + ring * 0.25);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * 0.72;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * .72, Math.sin(a) * r * .72 * .72);
    ctx.lineTo(Math.cos(a) * r * .97, Math.sin(a) * r * .97 * .72);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderEffect(
  id: EffectId,
  frame: FaceFrame,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  time: number
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (id === "orbit") drawOrbit(frame, ctx, canvas, time);
  if (id === "grid") drawGrid(frame, ctx, canvas);
  if (id === "halo") drawHalo(frame, ctx, canvas, time);
  if (id === "scan") drawScan(frame, ctx, canvas, time);
  if (id === "prism") drawPrism(frame, ctx, canvas, time);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 0.7;
  faceOutline(frame, ctx, canvas);
  ctx.restore();

  // Small face anchors make the tracking behavior visually obvious without turning the UI into a diagnostic mesh.
  ctx.fillStyle = "rgba(255,255,255,.65)";
  [1, 33, 263, 61, 291].forEach((idx) => {
    const [x, y] = p(frame, idx, canvas);
    ctx.beginPath();
    ctx.arc(x, y, clamp(frame.scale * canvas.width * 0.025, 1.5, 3), 0, Math.PI * 2);
    ctx.fill();
  });
}