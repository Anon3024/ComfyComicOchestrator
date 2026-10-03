import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Masthead, Shell } from "@/components/folio/chrome";
import { Area, Button, Field, TextField } from "@/components/folio/fields";
import { blankBook } from "@/lib/folio/sample";
import { useDesk } from "@/lib/folio/store";
import type { Book, Template } from "@/lib/folio/types";
import { nid, statusLabel } from "@/lib/folio/types";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const books = useDesk((state) => state.books);
  return (
    <Shell>
      <Masthead href="/bench" label="Bench" />
      <p className="max-w-xl text-lg leading-relaxed text-fg">
        The desk runs the book. Agents live on another machine — give Folio that address from the bench.
      </p>
      <section className="mt-10">
        <h2 className="font-display text-3xl">On the desk</h2>
        {books.length === 0 ? (
          <p className="mt-4 text-muted">No books yet. Open one below.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {books.map((book) => (
              <li key={book.id}>
                <BookCard book={book} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <OpenBook />
    </Shell>
  );
}

function BookCard({ book }: { book: Book }) {
  const accepted = book.shots.filter((shot) => shot.status === "accepted").length;
  const human = book.shots.filter((shot) => shot.status === "needs_human").length;
  return (
    <Link
      to="/book/$id"
      params={{ id: book.id }}
      className="flex gap-4 border border-fg/15 bg-surface p-4"
    >
      <Mini template={book.pages[0]?.template} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-2xl leading-tight">{book.title}</span>
        <span className="mt-1 block text-sm text-muted">
          {book.pages.length} pages · {book.minPages} minimum · {book.cast.map((member) => member.name).join(", ") || "No cast"}
        </span>
        <span className="mt-2 block text-sm tabular-nums text-fg">
          {accepted} accepted
          {human > 0 ? ` · ${human} ${statusLabel("needs_human").toLowerCase()}` : ""}
          {book.shots.length === 0 ? " · no shot list" : ""}
        </span>
      </span>
    </Link>
  );
}

function Mini({ template }: { template?: Template }) {
  const cell = "bg-fg/20";
  if (!template) return <div className="h-24 w-16 shrink-0 border border-fg/20" />;
  if (template === "splash") return <div className={`h-24 w-16 shrink-0 ${cell}`} />;
  if (template === "stack_2") {
    return (
      <div className="grid h-24 w-16 shrink-0 grid-rows-2 gap-1">
        <div className={cell} />
        <div className={cell} />
      </div>
    );
  }
  if (template === "grid_2x2" || template === "grid_3x2") {
    return (
      <div className="grid h-24 w-16 shrink-0 grid-cols-2 grid-rows-2 gap-1">
        <div className={cell} />
        <div className={cell} />
        <div className={cell} />
        <div className={cell} />
      </div>
    );
  }
  return (
    <div className="grid h-24 w-16 shrink-0 grid-rows-[1.3fr_1fr] gap-1">
      <div className={cell} />
      <div className="grid grid-cols-2 gap-1">
        <div className={cell} />
        <div className={cell} />
      </div>
    </div>
  );
}

function OpenBook() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [tone, setTone] = useState("");
  const [minPages, setMinPages] = useState(8);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [outfit, setOutfit] = useState("");
  const [place, setPlace] = useState("");
  const [placeNotes, setPlaceNotes] = useState("");
  const [rule, setRule] = useState("");

  function create() {
    const cast = name.trim()
      ? [{ id: nid("cast"), name: name.trim(), tags: tags.trim(), outfit: outfit.trim() }]
      : [];
    const locations = place.trim()
      ? [{ id: nid("place"), name: place.trim(), notes: placeNotes.trim() }]
      : [];
    const book = blankBook({
      id: nid("book"),
      title: title.trim() || "Untitled",
      story,
      tone,
      minPages: clamp(minPages, 1, 16),
      cast,
      locations,
      rules: rule.trim() ? [rule.trim()] : [],
    });
    useDesk.getState().createBook(book);
    setOpen(false);
    setTitle("");
    setStory("");
  }

  return (
    <section className="mt-12">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-3xl">Open a book</h2>
        {!open && (
          <Button tone="line" onClick={() => setOpen(true)}>
            New book
          </Button>
        )}
      </div>
      {open && (
        <form
          className="mt-4 flex flex-col gap-4 border border-fg/15 bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <Field label="Title">
            <TextField value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label="Minimum pages">
            <TextField
              type="number"
              min={1}
              max={16}
              value={minPages}
              onChange={(event) => setMinPages(Number(event.target.value))}
            />
          </Field>
          <Field label="Tone">
            <TextField value={tone} onChange={(event) => setTone(event.target.value)} placeholder="quiet, cold, close" />
          </Field>
          <Field label="Story">
            <Area value={story} onChange={(event) => setStory(event.target.value)} placeholder="What happens, in prose." />
          </Field>
          <Field label="Lead">
            <TextField value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
          </Field>
          <Field label="Look">
            <TextField value={tags} onChange={(event) => setTags(event.target.value)} placeholder="hair, face, age" />
          </Field>
          <Field label="Outfit">
            <TextField value={outfit} onChange={(event) => setOutfit(event.target.value)} placeholder="Locked for the book" />
          </Field>
          <Field label="Place">
            <TextField value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Location name" />
          </Field>
          <Field label="Place notes">
            <TextField value={placeNotes} onChange={(event) => setPlaceNotes(event.target.value)} />
          </Field>
          <Field label="World rule">
            <TextField value={rule} onChange={(event) => setRule(event.target.value)} placeholder="What must not happen" />
          </Field>
          <div className="flex gap-3">
            <Button type="submit">Put it on the desk</Button>
            <Button type="button" tone="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-sm text-muted">Eight to sixteen pages is the range this press is built for. Add the rest of the cast inside the book.</p>
        </form>
      )}
    </section>
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
