import { withPlan } from "./planner.ts";
import type { Book } from "./types";

export function blankBook(partial: Partial<Book> & Pick<Book, "id" | "title">): Book {
  const now = partial.createdAt ?? Date.now();
  return {
    story: "",
    tone: "",
    cast: [],
    locations: [],
    rules: [],
    minPages: 8,
    maxAttempts: 2,
    readingOrder: "ltr",
    pages: [],
    shots: [],
    log: [],
    storyBreaks: [],
    overrideStory: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function makeSample(now = Date.now()): Book {
  const book = blankBook({
    id: "platform-rain",
    title: "Platform Rain",
    createdAt: now,
    updatedAt: now,
    minPages: 4,
    maxAttempts: 2,
    tone: "quiet, cold, close",
    story:
      "Ivo waits under the only lamp on the platform. The train is late, and the rain has nowhere to go. " +
      "Headlights wash the concrete. Ivo turns, coat dark with water. " +
      "Nen steps down from the last carriage, glasses fogged, and stops a pace away. Ivo almost speaks. Nen speaks first. " +
      "They talk about the timetable and nothing else. The lamp buzzes. When the train leaves, their hands stay in their pockets.",
    cast: [
      {
        id: "ivo",
        name: "Ivo",
        tags: "narrow face, ash hair, tired eyes",
        outfit: "charcoal coat, one brass button",
      },
      {
        id: "nen",
        name: "Nen",
        tags: "black bob, round glasses",
        outfit: "cream raincoat",
      },
    ],
    locations: [
      {
        id: "platform",
        name: "Platform",
        notes: "outdoor night platform, wet concrete, one lamp",
      },
    ],
    rules: ["They do not touch."],
  });
  return withPlan(book, "the sample");
}
