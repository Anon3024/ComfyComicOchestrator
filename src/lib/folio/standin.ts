import type { Scorecard, Shot } from "./types";

/** Attempt 1 fails identity. Attempt 2 clears the accept rule. */
export function rehearsalScore(shot: Shot, attempt: number): Scorecard {
  if (attempt <= 1) {
    return {
      identity: 3,
      wardrobe: 4,
      anatomy: 4,
      beatShown: true,
      extraPeople: false,
      selfCensored: false,
      note: "Face drifted from the sheet.",
    };
  }
  return {
    identity: 5,
    wardrobe: 5,
    anatomy: 4,
    beatShown: true,
    extraPeople: false,
    selfCensored: false,
    note: "",
  };
}

export const INK = "#141210";
export const PAPER = "#f3ece1";
export const VERMILLION = "#e24b32";
export const WASH = "#2a241f";

export function paintPanel(shot: Shot, attempt: number, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = attempt <= 1 ? "#1c1916" : WASH;
  ctx.fillRect(0, 0, width, height);

  const horizon = height * 0.62;
  ctx.strokeStyle = PAPER;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(2, width / 80);
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(width, horizon);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const people = Math.max(1, Math.min(2, shot.cast.length));
  const scale = shot.camera === "close" || shot.camera === "extreme_close" ? 1.35 : shot.camera === "wide" ? 0.72 : 1;
  for (let i = 0; i < people; i += 1) {
    const cx = people === 1 ? width * 0.5 : width * (i === 0 ? 0.34 : 0.68);
    const drift = attempt <= 1 ? width * 0.06 : 0;
    drawFigure(ctx, cx + (i === 0 ? drift : 0), height * 0.78, width * 0.22 * scale, i === 1);
  }

  ctx.strokeStyle = VERMILLION;
  ctx.lineWidth = Math.max(2, width / 100);
  const m = width * 0.04;
  crop(ctx, m, m, width * 0.08);
  crop(ctx, width - m, m, width * 0.08, true);
  return canvas;
}

function drawFigure(ctx: CanvasRenderingContext2D, x: number, foot: number, size: number, second: boolean) {
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(x, foot - size * 2.15, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - size * 0.55, foot - size * 1.7, size * 1.1, size * 1.55);
  if (second) {
    ctx.fillStyle = VERMILLION;
    ctx.fillRect(x - size * 0.55, foot - size * 1.15, size * 1.1, size * 0.12);
  }
}

function crop(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, flip = false) {
  const dir = flip ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + len * dir, y);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + len);
  ctx.stroke();
}
