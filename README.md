# Folio

Folio is the desk for a local comic. The book stays in the browser. The models stay on another machine, reached by address.

A book opens with a sample already on the desk: **Platform Rain**, four pages, two people, no contact. Rehearse mode runs the whole press without a GPU. Switch an agent to **On the bench** only when that service answers.

## Run the desk

```sh
npm install
npm run dev
```

The desk listens on port 8080. Books and the bench address are stored in this browser (`localStorage` key `folio-desk`). Panel images are stored in IndexedDB on this browser. Clearing site data clears the book.

## The book

Open a book from the desk. Four tabs:

| Tab | What it holds |
|---|---|
| Brief | Story, tone, cast, places, rules, page minimum, reading order. **Draft shot list** asks the writer, or the local planner when the writer is on rehearse. |
| Shots | One row per panel. Status is pending, generated, accepted, redo, needs you, or dropped. |
| Press | **Run the press.** The log is the record. Accept or retry anything that stops on you. |
| Pages | Lettered or text-free sheets. **Download lettered PDF** when a page is ready. |

A shot is not accepted because it was drawn. The code critic runs first. Unknown cast is dropped before the drawer is called. A scorecard has to clear the line: identity at least 4, wardrobe at least 4, anatomy at least 3, the beat shown, no extra people, and not self-censored. Under the line, the shot is redone until the book's attempt limit, then it waits for you.

Story breaks hold the press. **Run anyway, do not rewrite** continues without changing the shot list.

## The bench

The bench is the other machine. Set its address (for example `192.168.1.20`) and http or https. Each agent has its own port. **Probe** checks that a process answers. **Start** and **Stop** are sent to the supervisor, which is the only process you leave running.

Default ports:

| Agent | Port | Probe | What the desk sends |
|---|---|---|---|
| Supervisor | 8790 | `GET /health` | `POST /agents/<id>/start` and `/stop` |
| Drawer | 8188 | `GET /system_stats` | `POST /folio/draw` |
| Writer | 11434 | `GET /v1/models` | `POST /v1/chat/completions` |
| Story critic | 11435 | `GET /v1/models` | `POST /v1/chat/completions` |
| Vision critic | 11436 | `GET /v1/models` | `POST /v1/chat/completions` |

Writer, story critic, and vision critic are OpenAI-compatible chat endpoints. The model name on the card is the `model` field. The writer must return JSON with at least the page minimum. The story critic returns `{ "breaks": [] }` or a list of rule breaks. The vision critic returns a scorecard: `identity`, `wardrobe`, `anatomy` (1–5), `beatShown`, `extraPeople`, `selfCensored`, and `note`.

The drawer is not the ComfyUI prompt queue. ComfyUI's `/system_stats` is only the probe. Drawing posts to `/folio/draw` with `id`, `prompt`, `negative`, `camera`, `cast`, `width` (832), and `height` (1216). The answer must be JSON: `{ "image": "<base64 or data URL>" }`. Put a small adapter in front of ComfyUI if that route does not exist yet. Without it, leave the drawer on rehearse.

If this page is https and the bench is plain http, the browser may block the call. Use https on the bench, or leave the agents on rehearse. The desk also tries its own `/api/bridge` proxy. That proxy refuses localhost and link-local addresses.

## Supervisor

On the GPU machine, download both files from the bench page, or copy them from the app. Put them in the same folder, edit the commands, and run:

```sh
python3 folio-supervisor.py
```

`folio-agents.json` lists the processes. The ids must stay `comfy`, `writer`, `story_critic`, and `vision_critic`. The supervisor binds `0.0.0.0:8790`. Override with `FOLIO_SUPERVISOR_PORT` and `FOLIO_SUPERVISOR_BIND`.

It answers:

- `GET /health`
- `GET /agents`
- `POST /agents/<id>/start`
- `POST /agents/<id>/stop`

Start launches the command in `folio-agents.json`. Stop sends SIGTERM to that process group. The supervisor does not speak the model protocols. Those services do.

## Layout

```
src/lib/folio/     book, critic, planner, press loop, layout, lettering, PDF
src/routes/        desk, book, bench
src/components/folio/
```

`npm run typecheck` checks the types. The press loop tests live in `src/lib/folio/orchestrator.test.ts`:

```sh
node --experimental-strip-types --test src/lib/folio/orchestrator.test.ts
```
