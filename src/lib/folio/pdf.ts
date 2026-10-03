export function jpegBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function pdfFromJpegs(pages: { w: number; h: number; jpeg: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    cursor += bytes.length;
  };
  const pushStr = (text: string) => push(enc.encode(text));

  pushStr("%PDF-1.4\n");
  const ids = pages.map((_, index) => ({
    page: 3 + index * 3,
    content: 4 + index * 3,
    image: 5 + index * 3,
  }));
  const last = 2 + pages.length * 3;

  const obj = (id: number, dict: string, stream?: Uint8Array) => {
    offsets[id] = cursor;
    pushStr(`${id} 0 obj\n${dict}`);
    if (stream) {
      pushStr("\nstream\n");
      push(stream);
      pushStr("\nendstream");
    }
    pushStr("\nendobj\n");
  };

  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${ids.map((id) => `${id.page} 0 R`).join(" ")}] >>`);
  pages.forEach((page, index) => {
    const id = ids[index];
    const content = `q\n${page.w} 0 0 ${page.h} 0 0 cm\n/Im Do\nQ`;
    const contentBytes = enc.encode(content);
    obj(
      id.page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.w} ${page.h}] /Contents ${id.content} 0 R /Resources << /XObject << /Im ${id.image} 0 R >> >> >>`,
    );
    obj(id.content, `<< /Length ${contentBytes.length} >>`, contentBytes);
    obj(
      id.image,
      `<< /Type /XObject /Subtype /Image /Width ${page.w} /Height ${page.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    );
  });

  const xref = cursor;
  let table = `xref\n0 ${last + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= last; id += 1) {
    table += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pushStr(table);
  pushStr(`trailer << /Size ${last + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
