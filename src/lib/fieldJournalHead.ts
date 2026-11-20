// Home Screen install identity for /field. iPad Safari reads the manifest,
// apple-touch-icon (PNG; SVG is ignored) and title when "Add to Home Screen"
// is chosen, so /field points them at the Field Journal while it is mounted.

export const FIELD_JOURNAL_DOCUMENT_TITLE = "Orchid Continuum Field Journal";
export const FIELD_JOURNAL_MANIFEST = "/field-journal.webmanifest";
export const FIELD_JOURNAL_TOUCH_ICON = "/field-journal-icon-180.png";

type HeadSetting = { selector: string; create: () => HTMLElement; attribute: string; value: string };

export function applyFieldJournalHead(doc: Document = document): () => void {
  const settings: HeadSetting[] = [
    { selector: 'link[rel="manifest"]', create: () => Object.assign(doc.createElement("link"), { rel: "manifest" }), attribute: "href", value: FIELD_JOURNAL_MANIFEST },
    { selector: 'link[rel="apple-touch-icon"]', create: () => Object.assign(doc.createElement("link"), { rel: "apple-touch-icon" }), attribute: "href", value: FIELD_JOURNAL_TOUCH_ICON },
    { selector: 'meta[name="apple-mobile-web-app-title"]', create: () => Object.assign(doc.createElement("meta"), { name: "apple-mobile-web-app-title" }), attribute: "content", value: "Field Journal" },
    { selector: 'meta[name="apple-mobile-web-app-capable"]', create: () => Object.assign(doc.createElement("meta"), { name: "apple-mobile-web-app-capable" }), attribute: "content", value: "yes" },
  ];
  const restore: (() => void)[] = [];
  for (const setting of settings) {
    let element = doc.head.querySelector<HTMLElement>(setting.selector);
    if (!element) {
      const created = setting.create();
      doc.head.appendChild(created);
      element = created;
      restore.push(() => created.remove());
    } else {
      const target = element;
      const previous = target.getAttribute(setting.attribute);
      restore.push(() => { if (previous === null) target.removeAttribute(setting.attribute); else target.setAttribute(setting.attribute, previous); });
    }
    element.setAttribute(setting.attribute, setting.value);
  }
  const previousTitle = doc.title;
  doc.title = FIELD_JOURNAL_DOCUMENT_TITLE;
  restore.push(() => { doc.title = previousTitle; });
  return () => restore.reverse().forEach((undo) => undo());
}
