import { agentOrigin, benchCall, healthPaths } from "./bridge.ts";
import { pageReady, storyLedgerBreaks } from "./critic.ts";
import {
  extractJson,
  imageFromDraw,
  parseScore,
  planFromWriter,
  scoreMessages,
  storyMessages,
  textFromChat,
  writerMessages,
} from "./model.ts";
import {
  applyScorecard,
  dropShot,
  log,
  markGenerated,
  markUnscored,
  nextAction,
  setStoryBreaks,
} from "./orchestrator.ts";
import { getPanel, putPanel } from "./panels.ts";
import { withPlan } from "./planner.ts";
import { rehearsalScore, paintPanel } from "./standin.ts";
import { useDesk } from "./store.ts";
import type { AgentRuntime, AgentSpec, Book, Shot } from "./types";

let stopFlag = false;

export function requestStop() {
  stopFlag = true;
}

function current(id: string): Book | undefined {
  return useDesk.getState().books.find((book) => book.id === id);
}

function save(book: Book) {
  useDesk.getState().saveBook(book);
}

function sleep() {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => setTimeout(resolve, reduce ? 0 : 50));
}

export async function probeAgent(agentId: string) {
  const desk = useDesk.getState();
  const agent = desk.bench.agents.find((item) => item.id === agentId);
  if (!agent) return;
  const previous = desk.runtime[agentId];
  const origin = agentOrigin(desk.bench, agent);
  if (!origin) {
    desk.setRuntime(agentId, {
      reach: "offline",
      process: previous?.process ?? "unknown",
      detail: "Set the bench address",
      checkedAt: Date.now(),
    });
    return;
  }
  let last = "No answer";
  for (const path of healthPaths(agent)) {
    const res = await benchCall({ url: `${origin}${path}`, timeoutMs: 4000 });
    if (res.ok) {
      desk.setRuntime(agentId, {
        reach: "online",
        process: previous?.process ?? "unknown",
        detail: `Online · ${path}`,
        checkedAt: Date.now(),
      });
      return;
    }
    last = res.error || `HTTP ${res.status || "down"}`;
  }
  desk.setRuntime(agentId, {
    reach: "offline",
    process: previous?.process ?? "unknown",
    detail: last,
    checkedAt: Date.now(),
  });
}

export async function controlAgent(agentId: string, op: "start" | "stop") {
  const desk = useDesk.getState();
  const supervisor = desk.bench.agents.find((item) => item.role === "supervisor");
  const previous: AgentRuntime = desk.runtime[agentId] ?? {
    reach: "unknown",
    process: "unknown",
    detail: "",
    checkedAt: null,
  };
  const origin = supervisor ? agentOrigin(desk.bench, supervisor) : null;
  if (!origin) {
    desk.setRuntime(agentId, { ...previous, detail: "Set the bench address. Start and Stop call the supervisor." });
    return;
  }
  const res = await benchCall({
    url: `${origin}/agents/${agentId}/${op}`,
    method: "POST",
    body: {},
    timeoutMs: 8000,
  });
  if (!res.ok) {
    desk.setRuntime(agentId, {
      ...previous,
      detail: res.error || "Supervisor did not answer",
      checkedAt: Date.now(),
    });
    return;
  }
  desk.setRuntime(agentId, {
    ...previous,
    process: op === "start" ? "running" : "stopped",
    detail: op === "start" ? "Start sent" : "Stop sent",
    checkedAt: Date.now(),
  });
  await probeAgent(agentId);
}

export async function draftBook(id: string) {
  const desk = useDesk.getState();
  const book = current(id);
  const writer = desk.bench.agents.find((item) => item.role === "writer");
  if (!book || !writer) return;
  if (writer.mode === "rehearse") {
    save(withPlan(book, "rehearsal"));
    return;
  }
  const origin = agentOrigin(desk.bench, writer);
  if (!origin || desk.runtime[writer.id]?.reach !== "online") {
    save(log(book, "Writer is not reachable. Probe it on the bench, or switch it to rehearse."));
    return;
  }
  save(log(book, "Asking the writer…"));
  const res = await benchCall({
    url: `${origin}/v1/chat/completions`,
    method: "POST",
    timeoutMs: 90_000,
    body: { model: writer.model || "local", temperature: 0.4, messages: writerMessages(book) },
  });
  const fresh = current(id) ?? book;
  if (!res.ok) {
    save(log(fresh, `Writer failed — ${res.error || res.status}`));
    return;
  }
  try {
    const planned = planFromWriter(fresh, textFromChat(JSON.parse(res.text)));
    save(
      log(
        { ...fresh, pages: planned.pages, shots: planned.shots, storyBreaks: [], overrideStory: false },
        "Shot list drafted (writer). Unknown names will be dropped before the drawer.",
      ),
    );
  } catch (error) {
    save(log(fresh, error instanceof Error ? error.message : "Writer JSON was unusable. Shot list kept."));
  }
}

async function storyCheck(book: Book, critic: AgentSpec | undefined): Promise<string[]> {
  if (!critic || critic.mode === "rehearse") return storyLedgerBreaks(book);
  const origin = agentOrigin(useDesk.getState().bench, critic);
  const reach = useDesk.getState().runtime[critic.id]?.reach;
  if (!origin || reach !== "online") {
    throw new Error("Story critic is not reachable. Probe it, or switch it to rehearse.");
  }
  const res = await benchCall({
    url: `${origin}/v1/chat/completions`,
    method: "POST",
    timeoutMs: 90_000,
    body: { model: critic.model || "local", temperature: 0.1, messages: storyMessages(book) },
  });
  if (!res.ok) throw new Error(res.error || "Story critic failed");
  let payload: unknown;
  try {
    payload = JSON.parse(res.text);
  } catch {
    throw new Error("Story critic returned junk");
  }
  const text = textFromChat(payload) || res.text;
  const parsed = extractJson(text) as { breaks?: unknown };
  return Array.isArray(parsed.breaks) ? parsed.breaks.map(String).slice(0, 12) : [];
}

async function drawShot(shot: Shot): Promise<{ painter: "rehearsal" | "remote" } | { error: string }> {
  const desk = useDesk.getState();
  const drawer = desk.bench.agents.find((item) => item.role === "comfy");
  if (!drawer || drawer.mode === "rehearse") return { painter: "rehearsal" };
  const origin = agentOrigin(desk.bench, drawer);
  if (!origin || desk.runtime[drawer.id]?.reach !== "online") {
    return { error: "Drawer is not reachable. Probe ComfyUI, or switch it to rehearse." };
  }
  const res = await benchCall({
    url: `${origin}/folio/draw`,
    method: "POST",
    timeoutMs: 120_000,
    body: {
      id: shot.id,
      prompt: shot.prompt,
      negative: shot.negative,
      camera: shot.camera,
      cast: shot.cast,
      width: 832,
      height: 1216,
    },
  });
  if (!res.ok) return { error: res.error || `Drawer returned ${res.status}` };
  const image = imageFromDraw(res.text);
  if (!image) return { error: "Drawer answered without an image. It needs a /folio/draw adapter." };
  await putPanel(shot.id, image);
  return { painter: "remote" };
}

async function scoreShot(shot: Shot): Promise<{ card: ReturnType<typeof rehearsalScore> } | { error: string }> {
  const desk = useDesk.getState();
  const critic = desk.bench.agents.find((item) => item.role === "vision_critic");
  if (!critic || critic.mode === "rehearse") return { card: rehearsalScore(shot, shot.attempts) };
  const origin = agentOrigin(desk.bench, critic);
  if (!origin || desk.runtime[critic.id]?.reach !== "online") {
    return { error: "Vision critic is not reachable. Probe it, or switch it to rehearse." };
  }
  const image =
    shot.painter === "remote"
      ? await panelUrl(shot.id)
      : typeof document === "undefined"
        ? null
        : paintPanel(shot, Math.max(1, shot.attempts), 480, 720).toDataURL("image/jpeg", 0.72);
  const res = await benchCall({
    url: `${origin}/v1/chat/completions`,
    method: "POST",
    timeoutMs: 90_000,
    body: {
      model: critic.model || "local",
      temperature: 0.1,
      messages: scoreMessages(shot, image),
    },
  });
  if (!res.ok) return { error: res.error || "Vision critic failed" };
  try {
    return { card: parseScore(textFromChat(JSON.parse(res.text))) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Scorecard was unusable" };
  }
}

async function panelUrl(shotId: string): Promise<string | null> {
  return getPanel(shotId);
}

export async function runPress(id: string) {
  if (useDesk.getState().runningId) return;
  stopFlag = false;
  useDesk.getState().setRunning(id);
  try {
    let book: Book | undefined = current(id);
    if (!book) return;
    if (book.pages.length === 0) {
      save(log(book, "Draft a shot list first"));
      return;
    }
    const critic = useDesk.getState().bench.agents.find((item) => item.role === "story_critic");
    if (!book.overrideStory) {
      try {
        const breaks = await storyCheck(book, critic);
        book = setStoryBreaks(book, breaks);
        save(book);
        if (breaks.length > 0) return;
      } catch (error) {
        save(log(book, error instanceof Error ? error.message : "Story critic failed"));
        return;
      }
    }
    let guard = 0;
    while (!stopFlag && guard < 400) {
      guard += 1;
      const action = nextAction(book);
      if (action.type === "idle" || action.type === "story_hold") break;
      if (action.type === "hold") {
        book = log(book, action.issues[0]?.message ?? "Held by the code critic");
        save(book);
        break;
      }
      if (action.type === "drop") {
        book = dropShot(book, action.shotId, action.reason);
        save(book);
        continue;
      }
      if (action.type === "draw") {
        const drawing: Shot | undefined = book.shots.find((item) => item.id === action.shotId);
        if (!drawing) break;
        const drawn = await drawShot(drawing);
        if ("error" in drawn) {
          book = log(book, drawn.error);
          save(book);
          break;
        }
        book = markGenerated(book, drawing.id, drawn.painter);
        save(book);
      }
      if (action.type === "score") {
        const printed: Shot | undefined = book.shots.find((item) => item.id === action.shotId);
        if (!printed) break;
        const scored = await scoreShot(printed);
        book = "error" in scored ? markUnscored(book, printed.id, scored.error) : applyScorecard(book, printed.id, scored.card);
        save(book);
      }
      book = current(id) ?? book;
      await sleep();
    }
    book = current(id) ?? book;
    if (stopFlag) save(log(book, "Press stopped"));
    else if (nextAction(book).type === "idle") {
      const ready = book.pages.filter((page) => pageReady(book, page.number)).length;
      save(log(book, `Press idle — ${ready} ${ready === 1 ? "page" : "pages"} ready to assemble`));
    }
  } finally {
    useDesk.getState().setRunning(null);
  }
}
