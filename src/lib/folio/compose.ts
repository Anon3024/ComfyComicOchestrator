import { layoutPage, MARGIN, PAGE_H, PAGE_W, type Box } from "./layout.ts";
import { getPanel } from "./panels.ts";
import { INK, paintPanel, PAPER, VERMILLION } from "./standin.ts";
import type { Book, Line, Shot } from "./types";
import { shotMap } from "./types.ts";

export async function composePage(book: Book, pageNumber: number, lettered: boolean): Promise<HTMLCanvasElement | null> {
  const page = book.pages.find((item) => item.number === pageNumber);
  if (!page) return null;
  const layout = layoutPage(page.template, page.shotIds, book.readingOrder);
  const shots = shotMap(book);
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  for (const box of layout.boxes) {
    const shot = shots.get(box.id);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    const source = shot ? await panelSource(shot, box) : null;
    if (source) cover(ctx, source, box);
    else plate(ctx, box);
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x + 1.5, box.y + 1.5, box.w - 3, box.h - 3);
    if (lettered && shot && shot.status !== "blocked") letter(ctx, shot, box);
  }

  ctx.fillStyle = INK;
  ctx.font = "16px Outfit, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(pageNumber), PAGE_W - MARGIN, PAGE_H - 8);
  return canvas;
}

async function panelSource(shot: Shot, box: Box): Promise<CanvasImageSource | null> {
  if (shot.painter === "none" || shot.status === "pending" || shot.status === "blocked") return null;
  if (shot.painter === "remote") {
    const url = await getPanel(shot.id);
    if (!url) return null;
    try {
      return await loadImage(url);
    } catch {
      return null;
    }
  }
  return paintPanel(shot, Math.max(1, shot.attempts), Math.max(2, Math.ceil(box.w)), Math.max(2, Math.ceil(box.h)));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("panel"));
    image.src = url;
  });
}

function cover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, box: Box) {
  const width = "width" in source ? Number(source.width) : box.w;
  const height = "height" in source ? Number(source.height) : box.h;
  const scale = Math.max(box.w / width, box.h / height);
  const dw = width * scale;
  const dh = height * scale;
  ctx.drawImage(source, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
}

function plate(ctx: CanvasRenderingContext2D, box: Box) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = VERMILLION;
  ctx.lineWidth = 2;
  const len = Math.min(18, box.w / 8);
  const x = box.x + 10;
  const y = box.y + 10;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + len);
  ctx.stroke();
}

function letter(ctx: CanvasRenderingContext2D, shot: Shot, box: Box) {
  const lines = shot.dialogue.filter((line) => line.text.trim()).slice(0, 2);
  let y = box.y + 12;
  for (const line of lines) {
    y = drawBalloon(ctx, line, box, y) + 8;
  }
}

function drawBalloon(ctx: CanvasRenderingContext2D, line: Line, box: Box, top: number): number {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  const pad = 10;
  const maxW = Math.max(40, box.w - pad * 4);
  ctx.font = line.kind === "sfx" ? "italic 26px Newsreader, serif" : "16px Outfit, sans-serif";
  const wrapped = wrap(ctx, line.text, maxW).slice(0, 4);
  if (line.kind === "sfx") {
    ctx.fillStyle = INK;
    ctx.fillText(wrapped[0] ?? "", box.x + pad * 2, top + 28);
    ctx.restore();
    return top + 36;
  }
  const lh = 20;
  const bw = Math.min(box.w - pad * 2, maxW + pad * 2);
  const bh = wrapped.length * lh + pad * 1.6;
  const bx = box.x + (box.w - bw) / 2;
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.setLineDash(line.kind === "whisper" ? [4, 3] : []);
  if (line.kind === "narration") {
    ctx.fillRect(bx, top, bw, bh);
    ctx.strokeRect(bx, top, bw, bh);
  } else if (line.kind === "shout") {
    jagged(ctx, bx, top, bw, bh);
    ctx.fill();
    ctx.stroke();
  } else {
    round(ctx, bx, top, bw, bh, line.kind === "thought" ? 22 : 16);
    ctx.fill();
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = INK;
  wrapped.forEach((text, index) => {
    ctx.fillText(text, bx + pad, top + pad + 12 + index * lh);
  });
  ctx.restore();
  return top + bh;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function jagged(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const spike = 6;
  ctx.beginPath();
  ctx.moveTo(x + spike, y);
  ctx.lineTo(x + w * 0.3, y + spike);
  ctx.lineTo(x + w * 0.55, y);
  ctx.lineTo(x + w - spike, y + spike);
  ctx.lineTo(x + w, y + h * 0.4);
  ctx.lineTo(x + w - spike, y + h * 0.7);
  ctx.lineTo(x + w, y + h - spike);
  ctx.lineTo(x + w * 0.4, y + h);
  ctx.lineTo(x + spike, y + h - spike);
  ctx.lineTo(x, y + h * 0.45);
  ctx.closePath();
}
