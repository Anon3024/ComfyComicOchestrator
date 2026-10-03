import type { ReadingOrder, Template } from "./types";

export const PAGE_W = 800;
export const PAGE_H = 1200;
export const GUTTER = 16;
export const MARGIN = 28;

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Leaf = { shot: number };
type Split = { axis: "row" | "col"; weights: number[]; kids: Node[] };
type Node = Leaf | Split;

export const TEMPLATE_COUNTS: Record<Template, number> = {
  splash: 1,
  stack_2: 2,
  top_wide_two_small: 3,
  grid_2x2: 4,
  grid_3x2: 6,
  blockage: 3,
};

const TREES: Record<Template, Node> = {
  splash: { shot: 0 },
  stack_2: { axis: "col", weights: [1, 1], kids: [{ shot: 0 }, { shot: 1 }] },
  top_wide_two_small: {
    axis: "col",
    weights: [1.35, 1],
    kids: [
      { shot: 0 },
      { axis: "row", weights: [1, 1], kids: [{ shot: 1 }, { shot: 2 }] },
    ],
  },
  grid_2x2: {
    axis: "col",
    weights: [1, 1],
    kids: [
      { axis: "row", weights: [1, 1], kids: [{ shot: 0 }, { shot: 1 }] },
      { axis: "row", weights: [1, 1], kids: [{ shot: 2 }, { shot: 3 }] },
    ],
  },
  grid_3x2: {
    axis: "col",
    weights: [1, 1, 1],
    kids: [
      { axis: "row", weights: [1, 1], kids: [{ shot: 0 }, { shot: 1 }] },
      { axis: "row", weights: [1, 1], kids: [{ shot: 2 }, { shot: 3 }] },
      { axis: "row", weights: [1, 1], kids: [{ shot: 4 }, { shot: 5 }] },
    ],
  },
  blockage: {
    axis: "row",
    weights: [1.45, 1],
    kids: [
      { shot: 0 },
      { axis: "col", weights: [1, 1], kids: [{ shot: 1 }, { shot: 2 }] },
    ],
  },
};

function isLeaf(node: Node): node is Leaf {
  return "shot" in node;
}

function reverseRows(node: Node): Node {
  if (isLeaf(node)) return node;
  const kids = node.kids.map(reverseRows);
  const weights = [...node.weights];
  if (node.axis === "row") {
    kids.reverse();
    weights.reverse();
  }
  return { axis: node.axis, weights, kids };
}

function place(node: Node, x: number, y: number, w: number, h: number, acc: { index: number; x: number; y: number; w: number; h: number }[]) {
  if (isLeaf(node)) {
    acc.push({ index: node.shot, x, y, w, h });
    return;
  }
  const gaps = node.kids.length - 1;
  const span = (node.axis === "row" ? w : h) - gaps * GUTTER;
  const total = node.weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = node.axis === "row" ? x : y;
  node.kids.forEach((kid, i) => {
    const size = (span * node.weights[i]) / total;
    if (node.axis === "row") {
      place(kid, cursor, y, size, h, acc);
      cursor += size + GUTTER;
    } else {
      place(kid, x, cursor, w, size, acc);
      cursor += size + GUTTER;
    }
  });
}

function walk(node: Node, order: number[]) {
  if (isLeaf(node)) {
    order.push(node.shot);
    return;
  }
  node.kids.forEach((kid) => walk(kid, order));
}

export function layoutPage(template: Template, shotIds: string[], order: ReadingOrder): { boxes: Box[]; reading: string[]; hero: string } {
  const tree = order === "rtl" ? reverseRows(TREES[template]) : TREES[template];
  const drafts: { index: number; x: number; y: number; w: number; h: number }[] = [];
  place(tree, MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2, drafts);
  const boxes = drafts
    .filter((draft) => shotIds[draft.index])
    .map((draft) => ({
      id: shotIds[draft.index],
      x: draft.x,
      y: draft.y,
      w: draft.w,
      h: draft.h,
    }));
  const indexes: number[] = [];
  walk(tree, indexes);
  const reading = indexes.map((index) => shotIds[index]).filter(Boolean);
  const hero = boxes.reduce((best, box) => (box.w * box.h > best.w * best.h ? box : best), boxes[0]);
  return { boxes, reading, hero: hero?.id ?? shotIds[0] ?? "" };
}

export function templateForCount(count: number): Template {
  if (count <= 1) return "splash";
  if (count === 2) return "stack_2";
  if (count === 3) return "top_wide_two_small";
  if (count === 4) return "grid_2x2";
  if (count === 5) return "grid_2x2";
  return "grid_3x2";
}

export function lineCapacity(box: Box): number {
  const cols = Math.max(8, Math.floor(box.w / 11));
  const rows = Math.max(2, Math.floor(box.h / 36));
  return cols * rows;
}
