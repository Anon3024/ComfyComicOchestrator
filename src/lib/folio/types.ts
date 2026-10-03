export type ShotStatus =
  | "pending"
  | "generated"
  | "accepted"
  | "redo"
  | "needs_human"
  | "blocked";

export type Camera =
  | "wide"
  | "medium"
  | "close"
  | "extreme_close"
  | "over_shoulder"
  | "high"
  | "low";

export type Template =
  | "splash"
  | "stack_2"
  | "top_wide_two_small"
  | "grid_2x2"
  | "grid_3x2"
  | "blockage";

export type BalloonKind = "speech" | "thought" | "shout" | "whisper" | "narration" | "sfx";

export type ReadingOrder = "ltr" | "rtl";

export type AgentRole = "supervisor" | "comfy" | "writer" | "story_critic" | "vision_critic";

export type AgentMode = "remote" | "rehearse";

export interface CastMember {
  id: string;
  name: string;
  tags: string;
  outfit: string;
}

export interface Location {
  id: string;
  name: string;
  notes: string;
}

export interface Line {
  speaker: string;
  kind: BalloonKind;
  text: string;
}

export interface Scorecard {
  identity: number;
  wardrobe: number;
  anatomy: number;
  beatShown: boolean;
  extraPeople: boolean;
  selfCensored: boolean;
  note: string;
}

export interface Shot {
  id: string;
  page: number;
  index: number;
  camera: Camera;
  cast: string[];
  location: string;
  outfit: Record<string, string>;
  beat: string;
  prompt: string;
  negative: string;
  dialogue: Line[];
  status: ShotStatus;
  attempts: number;
  note: string;
  score: Scorecard | null;
  blockReason: string;
  painter: "none" | "rehearsal" | "remote";
}

export interface PagePlan {
  number: number;
  template: Template;
  shotIds: string[];
}

export interface LogLine {
  at: number;
  message: string;
}

export interface Book {
  id: string;
  title: string;
  story: string;
  tone: string;
  cast: CastMember[];
  locations: Location[];
  rules: string[];
  minPages: number;
  maxAttempts: number;
  readingOrder: ReadingOrder;
  pages: PagePlan[];
  shots: Shot[];
  log: LogLine[];
  storyBreaks: string[];
  overrideStory: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentSpec {
  id: string;
  role: AgentRole;
  name: string;
  blurb: string;
  port: number;
  mode: AgentMode;
  model: string;
}

export interface BenchConfig {
  host: string;
  scheme: "http" | "https";
  agents: AgentSpec[];
}

export type Reach = "unknown" | "online" | "offline";

export interface AgentRuntime {
  reach: Reach;
  process: "unknown" | "running" | "stopped";
  detail: string;
  checkedAt: number | null;
}

export interface Issue {
  shotId: string | null;
  code: string;
  message: string;
}

export const NEGATIVE =
  "text, speech bubble, watermark, signature, bar censor, mosaic, extra fingers, extra people";

export const CAMERAS: Camera[] = [
  "wide",
  "medium",
  "close",
  "extreme_close",
  "over_shoulder",
  "high",
  "low",
];

export const TEMPLATES: Template[] = [
  "splash",
  "stack_2",
  "top_wide_two_small",
  "grid_2x2",
  "grid_3x2",
  "blockage",
];

export function nid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function shotMap(book: Book): Map<string, Shot> {
  return new Map(book.shots.map((shot) => [shot.id, shot]));
}

export function statusLabel(status: ShotStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "generated":
      return "Generated";
    case "accepted":
      return "Accepted";
    case "redo":
      return "Redo";
    case "needs_human":
      return "Needs you";
    case "blocked":
      return "Dropped";
  }
}
