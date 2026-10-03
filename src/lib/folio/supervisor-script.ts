export const SUPERVISOR_PY = `#!/usr/bin/env python3
"""Folio bench supervisor. Run this on the GPU machine.

    python3 folio-supervisor.py

Put folio-agents.json in the same folder. The desk calls
GET /health, GET /agents, POST /agents/<id>/start, POST /agents/<id>/stop.
Bind defaults to 0.0.0.0:8790. Override with FOLIO_SUPERVISOR_PORT.
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "folio-agents.json"
PORT = int(os.environ.get("FOLIO_SUPERVISOR_PORT", "8790"))
BIND = os.environ.get("FOLIO_SUPERVISOR_BIND", "0.0.0.0")
LOCK = threading.Lock()
PROCS: dict[str, subprocess.Popen] = {}


def load_agents() -> list[dict]:
    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    agents = data.get("agents", [])
    if not isinstance(agents, list):
        raise ValueError("folio-agents.json needs an agents list")
    return agents


def find_agent(agent_id: str) -> dict | None:
    for agent in load_agents():
        if agent.get("id") == agent_id:
            return agent
    return None


def running(agent_id: str) -> subprocess.Popen | None:
    proc = PROCS.get(agent_id)
    if proc is None:
        return None
    if proc.poll() is not None:
        PROCS.pop(agent_id, None)
        return None
    return proc


def start_agent(agent_id: str) -> tuple[int, dict]:
    agent = find_agent(agent_id)
    if agent is None:
        return 404, {"ok": False, "error": "unknown agent"}
    with LOCK:
        proc = running(agent_id)
        if proc is not None:
            return 200, {"ok": True, "state": "running", "pid": proc.pid}
        command = agent.get("command")
        if not isinstance(command, list) or not command or not all(isinstance(part, str) for part in command):
            return 400, {"ok": False, "error": "command must be a list of strings"}
        cwd = agent.get("cwd") or str(ROOT)
        proc = subprocess.Popen(command, cwd=cwd, start_new_session=True)
        PROCS[agent_id] = proc
        return 200, {"ok": True, "state": "running", "pid": proc.pid}


def stop_agent(agent_id: str) -> tuple[int, dict]:
    with LOCK:
        proc = running(agent_id)
        if proc is None:
            return 200, {"ok": True, "state": "stopped"}
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        PROCS.pop(agent_id, None)
        return 200, {"ok": True, "state": "stopped"}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send(204, {})

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self._send(200, {"ok": True, "service": "folio-supervisor"})
            return
        if path == "/agents":
            agents = []
            for agent in load_agents():
                proc = running(str(agent.get("id", "")))
                agents.append(
                    {
                        "id": agent.get("id"),
                        "name": agent.get("name", agent.get("id")),
                        "role": agent.get("role"),
                        "state": "running" if proc else "stopped",
                        "pid": proc.pid if proc else None,
                    }
                )
            self._send(200, {"agents": agents})
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        parts = [part for part in urlparse(self.path).path.split("/") if part]
        if len(parts) == 3 and parts[0] == "agents" and parts[2] in {"start", "stop"}:
            code, payload = start_agent(parts[1]) if parts[2] == "start" else stop_agent(parts[1])
            self._send(code, payload)
            return
        self._send(404, {"ok": False, "error": "not found"})


def main() -> None:
    if not CONFIG.exists():
        raise SystemExit(f"Missing {CONFIG.name} next to the supervisor")
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"Folio supervisor on {BIND}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
`;

export const AGENTS_JSON = `{
  "agents": [
    {
      "id": "comfy",
      "name": "Drawer",
      "role": "comfy",
      "cwd": "/path/to/ComfyUI",
      "command": ["python", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
    },
    {
      "id": "writer",
      "name": "Writer",
      "role": "writer",
      "cwd": "/path/to/models",
      "command": ["llama-server", "-m", "writer.gguf", "--host", "0.0.0.0", "--port", "11434"]
    },
    {
      "id": "story_critic",
      "name": "Story critic",
      "role": "story_critic",
      "cwd": "/path/to/models",
      "command": ["llama-server", "-m", "critic.gguf", "--host", "0.0.0.0", "--port", "11435"]
    },
    {
      "id": "vision_critic",
      "name": "Vision critic",
      "role": "vision_critic",
      "cwd": "/path/to/models",
      "command": ["llama-server", "-m", "vision.gguf", "--host", "0.0.0.0", "--port", "11436"]
    }
  ]
}
`;
