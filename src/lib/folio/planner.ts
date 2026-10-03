import { TEMPLATE_COUNTS } from "./layout.ts";
import type { Book, Camera, CastMember, Line, PagePlan, Shot, Template } from "./types";
import { NEGATIVE } from "./types.ts";

const CYCLE: Template[] = [
  "splash",
  "stack_2",
  "top_wide_two_small",
  "grid_2x2",
  "stack_2",
  "blockage",
];

const CAMERAS: Camera[] = ["wide", "medium", "close", "over_shoulder", "low", "high"];

function beatsOf(story: string, count: number): string[] {
  const parts = story
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return Array.from({ length: count }, (_, index) => `Beat ${index + 1}`);
  }
  return Array.from({ length: count }, (_, index) => parts[index % parts.length] ?? parts[0]);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function mentioned(beat: string, cast: CastMember[]): CastMember[] {
  const lower = beat.toLowerCase();
  return cast.filter((member) => member.name && lower.includes(member.name.toLowerCase()));
}

export function planShots(book: Book): { pages: PagePlan[]; shots: Shot[] } {
  const cast = book.cast.filter((member) => member.name.trim());
  const location = book.locations[0];
  const locationId = location?.id ?? "";
  const minPages = Math.max(1, Math.min(16, book.minPages));
  const templates = Array.from({ length: minPages }, (_, index) => CYCLE[index % CYCLE.length]);
  const total = templates.reduce((sum, template) => sum + TEMPLATE_COUNTS[template], 0);
  const beats = beatsOf(book.story, total);
  const pages: PagePlan[] = [];
  const shots: Shot[] = [];
  let cursor = 0;
  const seen = new Set<string>();

  templates.forEach((template, pageIndex) => {
    const count = TEMPLATE_COUNTS[template];
    const pageNumber = pageIndex + 1;
    const shotIds: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const beat = beats[cursor] ?? `Beat ${cursor + 1}`;
      cursor += 1;
      const named = mentioned(beat, cast);
      named.forEach((member) => seen.add(member.id));
      let onPanel: CastMember[] = [];
      if (named.length >= 2) onPanel = named.slice(0, 2);
      else if (named.length === 1) onPanel = named;
      else if (template !== "splash" && index === 0 && seen.size >= 2) onPanel = cast.slice(0, 2);
      else onPanel = cast.slice(0, 1);

      const id = `p${String(pageNumber).padStart(2, "0")}s${String(index + 1).padStart(2, "0")}`;
      const camera = template === "splash" ? "wide" : CAMERAS[(pageIndex + index) % CAMERAS.length];
      const outfit: Record<string, string> = {};
      for (const member of onPanel) outfit[member.id] = member.outfit;
      const who = onPanel.map((member) => `${member.tags}, ${member.outfit}`).join(", ");
      const dialogue: Line[] = [];
      if (onPanel.length === 1 && beat.length < 90) {
        dialogue.push({ speaker: onPanel[0].id, kind: index % 5 === 0 ? "narration" : "speech", text: clip(beat, 78) });
      } else {
        dialogue.push({ speaker: "narration", kind: "narration", text: clip(beat, 78) });
      }
      const shot: Shot = {
        id,
        page: pageNumber,
        index,
        camera,
        cast: onPanel.map((member) => member.id),
        location: locationId,
        outfit,
        beat,
        prompt: [who, location?.notes, `${camera} shot`, beat, book.tone, "single comic panel, text free"]
          .filter(Boolean)
          .join(", "),
        negative: NEGATIVE,
        dialogue,
        status: "pending",
        attempts: 0,
        note: "",
        score: null,
        blockReason: "",
        painter: "none",
      };
      shots.push(shot);
      shotIds.push(id);
    }
    pages.push({ number: pageNumber, template, shotIds });
  });

  return { pages, shots };
}

export function withPlan(book: Book, source: string, at = Date.now()): Book {
  const planned = planShots(book);
  return {
    ...book,
    pages: planned.pages,
    shots: planned.shots,
    storyBreaks: [],
    overrideStory: false,
    updatedAt: at,
    log: [...book.log, { at, message: `Shot list drafted (${source}), ${planned.pages.length} pages` }].slice(-200),
  };
}
