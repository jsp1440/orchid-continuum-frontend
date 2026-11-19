import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist", () => pdfjs);
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/pdf.worker.min.mjs" }));

import { extractCalyxPdfText } from "./calyxPdfText";

function pdfFile(size = 1) {
  return { size, arrayBuffer: vi.fn(async () => new ArrayBuffer(1)) } as Pick<File, "size" | "arrayBuffer">;
}

function mockPdfDocument(
  pageTexts: string[],
  numPages = pageTexts.length,
) {
  const getPage = vi.fn(async (pageNumber: number) => ({
    getTextContent: async () => ({
      items: [{ str: pageTexts[pageNumber - 1] ?? "", hasEOL: true }],
    }),
  }));
  const destroy = vi.fn(async () => undefined);
  pdfjs.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages, getPage }),
    destroy,
  });
  return { getPage, destroy };
}

describe("extractCalyxPdfText", () => {
  beforeEach(() => {
    pdfjs.getDocument.mockReset();
  });

  it("extracts selectable text from a bounded number of PDF pages and releases the document", async () => {
    const { getPage, destroy } = mockPdfDocument(["First page.", "Second page."]);

    await expect(extractCalyxPdfText(pdfFile())).resolves.toEqual({
      text: "First page.\n\nSecond page.",
      truncated: false,
    });
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("reports when a PDF has more pages than the local extraction limit", async () => {
    const { getPage } = mockPdfDocument(["Page one."], 101);

    await expect(extractCalyxPdfText(pdfFile())).resolves.toEqual({
      text: "Page one.",
      truncated: true,
    });
    expect(getPage).toHaveBeenCalledTimes(100);
  });

  it("rejects oversized PDFs before reading them", async () => {
    const file = pdfFile(50 * 1024 * 1024 + 1);

    await expect(extractCalyxPdfText(file)).rejects.toThrow("50 MB");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });

  it("aborts active extraction and releases the PDF document", async () => {
    let rejectLoading!: (reason: Error) => void;
    const destroy = vi.fn(async () => {
      rejectLoading(new Error("PDF task aborted"));
    });
    pdfjs.getDocument.mockReturnValue({
      promise: new Promise((_, reject) => { rejectLoading = reject; }),
      destroy,
    });
    const controller = new AbortController();
    const extraction = extractCalyxPdfText(pdfFile(), controller.signal);
    await Promise.resolve();

    controller.abort();

    await expect(extraction).rejects.toThrow("PDF task aborted");
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
