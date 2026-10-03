# Local comic pipeline — conversation summary

Planning notes from a design conversation about a local, minimally censored comic / doujin generator, plus the early code starter that came out of it. Dates are conversation time, not a release.

## Goal

A pipeline close to rfab.ai's comic feature, run as locally as possible, on an existing ComfyUI machine (RTX 4090, 24 GB):

1. Story / world analysis
2. Scene / shot planning, with a minimum page count
3. Image generation, with an agent-style director keeping characters, tone, and world rules consistent
4. Dialogue / text creation
5. Dialogue injection
6. Page assembly (added during planning)
7. Any repair passes needed to keep identity and continuity

NovelAI's image API is an optional alternative renderer, not a replacement for the whole system.

## Feasibility

Realistic as a local production pipeline for a short book. Not realistic as an unsupervised 40-page multi-cast doujin.

- Solved well enough for v1: story and world analysis, shot lists, single-character identity if the checkpoint never changes, lettering if the image model does not draw text, minimum page count as a planning constraint.
- Still hard: two distinct people in one explicit panel, prop and location continuity, drift after about 8–15 pages, comic pacing unless the planner is given a shot grammar.
- Sensible v1: 8–16 pages, one or two recurring characters, human review at page boundaries.

rfab's advantage is structure plus a repair loop, not a secret image model. Their default engine for this kind of work is WAI-NSFW Illustrious. Tag engines clone faces when two people share a frame, so they switch engines for multi-figure shots. Scripting falls back across models when one refuses.

## Pipeline

```
world.json + story.md
  -> story / world analysis     bible.json
  -> shot planning              shotlist.json (pages, camera, cast, continuity)
  -> identity lock              character sheets, tags, optional LoRAs
  -> image generation           text-free panels
  -> visual QA                  accept | redo | needs_human
  -> page assembly              layout tree, gutters, art page
  -> dialogue                   lines written against real panel boxes
  -> lettering                  overlay, text-free twin kept
  -> export                     lettered PNG + PDF
```

Generate isolated panels, slightly larger than the target box, and crop at assembly. Do not ask the image model to draw gutters, page numbers, or bubbles.

Page layout is a tree of row/column splits, not freeform polygons. v1 templates: splash, stack_2, top_wide_two_small, grid_2x2, grid_3x2, blockage (sparingly). The planner picks a template and assigns shots. Code resolves pixel boxes. One hero panel per page. Reuse a few templates. Same gutter on both axes. Reading order comes from walking the tree (LTR or RTL).

## Orchestrator

The orchestrator is the program that decides what runs next and refuses to run the wrong thing. It is not the writer, not ComfyUI, and not the critic.

It is a Python process that owns the project folder and a status for every shot. Workers return evidence. The orchestrator applies rules and writes the status itself.

- A planner can invent a character. The orchestrator drops that shot before the GPU is used.
- ComfyUI returning a PNG only means `generated`, never `accepted`.
- A critic scorecard is compared to thresholds. Under the line and retries left: `redo`. Retries spent: `needs_human`.

Status path: `pending -> generated -> accepted | redo | needs_human`.

Memory is the project folder, not the chat context. That is what makes resume, skip, and audit possible. An agent framework is optional. A state machine is enough.

Suggested statuses and files: `bible.json`, `shotlist.json`, `shots/<id>.json`, `panels/`, `pages/`, `log.txt`.

## Critics

Two critics, plus a code check. Neither model sets status.

### Code critic (not a model)

Run this first. Fail closed.

- Character names exist in the cast
- Page count meets the minimum
- Required fields exist (prompt, camera, cast)
- Outfit and location do not contradict the continuity ledger
- Speakers are on that panel's cast
- Line length fits the box the layout pass measured

### Image critic

Sees the panel, the character sheet, and ideally the previous accepted panel. Returns a scorecard only.

Suggested accept rule: identity ≥ 4, wardrobe ≥ 4, anatomy ≥ 3, beat shown, no extra people, not self-censored. The note is one sentence appended on redo.

On 24 GB, unload ComfyUI before the critic:

- Default: Qwen3-VL 8B Q8
- Second opinion on hard pages: Qwen3.6 27B vision, Q4, thinking off
- Avoid Gemma as the only critic if the book is explicit; it is more likely to refuse or soften

### Story / bible critic

Never sees pixels. A different model from the writer, so it does not rubber-stamp its own plan.

- Writer: Qwen 3.6 or 3.8 27B abliterated
- Critic: Dolphin 3.0 Mistral 24B, or a second abliterated Qwen quant

Fail on any world-rule break. Do not let the critique rewrite the story. Rewriting is a separate pass.

## Models

- Image backbone for doujin / CG: WAI-NSFW Illustrious (v15–v17 line). One checkpoint for the whole book. Illustrious / NoobAI LoRAs. Do not mix Pony and Illustrious.
- Identity repair: Qwen-Image-Edit 2509 or 2511, plus sheet references. IP-Adapter / PuLID / InstantID as a cheaper lock. ControlNet for pose, not identity.
- Director LLM: abliterated Qwen 27B class, or Dolphin / Hermes if the instruct model lectures.
- Lettering: not a model. Pillow overlay. Fonts embedded in the project. Types: speech, thought, shout, whisper, narration, sfx.
- Negative prompt should include text, speech bubbles, watermarks, bar censor, mosaic.

Censorship is removed in four places: NSFW checkpoint rather than a safety-tuned base, abliterated writer, no prompt sanitizer or NSFW gate, critic fails panels that self-censor. Generate text-free art, then letter. Local tools do not change the law on real-minor content or non-consensual real-person likenesses.

## NovelAI as an optional worker

NovelAI can replace the renderer and some repair steps. It cannot replace the orchestrator, critics, layout, or lettering.

Can take over:

- Text-to-image (V4.5 Full or V5)
- Precise reference / character reference from the sheet
- Multi-character prompts with canvas positions (the local tag model's weak spot)
- Vibe transfer for style, not identity
- img2img and inpaint for redos
- Director tools: background removal, declutter, emotion, upscale
- Text API for a prose draft, not for structured planning

Cannot take over:

- Job status, retry budget, schema checks
- Vision critic
- Layout tree and gutters
- Bubble compositing
- Continuity ledger

One renderer per book. Do not mix WAI-Illustrious pages and NovelAI pages in the same project.

## Early implementation

Starter lives in `comic-orch/`. Standard library plus Pillow. Demo needs no GPU and no API key.

```bash
python run_demo.py
```

The mock drawer writes placeholder panels. The mock critic rejects attempt 1 and accepts attempt 2. Output:

- `examples/demo-run/log.txt` — status transitions
- `examples/demo-run/panels/` — attempt images
- `examples/demo-run/pages/001_art.png` — assembled, text-free
- `examples/demo-run/pages/001.png` — lettered page
- `examples/demo-run/shots/*.json` — per-shot status

Real:

- Status machine in `comic_orch/orchestrator.py`
- Code critic in `validate.py`
- Assembly only after every shot on the page is accepted
- Lettering on a copy of the art

Stubs, same `draw(shot, path)` shape:

- `ComfyUIDraw` — not wired to `127.0.0.1:8188` yet
- `NovelAIDraw` — not wired to `image.novelai.net` yet
- `MockImageCritic` — replace `score()` with a local Qwen-VL call that returns the same scorecard

Next wiring step: the vision critic. The rest of the loop does not need to change.

## Suggested build order

1. Manual shot list to ComfyUI batch to Pillow lettering (the demo already covers the non-GPU half).
2. LLM fills the shot list from a story and a page minimum.
3. VLM critic and Qwen-Edit or NovelAI inpaint redo.
4. UI, presets, continue-chapter, opening world card.

Do not start by training a base model, drawing whole pages including bubbles, or building an autonomous director before the critic can reject a wrong face.
