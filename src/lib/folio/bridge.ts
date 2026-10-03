import type { AgentSpec, BenchConfig } from "./types";

export function agentOrigin(bench: BenchConfig, agent: AgentSpec): string | null {
  const host = bench.host.trim();
  if (!host) return null;
  return `${bench.scheme}://${host}:${agent.port}`;
}

export function healthPaths(agent: AgentSpec): string[] {
  if (agent.role === "supervisor") return ["/health"];
  if (agent.role === "comfy") return ["/system_stats"];
  return ["/v1/models", "/health"];
}

export interface BenchResult {
  ok: boolean;
  status: number;
  text: string;
  via: "direct" | "proxy" | "none";
  error: string;
}

export async function benchCall(input: {
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
}): Promise<BenchResult> {
  const method = input.method ?? "GET";
  const timeoutMs = input.timeoutMs ?? 4000;
  const securePage = typeof location !== "undefined" && location.protocol === "https:";
  const plain = input.url.startsWith("http://");
  if (!(securePage && plain)) {
    const direct = await attempt(input.url, method, input.body, timeoutMs);
    if (direct) return direct;
  }
  try {
    const res = await fetch("/api/bridge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: input.url,
        method,
        body: input.body,
        timeoutMs,
      }),
    });
    const payload = (await res.json()) as BenchResult;
    return payload;
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      via: "none",
      error: error instanceof Error ? error.message : "Bridge failed",
    };
  }
}

async function attempt(
  url: string,
  method: "GET" | "POST",
  body: unknown,
  timeoutMs: number,
): Promise<BenchResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      mode: "cors",
      signal: ctrl.signal,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, via: "direct", error: res.ok ? "" : text.slice(0, 180) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
