import { useEffect, useState } from "react";
import { composePage } from "@/lib/folio/compose";
import { pageReady } from "@/lib/folio/critic";
import { jpegBytes, pdfFromJpegs } from "@/lib/folio/pdf";
import type { Book } from "@/lib/folio/types";
import { Button } from "./fields";

export function Sheet({ book, lettered }: { book: Book; lettered: boolean }) {
  const ready = book.pages.filter((page) => pageReady(book, page.number));
  const waiting = book.pages.filter((page) => !pageReady(book, page.number));

  async function savePdf() {
    const pages: { w: number; h: number; jpeg: Uint8Array }[] = [];
    for (const page of ready) {
      const canvas = await composePage(book, page.number, true);
      if (!canvas) continue;
      pages.push({ w: canvas.width, h: canvas.height, jpeg: jpegBytes(canvas.toDataURL("image/jpeg", 0.86)) });
    }
    if (pages.length === 0) return;
    const blob = pdfFromJpegs(pages);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${book.title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "folio"}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button tone="line" disabled={ready.length === 0} onClick={() => void savePdf()}>
          Download lettered PDF
        </Button>
        <p className="text-sm text-muted">
          {ready.length} assembled. Art stays text-free until this pass.
        </p>
      </div>
      {ready.length === 0 ? (
        <p className="text-muted">Nothing is on the stone yet. A page waits until every live shot on it is accepted.</p>
      ) : (
        ready.map((page) => <Frame key={page.number} book={book} pageNumber={page.number} lettered={lettered} />)
      )}
      {waiting.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm text-muted">
          {waiting.map((page) => (
            <li key={page.number}>
              Page {page.number} · {page.template.replaceAll("_", " ")} · not assembled
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Frame({ book, pageNumber, lettered }: { book: Book; pageNumber: number; lettered: boolean }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    void composePage(book, pageNumber, lettered).then((canvas) => {
      if (!live || !canvas) return;
      setSrc(canvas.toDataURL("image/jpeg", 0.86));
    });
    return () => {
      live = false;
    };
  }, [book, pageNumber, lettered]);

  return (
    <figure className="bg-surface p-3">
      <figcaption className="mb-3 flex items-center justify-between text-sm">
        <span className="font-display text-xl">Page {pageNumber}</span>
        {src && (
          <a className="min-h-11 inline-flex items-center text-accent" href={src} download={`page-${pageNumber}${lettered ? "" : "-art"}.jpg`}>
            Save {lettered ? "lettered" : "art"}
          </a>
        )}
      </figcaption>
      {src ? (
        <img src={src} alt={`Page ${pageNumber}${lettered ? ", lettered" : ", text free"}`} className="mx-auto w-full max-w-md" />
      ) : (
        <p className="py-16 text-center text-muted">Pulling the page…</p>
      )}
    </figure>
  );
}
