import type { EffectId, FaceFrame, HandFrame, Point } from "../types";

const FACE_OUTLINE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function point(frame: FaceFrame, index: number, canvas: HTMLCanvasElement): [number, number] {
  const q = frame.landmarks[index];
  return [q.x * canvas.width, q.y * canvas.height];
}

function drawPath(ctx: CanvasRenderingContext2D, points: Point[], canvas: HTMLCanvasElement, close = false) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach((q, i) => i === 0 ? ctx.moveTo(q.x * canvas.width, q.y * canvas.height) : ctx.lineTo(q.x * canvas.width, q.y * canvas.height));
  if (close) ctx.closePath();
  ctx.stroke();
}

function faceOutline(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  drawPath(ctx, FACE_OUTLINE.map((i) => frame.landmarks[i]), canvas, true);
}

function ring(ctx: CanvasRenderingContext2D, rx: number, ry: number, rotation: number) {
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, rotation, 0, Math.PI * 2);
  ctx.stroke();
}

function drawOrbit(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const [cx, cy] = point(frame, 1, canvas);
  const r = frame.scale * canvas.width * (0.45 + intensity * 0.08);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  ctx.strokeStyle = "rgba(224,231,250,.85)";
  ctx.lineWidth = 1.1 + intensity * 0.7;
  for (let i = 0; i < 4; i++) ring(ctx, r * (1 + i * .13), r * (.24 + i * .04), t * .00025 * (i % 2 ? -1 : 1));
  for (let i = 0; i < 18; i++) {
    const a = t * .0011 + i / 18 * Math.PI * 2;
    ctx.fillStyle = i % 4 === 0 ? "rgba(255,255,255,.95)" : "rgba(190,200,225,.48)";
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 1.08, Math.sin(a) * r * .31, 1.2 + (i % 3) * intensity, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGrid(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, intensity: number) {
  const [cx, cy] = point(frame, 1, canvas);
  const w = frame.width * canvas.width * (.9 + intensity * .25);
  const h = frame.height * canvas.height * (.92 + intensity * .2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  ctx.strokeStyle = "rgba(220,229,247,.32)";
  ctx.lineWidth = .65 + intensity * .4;
  for (let i = -6; i <= 6; i++) {
    const x = i / 6 * w * .52;
    ctx.beginPath(); ctx.moveTo(x, -h * .58); ctx.lineTo(x, h * .58); ctx.stroke();
  }
  for (let i = -5; i <= 5; i++) {
    const y = i / 5 * h * .52;
    ctx.beginPath(); ctx.moveTo(-w * .58, y); ctx.lineTo(w * .58, y); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,.68)";
  ctx.strokeRect(-w * .48, -h * .5, w * .96, h);
  ctx.restore();
}

function drawHalo(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const [cx, cy] = point(frame, 10, canvas);
  const r = frame.height * canvas.height * (.4 + intensity * .05);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, r + i * (10 + intensity * 5), Math.PI * (.12 + i * .02), Math.PI * (.88 - i * .02));
    ctx.strokeStyle = `rgba(238,243,255,${.65 - i * .09})`;
    ctx.lineWidth = 1 + intensity * .35;
    ctx.stroke();
  }
  const pulse = 1 + Math.sin(t * .004) * (.05 + intensity * .05);
  ring(ctx, r * pulse, r * .22 * pulse, 0);
  ctx.restore();
}

function drawScan(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const [cx, cy] = point(frame, 1, canvas);
  const w = frame.width * canvas.width * (1 + intensity * .2);
  const h = frame.height * canvas.height * (1.08 + intensity * .2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  const y = ((t * (.07 + intensity * .03)) % (h * 1.15)) - h * .57;
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.lineWidth = 1 + intensity * .3;
  ctx.beginPath(); ctx.moveTo(-w * .52, y); ctx.lineTo(w * .52, y); ctx.stroke();
  ctx.strokeStyle = "rgba(220,230,255,.26)";
  ctx.setLineDash([4, 6]);
  ctx.strokeRect(-w * .48, -h * .5, w * .96, h);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPrism(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const [cx, cy] = point(frame, 1, canvas);
  const r = frame.scale * canvas.width * (.43 + intensity * .08);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation + t * .0002);
  ctx.strokeStyle = "rgba(237,242,255,.78)";
  ctx.lineWidth = 1 + intensity * .4;
  const sides = 7;
  for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2 - Math.PI / 2;
      const rr = r * (.64 + ringIndex * .2);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * .7;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawConstellation(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, intensity: number) {
  const ids = [10, 151, 33, 263, 61, 291, 199, 1, 168, 234, 454, 127, 356];
  const pts = ids.map((i) => frame.landmarks[i]).filter(Boolean);
  ctx.strokeStyle = `rgba(222,231,255,${.35 + intensity * .3})`;
  ctx.lineWidth = .8;
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(pts[i].x * canvas.width, pts[i].y * canvas.height);
    ctx.lineTo(pts[i + 1].x * canvas.width, pts[i + 1].y * canvas.height);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,.9)";
  pts.forEach((q) => {
    ctx.beginPath();
    ctx.arc(q.x * canvas.width, q.y * canvas.height, 1.8 + intensity, 0, Math.PI * 2);
    ctx.fill();
  });
}


function drawEnergy(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const [cx, cy] = point(frame, 1, canvas);
  const r = frame.scale * canvas.width * (.55 + intensity * .16);
  const pulse = 1 + Math.sin(t * .004) * (.04 + intensity * .05);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame.rotation);
  for (let i = 0; i < 9; i++) {
    const a = t * (.0005 + i * .000035) + i * Math.PI / 9;
    const rr = r * (.55 + (i % 3) * .18) * pulse;
    ctx.strokeStyle = "rgba(225,235,255," + (0.12 + intensity * .06) + ")";
    ctx.lineWidth = .7 + intensity * .45;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr * .18, Math.sin(a) * rr * .08, rr, a, a + Math.PI * (.7 + intensity * .3));
    ctx.stroke();
  }
  const gradient = ctx.createRadialGradient(0, 0, r * .05, 0, 0, r);
  gradient.addColorStop(0, "rgba(245,248,255," + (.08 + intensity * .1) + ")");
  gradient.addColorStop(.55, "rgba(170,190,225,.025)");
  gradient.addColorStop(1, "rgba(100,120,160,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticle(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const ids = [10, 33, 263, 61, 291, 1, 168, 234, 454, 127, 356, 199];
  ctx.save();
  ids.forEach((id, node) => {
    const q = frame.landmarks[id];
    if (!q) return;
    for (let i = 0; i < 10; i++) {
      const a = t * (.0007 + node * .00003) + i * Math.PI * 2 / 10;
      const orbit = (4 + i * 2 + intensity * 7) * canvas.width * .0025;
      const x = q.x * canvas.width + Math.cos(a) * orbit;
      const y = q.y * canvas.height + Math.sin(a * 1.3) * orbit;
      ctx.fillStyle = "rgba(232,239,255," + (.22 + (i % 3) * .16) + ")";
      ctx.beginPath();
      ctx.arc(x, y, 1 + intensity * (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawMesh(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const ids = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  ctx.save();
  ctx.strokeStyle = "rgba(220,230,248," + (.22 + intensity * .22) + ")";
  ctx.lineWidth = .55 + intensity * .35;
  for (let i = 0; i < ids.length; i++) {
    const a = frame.landmarks[ids[i]];
    const b = frame.landmarks[ids[(i + 1) % ids.length]];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
    if (i % 2 === 0) {
      ctx.beginPath();
      ctx.arc(a.x * canvas.width, a.y * canvas.height, 2 + Math.sin(t * .004 + i) * .8 + intensity, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245,248,255,.7)";
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawNeural(frame: FaceFrame, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, t: number, intensity: number) {
  const ids = [10, 338, 297, 284, 389, 454, 323, 361, 397, 378, 152, 148, 176, 149, 234, 127, 162, 21, 54, 103, 67, 109];
  ctx.save();
  ctx.strokeStyle = `rgba(220,228,247,${.18 + intensity * .24})`;
  ctx.lineWidth = .7;
  for (let i = 0; i < ids.length; i++) {
    const a = frame.landmarks[ids[i]];
    const b = frame.landmarks[ids[(i + 3) % ids.length]];
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  }
  const pulse = (Math.sin(t * .005) + 1) / 2;
  ctx.fillStyle = `rgba(255,255,255,${.35 + pulse * .45})`;
  ids.forEach((id, i) => {
    const q = frame.landmarks[id];
    ctx.beginPath();
    ctx.arc(q.x * canvas.width, q.y * canvas.height, 1.3 + pulse * 1.8 + intensity * .5, 0, Math.PI * 2);
    ctx.fill();
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(q.x * canvas.width, q.y * canvas.height, 6 + pulse * 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawHands(hands: HandFrame[], ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, intensity: number) {
  hands.forEach((hand) => {
    const mirrored = hand.landmarks.map((p) => ({ ...p, x: 1 - p.x }));
    ctx.save();
    ctx.strokeStyle = hand.gesture === "pinch" ? "rgba(255,255,255,.95)" : "rgba(190,202,225,.45)";
    ctx.lineWidth = hand.gesture === "pinch" ? 1.8 : .8;
    const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    links.forEach(([a,b]) => {
      ctx.beginPath();
      ctx.moveTo(mirrored[a].x * canvas.width, mirrored[a].y * canvas.height);
      ctx.lineTo(mirrored[b].x * canvas.width, mirrored[b].y * canvas.height);
      ctx.stroke();
    });
    const c = mirrored[8];
    ctx.beginPath();
    ctx.arc(c.x * canvas.width, c.y * canvas.height, 5 + intensity * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

export function renderEffect(
  id: EffectId,
  frame: FaceFrame,
  hands: HandFrame[],
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  time: number,
  intensity = .7
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (id === "orbit") drawOrbit(frame, ctx, canvas, time, intensity);
  if (id === "grid") drawGrid(frame, ctx, canvas, intensity);
  if (id === "halo") drawHalo(frame, ctx, canvas, time, intensity);
  if (id === "scan") drawScan(frame, ctx, canvas, time, intensity);
  if (id === "prism") drawPrism(frame, ctx, canvas, time, intensity);
  if (id === "constellation") drawConstellation(frame, ctx, canvas, intensity);
  if (id === "neural") drawNeural(frame, ctx, canvas, time, intensity);
  if (id === "energy") drawEnergy(frame, ctx, canvas, time, intensity);
  if (id === "particle") drawParticle(frame, ctx, canvas, time, intensity);
  if (id === "mesh") drawMesh(frame, ctx, canvas, time, intensity);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = .7;
  faceOutline(frame, ctx, canvas);
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,.68)";
  [1, 33, 263, 61, 291].forEach((idx) => {
    const [x, y] = point(frame, idx, canvas);
    ctx.beginPath();
    ctx.arc(x, y, clamp(frame.scale * canvas.width * .025, 1.5, 3.2), 0, Math.PI * 2);
    ctx.fill();
  });

  if (hands.length) drawHands(hands, ctx, canvas, intensity);
}
