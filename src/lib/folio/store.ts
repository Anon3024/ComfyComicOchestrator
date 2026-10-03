import { create } from "zustand";
import { persist } from "zustand/middleware";
import { makeSample } from "./sample.ts";
import type { AgentMode, AgentRole, AgentRuntime, AgentSpec, BenchConfig, Book } from "./types";

function agent(
  id: string,
  role: AgentRole,
  name: string,
  blurb: string,
  port: number,
  model = "",
): AgentSpec {
  return { id, role, name, blurb, port, mode: "rehearse", model };
}

export function defaultBench(): BenchConfig {
  return {
    host: "",
    scheme: "http",
    agents: [
      agent("supervisor", "supervisor", "Supervisor", "Start and stop the others. Leave this running on the bench.", 8790),
      agent("comfy", "comfy", "Drawer", "ComfyUI. Text-free panels only.", 8188),
      agent("writer", "writer", "Writer", "Shot list from the story and the page minimum.", 11434, "local"),
      agent("story_critic", "story_critic", "Story critic", "World rules only. It does not rewrite.", 11435, "local"),
      agent("vision_critic", "vision_critic", "Vision critic", "Scorecard on the panel. It does not set status.", 11436, "local"),
    ],
  };
}

interface Desk {
  books: Book[];
  bench: BenchConfig;
  runtime: Record<string, AgentRuntime>;
  runningId: string | null;
  saveBook: (book: Book) => void;
  createBook: (book: Book) => void;
  deleteBook: (id: string) => void;
  setHost: (host: string) => void;
  setScheme: (scheme: "http" | "https") => void;
  patchAgent: (id: string, patch: Partial<Pick<AgentSpec, "port" | "mode" | "model">>) => void;
  setRuntime: (id: string, runtime: AgentRuntime) => void;
  setRunning: (id: string | null) => void;
  ensureSeed: () => void;
}

export const useDesk = create<Desk>()(
  persist(
    (set, get) => ({
      books: [makeSample(1_700_000_000_000)],
      bench: defaultBench(),
      runtime: {},
      runningId: null,
      saveBook: (book) =>
        set({
          books: get().books.map((item) => (item.id === book.id ? { ...book, updatedAt: Date.now() } : item)),
        }),
      createBook: (book) => set({ books: [book, ...get().books] }),
      deleteBook: (id) => set({ books: get().books.filter((book) => book.id !== id) }),
      setHost: (host) => set({ bench: { ...get().bench, host } }),
      setScheme: (scheme) => set({ bench: { ...get().bench, scheme } }),
      patchAgent: (id, patch) =>
        set({
          bench: {
            ...get().bench,
            agents: get().bench.agents.map((item) => (item.id === id ? { ...item, ...patch } : item)),
          },
        }),
      setRuntime: (id, runtime) => set({ runtime: { ...get().runtime, [id]: runtime } }),
      setRunning: (id) => set({ runningId: id }),
      ensureSeed: () => {
        if (get().books.length > 0) return;
        try {
          if (localStorage.getItem("folio-desk")) return;
        } catch {
          /* private mode */
        }
        set({ books: [makeSample()] });
      },
    }),
    {
      name: "folio-desk",
      skipHydration: true,
      partialize: (state) => ({ books: state.books, bench: state.bench }),
    },
  ),
);

export function useHydratedDesk() {
  return useDesk;
}

export type { AgentMode };
