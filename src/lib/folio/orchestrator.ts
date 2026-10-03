import { critiqueBook, pageReady } from "./critic.ts";
import type { Book, Issue, Scorecard, Shot } from "./types";

export type Action =
  | { type: "idle" }
  | { type: "story_hold"; breaks: string[] }
  | { type: "hold"; shotId: string; issues: Issue[] }
  | { type: "drop"; shotId: string; reason: string }
  | { type: "draw"; shotId: string }
  | { type: "score"; shotId: string };

const PASS = {
  identity: 4,
  wardrobe: 4,
  anatomy: 3,
} as const;

export function log(book: Book, message: string): Book {
  return {
    ...book,
    updatedAt: Date.now(),
    log: [...book.log, { at: Date.now(), message }].slice(-200),
  };
}

function patch(book: Book, shotId: string, edit: (shot: Shot) => Shot): Book {
  return {
    ...book,
    updatedAt: Date.now(),
    shots: book.shots.map((shot) => (shot.id === shotId ? edit(shot) : shot)),
  };
}

export function nextAction(book: Book): Action {
  if (book.pages.length === 0) return { type: "idle" };
  if (book.storyBreaks.length > 0 && !book.overrideStory) {
    return { type: "story_hold", breaks: book.storyBreaks };
  }
  const pageIssue = critiqueBook(book).find((issue) => issue.shotId === null);
  if (pageIssue) return { type: "hold", shotId: "", issues: [pageIssue] };

  const generated = book.shots.find((shot) => shot.status === "generated");
  if (generated) return { type: "score", shotId: generated.id };

  const open = book.shots.find((shot) => shot.status === "pending" || shot.status === "redo");
  if (!open) return { type: "idle" };

  const issues = critiqueBook(book).filter((issue) => issue.shotId === open.id);
  const fatal = issues.find((issue) => issue.code === "unknown_cast");
  if (fatal) return { type: "drop", shotId: open.id, reason: fatal.message };
  if (issues.length > 0) return { type: "hold", shotId: open.id, issues };
  return { type: "draw", shotId: open.id };
}

export function dropShot(book: Book, shotId: string, reason: string): Book {
  return log(
    patch(book, shotId, (shot) => ({
      ...shot,
      status: "blocked",
      blockReason: reason,
      note: reason,
    })),
    `${shotId} dropped before the bench — ${reason}`,
  );
}

export function markGenerated(book: Book, shotId: string, painter: Shot["painter"]): Book {
  const attempt = (book.shots.find((shot) => shot.id === shotId)?.attempts ?? 0) + 1;
  return log(
    patch(book, shotId, (shot) => ({
      ...shot,
      status: "generated",
      attempts: attempt,
      painter,
      note: "",
    })),
    `${shotId} generated (attempt ${attempt}) — not accepted`,
  );
}

export function scorePasses(card: Scorecard): boolean {
  return (
    card.identity >= PASS.identity &&
    card.wardrobe >= PASS.wardrobe &&
    card.anatomy >= PASS.anatomy &&
    card.beatShown &&
    !card.extraPeople &&
    !card.selfCensored
  );
}

export function applyScorecard(book: Book, shotId: string, card: Scorecard): Book {
  const shot = book.shots.find((item) => item.id === shotId);
  if (!shot) return book;
  if (scorePasses(card)) {
    return log(
      patch(book, shotId, (item) => ({ ...item, status: "accepted", score: card, note: "" })),
      `${shotId} accepted`,
    );
  }
  if (shot.attempts < book.maxAttempts) {
    const note = card.note || "Under the line";
    return log(
      patch(book, shotId, (item) => ({ ...item, status: "redo", score: card, note })),
      `${shotId} redo — ${note}`,
    );
  }
  const note = card.note || "Retries spent";
  return log(
    patch(book, shotId, (item) => ({ ...item, status: "needs_human", score: card, note })),
    `${shotId} needs you — ${note}`,
  );
}

export function markUnscored(book: Book, shotId: string, reason: string): Book {
  return log(
    patch(book, shotId, (shot) => ({
      ...shot,
      status: "needs_human",
      note: reason,
    })),
    `${shotId} needs you — ${reason}`,
  );
}

export function humanAccept(book: Book, shotId: string): Book {
  return log(
    patch(book, shotId, (shot) => ({
      ...shot,
      status: "accepted",
      note: "Kept by hand",
    })),
    `${shotId} accepted by hand`,
  );
}

export function retryShot(book: Book, shotId: string): Book {
  return log(
    patch(book, shotId, (shot) => ({
      ...shot,
      status: "pending",
      attempts: 0,
      note: "",
      score: null,
      painter: "none",
    })),
    `${shotId} sent back to pending`,
  );
}

export function setStoryBreaks(book: Book, breaks: string[]): Book {
  if (breaks.length === 0) {
    return log({ ...book, storyBreaks: [] }, "Story critic found no world-rule breaks");
  }
  return log(
    { ...book, storyBreaks: breaks, overrideStory: false },
    `Story critic held the book — ${breaks[0]}`,
  );
}

export function overrideStory(book: Book): Book {
  return log({ ...book, overrideStory: true }, "Story hold overridden — the shot list was not rewritten");
}

export function readyPages(book: Book): number[] {
  return book.pages.filter((page) => pageReady(book, page.number)).map((page) => page.number);
}
