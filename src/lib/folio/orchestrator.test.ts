import assert from "node:assert/strict";
import { test } from "node:test";
import { critiqueBook, pageReady, storyLedgerBreaks } from "./critic.ts";
import { GUTTER, layoutPage, MARGIN, PAGE_H, PAGE_W } from "./layout.ts";
import { planFromWriter } from "./model.ts";
import { applyScorecard, dropShot, markGenerated, nextAction, scorePasses } from "./orchestrator.ts";
import { makeSample } from "./sample.ts";
import { rehearsalScore } from "./standin.ts";
import type { Book } from "./types.ts";

test("sample book passes the code critic and meets the page minimum", () => {
  const book = makeSample(1);
  assert.equal(book.pages.length, 4);
  assert.equal(critiqueBook(book).length, 0);
  assert.equal(storyLedgerBreaks(book).length, 0);
  assert.equal(nextAction(book).type, "draw");
});

test("a generated panel is not accepted until the scorecard passes", () => {
  let book = makeSample(1);
  const first = book.shots[0];
  book = markGenerated(book, first.id, "rehearsal");
  const generated = book.shots[0];
  assert.equal(generated.status, "generated");
  assert.equal(generated.attempts, 1);
  assert.equal(nextAction(book).type, "score");
  book = applyScorecard(book, first.id, rehearsalScore(generated, 1));
  assert.equal(book.shots[0].status, "redo");
  book = markGenerated(book, first.id, "rehearsal");
  book = applyScorecard(book, first.id, rehearsalScore(book.shots[0], 2));
  assert.equal(book.shots[0].status, "accepted");
  assert.equal(scorePasses(book.shots[0].score!), true);
});

test("retries spent become needs_human and an unknown character is dropped", () => {
  let book = makeSample(1);
  book = { ...book, maxAttempts: 1 };
  const id = book.shots[0].id;
  book = markGenerated(book, id, "rehearsal");
  book = applyScorecard(book, id, rehearsalScore(book.shots[0], 1));
  assert.equal(book.shots[0].status, "needs_human");

  book.shots = book.shots.map((shot, index) => (index === 1 ? { ...shot, cast: ["ghost"] } : shot));
  const action = nextAction(book);
  assert.equal(action.type, "drop");
  if (action.type === "drop") book = dropShot(book, action.shotId, action.reason);
  assert.equal(book.shots[1].status, "blocked");
});

test("a page assembles only when every live shot is accepted", () => {
  let book = makeSample(1);
  const page = book.pages[0];
  assert.equal(pageReady(book, page.number), false);
  for (const id of page.shotIds) {
    book = markGenerated(book, id, "rehearsal");
    book = applyScorecard(book, id, rehearsalScore(book.shots.find((shot) => shot.id === id)!, 2));
  }
  assert.equal(pageReady(book, page.number), true);
});

test("layout uses one gutter and keeps a hero", () => {
  const ltr = layoutPage("grid_2x2", ["a", "b", "c", "d"], "ltr");
  const rtl = layoutPage("grid_2x2", ["a", "b", "c", "d"], "rtl");
  assert.deepEqual(ltr.reading, ["a", "b", "c", "d"]);
  assert.deepEqual(rtl.reading, ["b", "a", "d", "c"]);
  assert.ok(ltr.boxes.every((box) => box.x >= MARGIN - 0.1 && box.y >= MARGIN - 0.1));
  assert.ok(ltr.boxes.every((box) => box.x + box.w <= PAGE_W - MARGIN + 0.5));
  assert.ok(ltr.boxes.every((box) => box.y + box.h <= PAGE_H - MARGIN + 0.5));
  const [top, , bottom] = ltr.boxes;
  assert.ok(Math.abs(bottom.y - (top.y + top.h) - GUTTER) < 0.6);
  const areas = ltr.boxes.map((box) => box.w * box.h);
  const hero = ltr.boxes.find((box) => box.id === ltr.hero);
  assert.equal(hero && hero.w * hero.h, Math.max(...areas));
});

test("touch rule fails closed and a short book is held", () => {
  const book = makeSample(1);
  book.shots[0].beat = "Ivo kisses the rain";
  assert.ok(storyLedgerBreaks(book).some((line) => line.includes("touch")));
  const short: Book = { ...book, pages: book.pages.slice(0, 1), minPages: 8 };
  assert.equal(nextAction(short).type, "hold");
});

test("writer JSON below the page minimum is refused", () => {
  const book = makeSample(1);
  assert.throws(() => planFromWriter(book, JSON.stringify({ pages: [{ template: "splash", shots: [{ beat: "x", cast: ["Ivo"] }] }] })));
});
