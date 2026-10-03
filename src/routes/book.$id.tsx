import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/folio/chrome";
import { Area, Button, Field, TextField } from "@/components/folio/fields";
import { Sheet } from "@/components/folio/sheet";
import { critiqueBook } from "@/lib/folio/critic";
import { humanAccept, overrideStory, retryShot } from "@/lib/folio/orchestrator";
import { forgetPanel } from "@/lib/folio/panels";
import { draftBook, requestStop, runPress } from "@/lib/folio/press";
import { useDesk } from "@/lib/folio/store";
import type { Book, CastMember, Location, ReadingOrder } from "@/lib/folio/types";
import { nid, statusLabel } from "@/lib/folio/types";

export const Route = createFileRoute("/book/$id")({ component: BookPage });

type Tab = "brief" | "shots" | "press" | "pages";

function BookPage() {
  const { id } = Route.useParams();
  const book = useDesk((state) => state.books.find((item) => item.id === id));
  const running = useDesk((state) => state.runningId === id);
  const [tab, setTab] = useState<Tab>("press");

  return (
    <Shell>
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted">
            Desk
          </Link>
        </div>
        <p className="text-xs font-medium tracking-widest text-accent uppercase">Night press</p>
        <h1 className="font-display text-5xl leading-none">{book?.title ?? "Missing book"}</h1>
        <div className="mt-4 h-px bg-accent" />
      </header>
      {!book ? (
        <p className="text-muted">That book is not on the desk.</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(
              [
                ["brief", "Brief"],
                ["shots", "Shots"],
                ["press", "Press"],
                ["pages", "Pages"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`min-h-11 shrink-0 px-4 text-sm ${tab === key ? "bg-accent text-fg" : "border border-fg/20 text-fg"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-6">
            {tab === "brief" && <Brief book={book} />}
            {tab === "shots" && <Shots book={book} />}
            {tab === "press" && <Press book={book} running={running} />}
            {tab === "pages" && <Pages book={book} />}
          </div>
        </>
      )}
    </Shell>
  );
}

function save(book: Book) {
  useDesk.getState().saveBook(book);
}

function Brief({ book }: { book: Book }) {
  const navigate = useNavigate();
  const [arm, setArm] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const worked = book.shots.some((shot) => shot.status !== "pending" || shot.attempts > 0);

  function draft() {
    if (worked && !confirmDraft) {
      setConfirmDraft(true);
      return;
    }
    setConfirmDraft(false);
    void draftBook(book.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title">
        <TextField value={book.title} onChange={(event) => save({ ...book, title: event.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum pages">
          <TextField
            type="number"
            min={1}
            max={16}
            value={book.minPages}
            onChange={(event) => save({ ...book, minPages: clamp(Number(event.target.value), 1, 16) })}
          />
        </Field>
        <Field label="Retries">
          <TextField
            type="number"
            min={1}
            max={4}
            value={book.maxAttempts}
            onChange={(event) => save({ ...book, maxAttempts: clamp(Number(event.target.value), 1, 4) })}
          />
        </Field>
      </div>
      <Field label="Tone">
        <TextField value={book.tone} onChange={(event) => save({ ...book, tone: event.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Order book={book} value="ltr" label="Left to right" />
        <Order book={book} value="rtl" label="Right to left" />
      </div>
      <Field label="Story">
        <Area value={book.story} onChange={(event) => save({ ...book, story: event.target.value })} />
      </Field>
      <CastList book={book} />
      <PlaceList book={book} />
      <RuleList book={book} />
      <div className="flex flex-wrap gap-3">
        <Button onClick={draft}>{confirmDraft ? "Replace the shot list" : "Draft shot list"}</Button>
        {confirmDraft && (
          <Button tone="quiet" onClick={() => setConfirmDraft(false)}>
            Keep it
          </Button>
        )}
      </div>
      <p className="text-sm text-muted">
        Rehearse uses the desk planner. On the bench, the writer must be probed and reachable. Draft again after cast or rule edits. The press will not rewrite a held book.
      </p>
      <div>
        <Button
          tone="quiet"
          onClick={() => {
            if (!arm) {
              setArm(true);
              return;
            }
            useDesk.getState().deleteBook(book.id);
            void navigate({ to: "/" });
          }}
        >
          {arm ? "Delete for good" : "Delete book"}
        </Button>
      </div>
    </div>
  );
}

function Order({ book, value, label }: { book: Book; value: ReadingOrder; label: string }) {
  return (
    <Button tone={book.readingOrder === value ? "solid" : "line"} onClick={() => save({ ...book, readingOrder: value })}>
      {label}
    </Button>
  );
}

function CastList({ book }: { book: Book }) {
  function setCast(cast: CastMember[]) {
    save({ ...book, cast });
  }
  return (
    <fieldset>
      <legend className="mb-2 text-xs tracking-widest text-muted uppercase">Cast</legend>
      <div className="flex flex-col gap-3">
        {book.cast.map((member) => (
          <div key={member.id} className="grid gap-2 border border-fg/15 p-3">
            <TextField
              aria-label={`${member.name || "Character"} name`}
              value={member.name}
              onChange={(event) => setCast(book.cast.map((item) => (item.id === member.id ? { ...item, name: event.target.value } : item)))}
            />
            <TextField
              aria-label="Look"
              value={member.tags}
              placeholder="Look"
              onChange={(event) => setCast(book.cast.map((item) => (item.id === member.id ? { ...item, tags: event.target.value } : item)))}
            />
            <TextField
              aria-label="Outfit"
              value={member.outfit}
              placeholder="Outfit, locked"
              onChange={(event) => setCast(book.cast.map((item) => (item.id === member.id ? { ...item, outfit: event.target.value } : item)))}
            />
            <Button tone="quiet" onClick={() => setCast(book.cast.filter((item) => item.id !== member.id))}>
              Remove {member.name || "character"}
            </Button>
          </div>
        ))}
        <Button
          tone="line"
          onClick={() => setCast([...book.cast, { id: nid("cast"), name: "", tags: "", outfit: "" }])}
        >
          Add character
        </Button>
      </div>
    </fieldset>
  );
}

function PlaceList({ book }: { book: Book }) {
  function setLocations(locations: Location[]) {
    save({ ...book, locations });
  }
  return (
    <fieldset>
      <legend className="mb-2 text-xs tracking-widest text-muted uppercase">Places</legend>
      <div className="flex flex-col gap-3">
        {book.locations.map((place) => (
          <div key={place.id} className="grid gap-2 border border-fg/15 p-3">
            <TextField
              aria-label="Place name"
              value={place.name}
              onChange={(event) =>
                setLocations(book.locations.map((item) => (item.id === place.id ? { ...item, name: event.target.value } : item)))
              }
            />
            <TextField
              aria-label="Place notes"
              value={place.notes}
              placeholder="What the drawer must keep"
              onChange={(event) =>
                setLocations(book.locations.map((item) => (item.id === place.id ? { ...item, notes: event.target.value } : item)))
              }
            />
          </div>
        ))}
        <Button
          tone="line"
          onClick={() => setLocations([...book.locations, { id: nid("place"), name: "", notes: "" }])}
        >
          Add place
        </Button>
      </div>
    </fieldset>
  );
}

function RuleList({ book }: { book: Book }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs tracking-widest text-muted uppercase">Rules</legend>
      <div className="flex flex-col gap-2">
        {book.rules.map((rule, index) => (
          <TextField
            key={index}
            aria-label={`Rule ${index + 1}`}
            value={rule}
            onChange={(event) => save({ ...book, rules: book.rules.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)) })}
          />
        ))}
        <Button tone="line" onClick={() => save({ ...book, rules: [...book.rules, ""] })}>
          Add rule
        </Button>
      </div>
    </fieldset>
  );
}

function Shots({ book }: { book: Book }) {
  const issues = critiqueBook(book);
  return (
    <div className="flex flex-col gap-4">
      {issues.length > 0 && (
        <ul className="border border-accent/60 p-3 text-sm">
          {issues.slice(0, 8).map((issue) => (
            <li key={`${issue.shotId}-${issue.code}-${issue.message}`}>
              {issue.shotId ? `${issue.shotId}: ` : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {book.shots.length === 0 && <p className="text-muted">No shot list. Draft one from the brief.</p>}
      <ul className="flex flex-col gap-3">
        {book.shots.map((shot) => (
          <li key={shot.id} className="border border-fg/15 bg-surface p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-xl">
                {shot.id} · p.{shot.page}
              </p>
              <p className="text-sm text-accent">{statusLabel(shot.status)}</p>
            </div>
            <p className="mt-1 text-sm text-muted">
              {shot.camera} · {shot.cast.join(", ") || "no cast"} · {shot.location || "no place"}
            </p>
            <p className="mt-2">{shot.beat}</p>
            {shot.note && <p className="mt-2 text-sm text-muted">{shot.note}</p>}
            {shot.score && (
              <p className="mt-2 text-sm tabular-nums text-muted">
                Identity {shot.score.identity} · wardrobe {shot.score.wardrobe} · anatomy {shot.score.anatomy}
                {shot.score.selfCensored ? " · self-censored" : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Press({ book, running }: { book: Book; running: boolean }) {
  const accepted = book.shots.filter((shot) => shot.status === "accepted").length;
  const total = book.shots.filter((shot) => shot.status !== "blocked").length || 1;
  const needs = book.shots.filter((shot) => shot.status === "needs_human");
  return (
    <div className="flex flex-col gap-4">
      <div className="h-1 bg-fg/10">
        <div className="h-1 bg-accent" style={{ width: `${Math.round((accepted / total) * 100)}%` }} />
      </div>
      <p className="text-sm tabular-nums text-muted">
        {accepted} accepted of {book.shots.length} shots · {book.pages.length} pages
      </p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={running || book.shots.length === 0} onClick={() => void runPress(book.id)}>
          {running ? "Running" : "Run the press"}
        </Button>
        <Button tone="line" disabled={!running} onClick={() => requestStop()}>
          Stop
        </Button>
      </div>
      {book.storyBreaks.length > 0 && !book.overrideStory && (
        <div className="border border-accent/60 p-3">
          <p className="font-display text-xl">Story hold</p>
          <ul className="mt-2 text-sm">
            {book.storyBreaks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Button className="mt-3" tone="line" onClick={() => save(overrideStory(book))}>
            Run anyway, do not rewrite
          </Button>
        </div>
      )}
      {needs.length > 0 && (
        <ul className="flex flex-col gap-3">
          {needs.map((shot) => (
            <li key={shot.id} className="border border-fg/15 p-3">
              <p className="font-display text-xl">{shot.id} needs you</p>
              <p className="mt-1 text-sm text-muted">{shot.note}</p>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => save(humanAccept(book, shot.id))}>Accept</Button>
                <Button
                  tone="line"
                  onClick={() => {
                    forgetPanel(shot.id);
                    save(retryShot(book, shot.id));
                  }}
                >
                  Retry
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ol className="max-h-80 overflow-auto border border-fg/15 bg-bg p-3 text-sm">
        {book.log.length === 0 && <li className="text-muted">The log is empty.</li>}
        {book.log.map((line, index) => (
          <li key={`${line.at}-${index}`} className="grid grid-cols-[4.5rem_1fr] gap-3 py-1">
            <time className="tabular-nums text-muted">
              {new Date(line.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </time>
            <span>{line.message}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Pages({ book }: { book: Book }) {
  const [lettered, setLettered] = useState(true);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button tone={lettered ? "solid" : "line"} onClick={() => setLettered(true)}>
          Lettered
        </Button>
        <Button tone={!lettered ? "solid" : "line"} onClick={() => setLettered(false)}>
          Text-free
        </Button>
      </div>
      <Sheet book={book} lettered={lettered} />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
