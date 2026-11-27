import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MAX_PDF_TEXT_CHARACTERS = 512 * 1024;

type PdfTextResult = { text: string; truncated: boolean };

function abortError() {
  return Object.assign(new Error("PDF text extraction was cancelled."), { name: "AbortError" });
}

export async function extractCalyxPdfText(
  file: Pick<File, "arrayBuffer" | "size">,
  signal?: AbortSignal,
): Promise<PdfTextResult> {
  if (signal?.aborted) throw abortError();
  if (file.size > MAX_PDF_BYTES) {
    throw new Error("This PDF exceeds the 50 MB local text-preview limit.");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw abortError();

  const loadingTask = getDocument({ data });
  let destroyPromise: Promise<void> | undefined;
  const destroy = () => {
    destroyPromise ??= loadingTask.destroy();
    return destroyPromise;
  };
  const cancel = () => { void destroy(); };
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    const document = await loadingTask.promise;
    const pageLimit = Math.min(document.numPages, MAX_PDF_PAGES);
    const pages: string[] = [];
    let textLength = 0;
    let truncated = document.numPages > pageLimit;

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      if (signal?.aborted) throw abortError();
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .flatMap((item) => "str" in item ? [item.str, item.hasEOL ? "\n" : " "] : [])
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      if (!pageText) continue;

      const separator = pages.length ? "\n\n" : "";
      const remaining = MAX_PDF_TEXT_CHARACTERS - textLength - separator.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      if (pageText.length > remaining) truncated = true;
      const boundedPageText = pageText.slice(0, remaining);
      pages.push(`${separator}${boundedPageText}`);
      textLength += separator.length + boundedPageText.length;
      if (truncated && textLength >= MAX_PDF_TEXT_CHARACTERS) break;
    }

    return { text: pages.join(""), truncated };
  } finally {
    signal?.removeEventListener("abort", cancel);
    await destroy();
  }
}
