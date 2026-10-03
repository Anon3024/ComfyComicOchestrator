import { TEMPLATE_COUNTS } from "./layout.ts";
import type { BalloonKind, Book, Camera, PagePlan, Shot, Template } from "./types";
import { CAMERAS, NEGATIVE, TEMPLATES } from "./types.ts";

const KINDS: BalloonKind[] = ["speech", "thought", "shout", "whisper", "narration", "sfx"];

export function textFromChat(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: { message?: { content?: unknown } }[] }).choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
      .join("\n");
  }
  return "";
}

export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

function asTemplate(value: unknown): Template {
  return TEMPLATES.includes(value as Template) ? (value as Template) : "splash";
}

function asCamera(value: unknown): Camera {
  return CAMERAS.includes(value as Camera) ? (value as Camera) : "medium";
}

function castId(book: Book, name: string): string {
  const found = book.cast.find((member) => member.name.toLowerCase() === name.toLowerCase() || member.id === name);
  return found?.id ?? name.trim();
}

export function planFromWriter(book: Book, text: string): { pages: PagePlan[]; shots: Shot[] } {
  const raw = extractJson(text) as {
    pages?: {
      template?: unknown;
      shots?: {
        camera?: unknown;
        cast?: unknown;
        beat?: unknown;
        prompt?: unknown;
        dialogue?: { speaker?: unknown; kind?: unknown; text?: unknown }[];
      }[];
    }[];
  };
  if (!raw.pages || raw.pages.length < book.minPages) {
    throw new Error(`Writer returned ${raw.pages?.length ?? 0} pages, minimum is ${book.minPages}`);
  }
  const pages: PagePlan[] = [];
  const shots: Shot[] = [];
  raw.pages.slice(0, 16).forEach((page, pageIndex) => {
    const template = asTemplate(page.template);
    const wanted = TEMPLATE_COUNTS[template];
    const incoming = (page.shots ?? []).slice(0, wanted);
    while (incoming.length < wanted) incoming.push({ beat: "Held beat" });
    const pageNumber = pageIndex + 1;
    const shotIds: string[] = [];
    incoming.forEach((item, index) => {
      const names = Array.isArray(item.cast) ? item.cast.map(String) : [];
      const cast = names.map((name) => castId(book, name)).filter(Boolean).slice(0, 2);
      const id = `p${String(pageNumber).padStart(2, "0")}s${String(index + 1).padStart(2, "0")}`;
      const outfit: Record<string, string> = {};
      for (const memberId of cast) {
        const member = book.cast.find((person) => person.id === memberId);
        if (member) outfit[memberId] = member.outfit;
      }
      const dialogue = (item.dialogue ?? []).slice(0, 3).map((line) => {
        const kind = KINDS.includes(line.kind as BalloonKind) ? (line.kind as BalloonKind) : "speech";
        const speakerName = String(line.speaker ?? "");
        const speaker = kind === "narration" || kind === "sfx" ? "narration" : castId(book, speakerName);
        return { speaker, kind, text: String(line.text ?? "").slice(0, 90) };
      });
      const beat = String(item.beat ?? "").slice(0, 280);
      const shot: Shot = {
        id,
        page: pageNumber,
        index,
        camera: asCamera(item.camera),
        cast,
        location: book.locations[0]?.id ?? "",
        outfit,
        beat,
        prompt: String(item.prompt ?? beat).slice(0, 500),
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
    });
    pages.push({ number: pageNumber, template, shotIds });
  });
  return { pages, shots };
}

export function writerMessages(book: Book) {
  return [
    {
      role: "system" as const,
      content:
        "You plan a comic shot list. Return JSON only. Do not invent cast. Do not write draw-in text. " +
        "Templates: splash (1), stack_2 (2), top_wide_two_small (3), grid_2x2 (4), grid_3x2 (6), blockage (3). " +
        "One hero panel per page, and it is the first shot. Keep lines under 80 characters.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        title: book.title,
        minPages: book.minPages,
        tone: book.tone,
        readingOrder: book.readingOrder,
        cast: book.cast.map((member) => ({ name: member.name, tags: member.tags, outfit: member.outfit })),
        locations: book.locations,
        rules: book.rules,
        story: book.story,
        shape: {
          pages: [
            {
              template: "splash",
              shots: [
                {
                  camera: "wide",
                  cast: ["Name"],
                  beat: "",
                  prompt: "",
                  dialogue: [{ speaker: "Name", kind: "speech", text: "" }],
                },
              ],
            },
          ],
        },
      }),
    },
  ];
}

export function storyMessages(book: Book) {
  return [
    {
      role: "system" as const,
      content:
        "You are the story critic. You do not rewrite. Return JSON only: {\"breaks\":[\"...\"]}. " +
        "List a break only when a shot violates a world rule. Empty breaks means pass.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        rules: book.rules,
        cast: book.cast,
        shots: book.shots.map((shot) => ({
          id: shot.id,
          beat: shot.beat,
          cast: shot.cast,
          prompt: shot.prompt,
          dialogue: shot.dialogue,
        })),
      }),
    },
  ];
}

export function scoreMessages(shot: Shot, imageUrl: string | null) {
  const instruction =
    "Score this comic panel. Return JSON only with keys identity, wardrobe, anatomy (integers 1-5), " +
    "beatShown, extraPeople, selfCensored (booleans), note (one sentence). " +
    "Fail selfCensored when the picture hides the act the beat asked for.";
  const content: unknown[] = [{ type: "text", text: `${instruction}\nBeat: ${shot.beat}\nCast: ${shot.cast.join(", ")}\nPrompt: ${shot.prompt}` }];
  if (imageUrl) content.push({ type: "image_url", image_url: { url: imageUrl } });
  return [{ role: "user" as const, content }];
}

export function parseScore(text: string) {
  const raw = extractJson(text) as Partial<{
    identity: number;
    wardrobe: number;
    anatomy: number;
    beatShown: boolean;
    extraPeople: boolean;
    selfCensored: boolean;
    note: string;
  }>;
  return {
    identity: clamp(raw.identity),
    wardrobe: clamp(raw.wardrobe),
    anatomy: clamp(raw.anatomy),
    beatShown: Boolean(raw.beatShown),
    extraPeople: Boolean(raw.extraPeople),
    selfCensored: Boolean(raw.selfCensored),
    note: String(raw.note ?? "").slice(0, 180),
  };
}

function clamp(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(5, Math.round(number)));
}

export function imageFromDraw(text: string): string | null {
  try {
    const raw = JSON.parse(text) as { image?: string };
    if (!raw.image) return null;
    if (raw.image.startsWith("data:")) return raw.image;
    return `data:image/png;base64,${raw.image}`;
  } catch {
    return null;
  }
}
