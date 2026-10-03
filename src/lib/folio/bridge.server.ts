import { z } from "zod";

const PATHS = [
  /^\/health$/,
  /^\/agents$/,
  /^\/agents\/[a-z0-9_-]+\/(start|stop)$/,
  /^\/system_stats$/,
  /^\/v1\/models$/,
  /^\/v1\/chat\/completions$/,
  /^\/folio\/(draw|score|plan|dialogue)$/,
];

const bodySchema = z.object({
  url: z.string().min(1).max(500),
  method: z.enum(["GET", "POST"]).default("GET"),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().min(500).max(120_000).default(4000),
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function blockedHost(hostname: string): string | null {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1") {
    return "That address is this machine, not the bench";
  }
  if (host === "metadata.google.internal" || host === "169.254.169.254") {
    return "That address is blocked";
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return "Address is not valid";
    const [a, b] = parts;
    if (a === 127 || a === 0 || (a === 169 && b === 254)) return "That address is blocked";
  }
  return null;
}

export async function handleBridge(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, status: 405, text: "", via: "proxy", error: "POST only" }, 405);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, status: 400, text: "", via: "proxy", error: "Invalid JSON" }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ ok: false, status: 400, text: "", via: "proxy", error: "Invalid request" }, 400);
  let target: URL;
  try {
    target = new URL(parsed.data.url);
  } catch {
    return json({ ok: false, status: 400, text: "", via: "proxy", error: "Address is not a URL" }, 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return json({ ok: false, status: 400, text: "", via: "proxy", error: "Only http and https" }, 400);
  }
  const hostBlock = blockedHost(target.hostname);
  if (hostBlock) return json({ ok: false, status: 400, text: "", via: "proxy", error: hostBlock }, 400);
  if (!PATHS.some((pattern) => pattern.test(target.pathname))) {
    return json({ ok: false, status: 400, text: "", via: "proxy", error: "That path is not part of the bench" }, 400);
  }
  const payload = parsed.data.body === undefined ? undefined : JSON.stringify(parsed.data.body);
  if (payload && payload.length > 1_500_000) {
    return json({ ok: false, status: 413, text: "", via: "proxy", error: "Request is too large" }, 413);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), parsed.data.timeoutMs);
  try {
    const res = await fetch(target, {
      method: parsed.data.method,
      redirect: "manual",
      signal: ctrl.signal,
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: parsed.data.method === "POST" ? payload ?? "{}" : undefined,
    });
    const text = await res.text();
    const clipped = text.length > 2_000_000 ? text.slice(0, 2_000_000) : text;
    return json({
      ok: res.ok,
      status: res.status,
      text: clipped,
      via: "proxy",
      error: res.ok ? "" : clipped.slice(0, 180),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unreachable";
    return json({ ok: false, status: 0, text: "", via: "proxy", error: message });
  } finally {
    clearTimeout(timer);
  }
}
