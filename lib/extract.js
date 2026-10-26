// Reads the text out of an uploaded file in the browser, so the file itself never leaves the user's machine.
// PDF via pdf.js, Word (.docx) via mammoth, anything text-like as text. Both readers load only when needed.

const TEXT_TYPES = /\.(txt|md|eml|csv|log)$/i;

export class ExtractError extends Error {}

async function pdfText(file) {
  // Loading the worker module first makes pdf.js read on the main thread: no worker file to serve, and fine at CRM sizes.
  await import("pdfjs-dist/build/pdf.worker.min.mjs");
  const pdfjs = await import("pdfjs-dist");
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let line = "";
    const lines = [];
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = "";
      } else if (item.str && !item.str.endsWith(" ")) line += " ";
    }
    if (line.trim()) lines.push(line);
    pages.push(lines.map((l) => l.replace(/\s+/g, " ").trim()).join("\n"));
  }
  const count = doc.numPages;
  await task.destroy();
  return { text: pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim(), pages: count };
}

async function docxText(file) {
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { text: r.value.replace(/\n{3,}/g, "\n\n").trim() };
}

/** { text, pages? } from a File, or an ExtractError saying what to do instead. */
export async function extractText(file) {
  const name = file.name || "file";
  if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
    const out = await pdfText(file).catch((e) => {
      console.warn("PDF read failed:", e);
      throw new ExtractError(/password/i.test(e?.message) ? `${name} is password protected. Remove the password and try again.` : `${name} could not be read as a PDF.`);
    });
    if (!out.text) throw new ExtractError(`${name} has no text in it, so it is probably a scan. Scanned PDFs cannot be read yet; paste the text instead.`);
    return out;
  }
  if (/\.docx$/i.test(name)) {
    const out = await docxText(file).catch(() => {
      throw new ExtractError(`${name} could not be read as a Word file.`);
    });
    if (!out.text) throw new ExtractError(`${name} has no text in it.`);
    return out;
  }
  if (/\.doc$/i.test(name)) throw new ExtractError(`${name} is an old Word format. Open it in Word and save it as .docx or PDF, then upload that.`);
  if (TEXT_TYPES.test(name) || file.type.startsWith("text/")) return { text: (await file.text()).trim() };
  throw new ExtractError(`${name}: only PDF, Word (.docx) and text files can be read.`);
}
