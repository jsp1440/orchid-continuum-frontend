// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFieldJournalHead, FIELD_JOURNAL_MANIFEST, FIELD_JOURNAL_TOUCH_ICON } from "./fieldJournalHead";

describe("Field Journal Home Screen identity", () => {
  it("points manifest, touch icon and title at the Field Journal and restores them", () => {
    document.head.innerHTML = '<link rel="manifest" href="/calyx-manifest.webmanifest"><link rel="apple-touch-icon" href="/calyx-icon.svg"><meta name="apple-mobile-web-app-title" content="Calyx">';
    document.title = "Orchid Continuum";
    const undo = applyFieldJournalHead();
    expect(document.title).toBe("Orchid Continuum Field Journal");
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe(FIELD_JOURNAL_MANIFEST);
    expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")).toBe(FIELD_JOURNAL_TOUCH_ICON);
    expect(document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content")).toBe("yes");
    undo();
    expect(document.title).toBe("Orchid Continuum");
    expect(document.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("/calyx-manifest.webmanifest");
    expect(document.querySelector('meta[name="apple-mobile-web-app-capable"]')).toBeNull();
  });

  it("ships an installable /field manifest with PNG icons", () => {
    const manifest = JSON.parse(readFileSync("public/field-journal.webmanifest", "utf8"));
    expect(manifest).toMatchObject({ name: "Orchid Continuum Field Journal", display: "standalone", scope: "/" });
    expect(manifest.start_url.startsWith("/field")).toBe(true);
    for (const icon of manifest.icons.filter((item: { type: string }) => item.type === "image/png")) {
      expect(readFileSync(`public${icon.src}`).subarray(1, 4).toString()).toBe("PNG");
    }
    expect(readFileSync(`public${FIELD_JOURNAL_TOUCH_ICON}`).subarray(1, 4).toString()).toBe("PNG");
  });
});
