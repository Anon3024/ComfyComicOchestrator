import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Masthead, Shell } from "@/components/folio/chrome";
import { Button, Field, TextField } from "@/components/folio/fields";
import { controlAgent, probeAgent } from "@/lib/folio/press";
import { useDesk } from "@/lib/folio/store";
import { AGENTS_JSON, SUPERVISOR_PY } from "@/lib/folio/supervisor-script";
import type { AgentMode, AgentSpec } from "@/lib/folio/types";

export const Route = createFileRoute("/bench")({ component: BenchPage });

function BenchPage() {
  const bench = useDesk((state) => state.bench);
  const runtime = useDesk((state) => state.runtime);
  const [secure, setSecure] = useState(false);
  useEffect(() => {
    setSecure(location.protocol === "https:");
  }, []);

  return (
    <Shell>
      <Masthead href="/" label="Desk" />
      <h2 className="font-display text-4xl">The bench</h2>
      <p className="mt-3 max-w-xl text-muted">
        One address for the machine that runs the models. Ports differ. Start and Stop call a supervisor on that machine. Probe is enough if a service is already up.
      </p>
      {!bench.host && (
        <p className="mt-6 text-sm text-muted">No address yet. Rehearse still runs the whole press on this desk.</p>
      )}
      <div className="mt-8 flex flex-col gap-4 border border-fg/15 bg-surface p-4">
            <Field label="Bench address">
              <TextField
                value={bench.host}
                inputMode="decimal"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="192.168.1.20"
                onChange={(event) => useDesk.getState().setHost(event.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button tone={bench.scheme === "http" ? "solid" : "line"} onClick={() => useDesk.getState().setScheme("http")}>
                http
              </Button>
              <Button tone={bench.scheme === "https" ? "solid" : "line"} onClick={() => useDesk.getState().setScheme("https")}>
                https
              </Button>
            </div>
            {secure && bench.scheme === "http" && (
              <p className="text-sm text-muted">
                This page is secure, so the browser may block a plain http address on your network. Use https on the bench, or leave the agents on rehearse.
              </p>
            )}
          </div>
          <div className="mt-4">
            <Button
              tone="line"
              onClick={() => {
                for (const agent of bench.agents) void probeAgent(agent.id);
              }}
            >
              Probe all
            </Button>
          </div>
          <ul className="mt-6 flex flex-col gap-3">
            {bench.agents.map((agent) => (
              <li key={agent.id}>
                <AgentCard agent={agent} detail={runtime[agent.id]?.detail ?? "Not checked"} reach={runtime[agent.id]?.reach ?? "unknown"} process={runtime[agent.id]?.process ?? "unknown"} />
              </li>
            ))}
          </ul>
          <section className="mt-10">
            <h3 className="font-display text-2xl">Supervisor</h3>
            <p className="mt-2 text-sm text-muted">
              Save both files on the GPU machine, edit the commands, then run <span className="text-fg">python3 folio-supervisor.py</span>. The ids must stay comfy, writer, story_critic, and vision_critic.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button tone="line" onClick={() => download("folio-supervisor.py", SUPERVISOR_PY, "text/x-python")}>
                Download supervisor
              </Button>
              <Button tone="line" onClick={() => download("folio-agents.json", AGENTS_JSON, "application/json")}>
                Download agent list
              </Button>
            </div>
          </section>
    </Shell>
  );
}

function AgentCard({
  agent,
  detail,
  reach,
  process,
}: {
  agent: AgentSpec;
  detail: string;
  reach: string;
  process: string;
}) {
  const showModel = agent.role === "writer" || agent.role === "story_critic" || agent.role === "vision_critic";
  return (
    <article className="border border-fg/15 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl">{agent.name}</h3>
          <p className="mt-1 text-sm text-muted">{agent.blurb}</p>
        </div>
        <p className="text-right text-sm tabular-nums">
          <span className={reach === "online" ? "text-fg" : "text-muted"}>{reach}</span>
          {agent.role !== "supervisor" && <span className="block text-muted">{process}</span>}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Port">
          <TextField
            type="number"
            min={1}
            max={65535}
            value={agent.port}
            onChange={(event) => useDesk.getState().patchAgent(agent.id, { port: Number(event.target.value) })}
          />
        </Field>
        {showModel && (
          <Field label="Model name">
            <TextField
              value={agent.model}
              onChange={(event) => useDesk.getState().patchAgent(agent.id, { model: event.target.value })}
            />
          </Field>
        )}
      </div>
      {agent.role !== "supervisor" && (
        <div className="mt-4 flex gap-2">
          <ModeButton agentId={agent.id} mode={agent.mode} value="rehearse" label="Rehearse" />
          <ModeButton agentId={agent.id} mode={agent.mode} value="remote" label="On the bench" />
        </div>
      )}
      <p className="mt-3 text-sm text-muted">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone="line" onClick={() => void probeAgent(agent.id)}>
          Probe
        </Button>
        {agent.role !== "supervisor" && (
          <>
            <Button onClick={() => void controlAgent(agent.id, "start")}>Start</Button>
            <Button tone="line" onClick={() => void controlAgent(agent.id, "stop")}>
              Stop
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function ModeButton({
  agentId,
  mode,
  value,
  label,
}: {
  agentId: string;
  mode: AgentMode;
  value: AgentMode;
  label: string;
}) {
  return (
    <Button tone={mode === value ? "solid" : "line"} onClick={() => useDesk.getState().patchAgent(agentId, { mode: value })}>
      {label}
    </Button>
  );
}

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
