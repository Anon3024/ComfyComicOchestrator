import { layoutPage, lineCapacity, TEMPLATE_COUNTS } from "./layout.ts";
import type { Book, Issue, Shot } from "./types";
import { shotMap } from "./types.ts";

const TOUCH =
  /\b(kiss(?:es|ed|ing)?|embrace|hug(?:s|ging)?|holding hands|touch(?:es|ed|ing)?|caress(?:es|ed|ing)?)\b/i;

export function activeShots(book: Book, pageNumber: number): Shot[] {
  const page = book.pages.find((item) => item.number === pageNumber);
  if (!page) return [];
  const shots = shotMap(book);
  return page.shotIds
    .map((id) => shots.get(id))
    .filter((shot): shot is Shot => !!shot && shot.status !== "blocked");
}

export function critiqueShot(book: Book, shot: Shot): Issue[] {
  const issues: Issue[] = [];
  const known = new Set(book.cast.map((member) => member.id));
  const unknown = shot.cast.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    issues.push({
      shotId: shot.id,
      code: "unknown_cast",
      message: `Unknown character ${unknown.join(", ")} — drop before the bench is used`,
    });
  }
  if (!shot.prompt.trim()) {
    issues.push({ shotId: shot.id, code: "prompt", message: "Shot has no prompt" });
  }
  if (!shot.camera) {
    issues.push({ shotId: shot.id, code: "camera", message: "Shot has no camera" });
  }
  if (shot.cast.length === 0) {
    issues.push({ shotId: shot.id, code: "cast", message: "Shot has an empty cast" });
  }
  if (!book.locations.some((location) => location.id === shot.location)) {
    issues.push({
      shotId: shot.id,
      code: "location",
      message: "Location is not in the world",
    });
  }
  for (const member of book.cast) {
    const worn = shot.outfit[member.id];
    if (shot.cast.includes(member.id) && worn && worn !== member.outfit) {
      issues.push({
        shotId: shot.id,
        code: "outfit",
        message: `${member.name}'s outfit contradicts the ledger`,
      });
    }
  }
  for (const line of shot.dialogue) {
    if (line.kind === "narration" || line.kind === "sfx") continue;
    if (!shot.cast.includes(line.speaker)) {
      issues.push({
        shotId: shot.id,
        code: "speaker",
        message: `Speaker is not on this panel`,
      });
    }
  }
  const page = book.pages.find((item) => item.shotIds.includes(shot.id));
  if (page) {
    const layout = layoutPage(page.template, page.shotIds, book.readingOrder);
    const box = layout.boxes.find((item) => item.id === shot.id);
    if (!box) {
      issues.push({ shotId: shot.id, code: "layout", message: "Shot has no box on its page" });
    } else {
      const used = shot.dialogue.reduce((sum, line) => sum + line.text.length, 0);
      if (used > lineCapacity(box)) {
        issues.push({
          shotId: shot.id,
          code: "fit",
          message: "Dialogue does not fit the measured box",
        });
      }
    }
    if (page.shotIds.length !== TEMPLATE_COUNTS[page.template]) {
      issues.push({
        shotId: shot.id,
        code: "template",
        message: `${page.template} expects ${TEMPLATE_COUNTS[page.template]} shots`,
      });
    }
  }
  return issues;
}

export function critiqueBook(book: Book): Issue[] {
  const issues: Issue[] = [];
  if (book.pages.length < book.minPages) {
    issues.push({
      shotId: null,
      code: "pages",
      message: `Page count ${book.pages.length} is under the minimum ${book.minPages}`,
    });
  }
  if (book.cast.length === 0) {
    issues.push({ shotId: null, code: "cast", message: "The book has no cast" });
  }
  const seen = new Set<string>();
  for (const shot of book.shots) {
    if (seen.has(shot.id)) {
      issues.push({ shotId: shot.id, code: "id", message: "Duplicate shot id" });
    }
    seen.add(shot.id);
    if (shot.status === "blocked") continue;
    issues.push(...critiqueShot(book, shot));
  }
  return dedupe(issues);
}

export function storyLedgerBreaks(book: Book): string[] {
  const breaks: string[] = [];
  const touchRule = book.rules.some((rule) => /touch/i.test(rule));
  for (const shot of book.shots) {
    if (shot.status === "blocked") continue;
    if (touchRule && TOUCH.test(`${shot.beat} ${shot.prompt} ${shot.dialogue.map((line) => line.text).join(" ")}`)) {
      breaks.push(`${shot.id} breaks the rule against touch`);
    }
    for (const member of book.cast) {
      const worn = shot.outfit[member.id];
      if (shot.cast.includes(member.id) && worn && worn !== member.outfit) {
        breaks.push(`${shot.id} changes ${member.name}'s outfit without a ledger edit`);
      }
    }
    if (!book.locations.some((location) => location.id === shot.location)) {
      breaks.push(`${shot.id} leaves the known locations`);
    }
  }
  return breaks;
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.shotId}:${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function pageReady(book: Book, pageNumber: number): boolean {
  const shots = activeShots(book, pageNumber);
  return shots.length > 0 && shots.every((shot) => shot.status === "accepted");
}
