/**
 * A local reference backend for the Conservatory browser journey.
 *
 * WHAT THIS IS: a stand-in that answers the endpoints `src/pages/MyConservatory.tsx`
 * calls, in the shapes its TypeScript contract declares, plus the small slice of
 * the identity API that `@supabase/supabase-js` uses to sign a browser in. It
 * exists so the signed-in journey can be driven in a real browser.
 *
 * WHAT THIS IS NOT: evidence about the deployed backend. It proves the frontend
 * journey works against a backend that honours the contract. It proves nothing
 * about whether the deployed service honours it. Do not cite a passing run here
 * as deployed-backend evidence.
 *
 * State lives in this process, not the browser, so signing out and back in — or
 * reloading — reads the same records back, which is the point of the
 * persistence step in the journey.
 */
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";

const store = {
  users: new Map(),      // email -> { id, email, password }
  tokens: new Map(),     // access_token -> userId
  data: new Map(),       // userId -> collection
};

function collectionFor(userId) {
  if (!store.data.has(userId)) {
    store.data.set(userId, {
      plants: [], locations: [], placements: [], events: [],
      readings: [], photographs: [], locationHistory: [], accessionSeq: 0,
    });
  }
  return store.data.get(userId);
}

/* ---------------------------------------------------------------- taxa ---- */

/**
 * A deliberately tiny cultivation-requirement table.
 *
 * Only one taxon is known, so the journey can exercise both branches that
 * matter: a taxon with evidence produces real verdicts, and a taxon without
 * produces `unassessable` rather than a quiet pass.
 */
const REQUIREMENTS = {
  // Fixture bounds, not published evidence. This server is a test double, and
  // nothing here should ever be cited as what the literature says about a
  // species. The numbers exist so the comparison has two sides.
  "phragmipedium kovachii": {
    temperature_c: { min: [{ value: 13, evidence_strength: "moderate" }], max: [{ value: 24, evidence_strength: "moderate" }] },
    relative_humidity_pct: { min: [{ value: 60, evidence_strength: "moderate" }], max: [{ value: 85, evidence_strength: "moderate" }] },
  },
  "phalaenopsis amabilis": {
    temperature_c: { min: [{ value: 16, evidence_strength: "strong" }], max: [{ value: 24, evidence_strength: "strong" }] },
    relative_humidity_pct: { min: [{ value: 50, evidence_strength: "moderate" }], max: [{ value: 85, evidence_strength: "moderate" }] },
  },
};

/**
 * Reduce a stored collection identity to the species requirements are about.
 *
 * The server has the same problem the client does: a real record reads
 * `Phragmipedium kovachii 'Daniela' x Phragmipedium kovachii 'Maria'`, and
 * looking that string up finds nothing. Both parents being clones of one
 * species means the species is what is published; two different species means
 * nothing published describes the plant, and returning either parent's bounds
 * would be evidence about something else.
 *
 * This mirrors src/lib/cultivatedTaxonIdentity.ts. The deployed backend needs
 * the same rule; see the pull request for that gap.
 */
function speciesOfStoredIdentity(stored) {
  const cultivated = String(stored ?? "").replace(/\s+/g, " ").trim();
  if (!cultivated) return null;
  const sideOf = (part) => {
    const words = part.replace(/\s*(?:'[^']*'|"[^"]*")\s*/g, " ").trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    if (!/^[A-Z][a-z-]+$/.test(words[0]) || !/^[a-z][a-z-]+$/.test(words[1])) return null;
    return `${words[0]} ${words[1]}`;
  };
  const parts = cultivated.split(/\s(?:\u00d7|x|X)\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) return sideOf(parts[0]);
  if (parts.length !== 2) return null;
  const [left, right] = parts.map(sideOf);
  return left && right && left === right ? left : null;
}

function requirementsFor(taxon) {
  const direct = REQUIREMENTS[(taxon || "").trim().toLowerCase()];
  if (direct) return direct;
  const species = speciesOfStoredIdentity(taxon);
  return species ? REQUIREMENTS[species.toLowerCase()] || null : null;
}

/* ------------------------------------------------------------- helpers ---- */

const json = (res, status, body, extra = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...cors(), ...extra });
  res.end(payload);
};

const fail = (res, status, code, message) =>
  json(res, status, { detail: { code, message } });

/**
 * `*` is not usable here: the Conservatory client sends `credentials:
 * "include"`, and a browser refuses a credentialed response whose
 * Allow-Origin is a wildcard. The request's own origin is echoed instead.
 */
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || requestOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    // Echo whatever the preflight asked for. supabase-js adds headers
    // (accept-profile, x-retry-count, …) that vary by version, and a fixed
    // list silently blocks the request instead of failing loudly.
    "Access-Control-Allow-Headers": requestHeaders || "authorization, apikey, content-type, prefer",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "content-length, content-type",
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function bearer(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return store.tokens.get(token) || null;
}

/* ---------------------------------------------------------- identity ------ */

function issueSession(user) {
  const access_token = `at_${randomUUID()}`;
  const refresh_token = `rt_${randomUUID()}`;
  store.tokens.set(access_token, user.id);
  store.tokens.set(refresh_token, user.id);
  return {
    access_token,
    refresh_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: publicUser(user),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: new Date(0).toISOString(),
    phone: "",
    confirmed_at: new Date(0).toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: new Date(0).toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  };
}

async function identityRoute(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const body = req.method === "POST" ? safeJson(await readBody(req)) : {};

  if (path === "/signup") {
    const email = String(body.email || "").toLowerCase();
    if (store.users.has(email)) return json(res, 400, { error: "user_already_exists", msg: "User already registered" });
    const user = { id: randomUUID(), email, password: String(body.password || "") };
    store.users.set(email, user);
    return json(res, 200, issueSession(user));
  }

  if (path === "/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "refresh_token") {
      const userId = store.tokens.get(String(body.refresh_token || ""));
      const user = [...store.users.values()].find((candidate) => candidate.id === userId);
      if (!user) return json(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
      return json(res, 200, issueSession(user));
    }
    const email = String(body.email || "").toLowerCase();
    const user = store.users.get(email);
    if (!user || user.password !== String(body.password || "")) {
      return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    return json(res, 200, issueSession(user));
  }

  if (path === "/user") {
    const userId = bearer(req);
    const user = [...store.users.values()].find((candidate) => candidate.id === userId);
    if (!user) return json(res, 401, { message: "invalid claim: missing sub claim" });
    return json(res, 200, publicUser(user));
  }

  if (path === "/logout") {
    const header = req.headers.authorization || "";
    if (header.startsWith("Bearer ")) store.tokens.delete(header.slice(7));
    res.writeHead(204, cors());
    return res.end();
  }

  if (path === "/settings") {
    return json(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
  }

  return json(res, 404, { message: `no identity route ${path}` });
}

function safeJson(buffer) {
  try { return JSON.parse(buffer.toString("utf8") || "{}"); } catch { return {}; }
}

/* -------------------------------------------------------------- EXIF ------ */

/**
 * Remove every APPn marker from a JPEG, which is where EXIF — and therefore
 * where the photograph was taken — lives.
 *
 * A file we cannot parse as a JPEG is refused rather than stored, because
 * storing it would mean publishing a grower's location on the strength of
 * having not looked.
 */
function stripJpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const out = [buffer.subarray(0, 2)];
  let takenAt = null;
  let index = 2;
  while (index < buffer.length) {
    if (buffer[index] !== 0xff) return null;
    const marker = buffer[index + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { index += 2; continue; }
    if (marker === 0xda) { out.push(buffer.subarray(index)); break; }
    const length = buffer.readUInt16BE(index + 2);
    const segment = buffer.subarray(index, index + 2 + length);
    if (marker >= 0xe0 && marker <= 0xef) {
      const text = segment.toString("latin1");
      const stamp = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
      if (stamp) takenAt = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`;
    } else {
      out.push(segment);
    }
    index += 2 + length;
  }
  return { bytes: Buffer.concat(out), takenAt };
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) return null;
  const boundary = `--${match[1] || match[2]}`;
  const parts = [];
  let cursor = buffer.indexOf(boundary);
  while (cursor !== -1) {
    const start = cursor + boundary.length;
    if (buffer.subarray(start, start + 2).toString() === "--") break;
    const headerEnd = buffer.indexOf("\r\n\r\n", start);
    if (headerEnd === -1) break;
    const headers = buffer.subarray(start, headerEnd).toString("latin1");
    const next = buffer.indexOf(boundary, headerEnd);
    if (next === -1) break;
    const content = buffer.subarray(headerEnd + 4, next - 2);
    const name = /name="([^"]+)"/.exec(headers)?.[1];
    const filename = /filename="([^"]*)"/.exec(headers)?.[1];
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1];
    if (name) parts.push({ name, filename, type, content });
    cursor = next;
  }
  return parts;
}

/* --------------------------------------------------------- assessment ----- */

function currentLocationOf(collection, plantId) {
  const placements = collection.placements
    .filter((placement) => placement.plant_id === plantId && !placement.corrected_by_id);
  return placements.length ? placements[placements.length - 1] : null;
}

function standingReadings(collection, locationId) {
  return collection.readings.filter(
    (reading) => reading.location_id === locationId && !reading.superseded_by_id,
  );
}

function ageInDays(instant) {
  if (!instant) return null;
  const then = Date.parse(instant);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/** Compare one location's standing readings against one taxon's requirements. */
function assess(collection, locationId, taxon) {
  const bounds = requirementsFor(taxon);
  const readings = locationId ? standingReadings(collection, locationId) : [];
  const variables = new Set([...Object.keys(bounds || {}), ...readings.map((r) => r.variable)]);
  const assessments = [];
  for (const variable of variables) {
    const reading = readings.find((candidate) => candidate.variable === variable);
    const bound = bounds?.[variable];
    const condition = reading
      ? { value: reading.value, unit: reading.unit, origin: reading.origin }
      : undefined;
    const condition_age_days = reading ? ageInDays(reading.observed_at) : null;
    if (!bound || !reading || reading.value === null) {
      assessments.push({
        variable,
        outcome: "unassessable",
        reason: !bound
          ? "The Continuum holds no bound for this variable and this taxon."
          : "Nothing has been recorded for this variable where this plant is.",
        condition,
        condition_age_days,
      });
      continue;
    }
    const breached = [];
    for (const entry of bound.min || []) if (reading.value < entry.value) breached.push({ bound: "min", limit: entry.value });
    for (const entry of bound.max || []) if (reading.value > entry.value) breached.push({ bound: "max", limit: entry.value });
    assessments.push({
      variable,
      outcome: breached.length ? "outside" : "within",
      breached: breached.length ? breached : undefined,
      condition,
      bounds: bound,
      condition_age_days,
    });
  }
  const counts = assessments.reduce((total, entry) => {
    total[entry.outcome] = (total[entry.outcome] || 0) + 1;
    return total;
  }, {});
  const withVerdict = assessments.filter((entry) => entry.outcome === "within" || entry.outcome === "outside");
  const ages = withVerdict.map((entry) => entry.condition_age_days).filter((age) => typeof age === "number");
  return {
    assessments,
    counts,
    anything_assessed: withVerdict.length > 0,
    oldest_verdict_condition_age_days: ages.length ? Math.max(...ages) : null,
  };
}

/* ------------------------------------------------------- conservatory ----- */

async function conservatoryRoute(req, res, url) {
  const userId = bearer(req);
  if (!userId) return fail(res, 401, "not_authenticated", "This collection is private. Sign in to read it.");
  const collection = collectionFor(userId);
  const path = url.pathname;
  const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : Buffer.alloc(0);
  const asJson = () => safeJson(body);
  const now = () => new Date().toISOString();

  if (path === "/api/conservatory/readiness") {
    return json(res, 200, {
      ready_for_collection_entry: true,
      storage_path: "reference-backend://in-process",
      checked_at: now(),
      instruction: "Persistence and restart survival were verified for this reference backend.",
      gates: [
        { name: "persistent_storage", passed: true, evidence: "Records are held by the reference backend for the life of the process." },
        { name: "restart_survival", passed: true, evidence: "Records survive a browser reload and a sign-out/sign-in cycle." },
        { name: "private_to_owner", passed: true, evidence: "Every read is scoped to the bearer's user id." },
      ],
    });
  }

  /* --- plants --- */
  if (path === "/api/conservatory/plants" && req.method === "GET") {
    return json(res, 200, { plants: collection.plants });
  }
  if (path === "/api/conservatory/plants" && req.method === "POST") {
    const input = asJson();
    const name = String(input.display_name || "").trim();
    if (name.length < 2) return fail(res, 422, "display_name_too_short", "A plant needs a name of at least two characters.");
    collection.accessionSeq += 1;
    const plant = {
      id: randomUUID(),
      accession_number: `OC-${String(collection.accessionSeq).padStart(4, "0")}`,
      display_name: name,
      accepted_scientific_name: input.accepted_scientific_name || null,
      location: input.location || null,
      notes: input.notes || null,
      qr_identifier: `ocq_${createHash("sha256").update(randomUUID()).digest("hex").slice(0, 24)}`,
      created_at: now(),
      updated_at: now(),
    };
    collection.plants.push(plant);
    return json(res, 201, plant);
  }

  let match = /^\/api\/conservatory\/plants\/([^/]+)$/.exec(path);
  if (match) {
    const plant = collection.plants.find((candidate) => candidate.id === decodeURIComponent(match[1]));
    if (!plant) return fail(res, 404, "plant_not_found", "This collection has no such plant.");
    if (req.method === "PATCH") {
      const input = asJson();
      if (typeof input.display_name === "string") plant.display_name = input.display_name.trim();
      if ("accepted_scientific_name" in input) plant.accepted_scientific_name = input.accepted_scientific_name || null;
      if ("notes" in input) plant.notes = input.notes || null;
      plant.updated_at = now();
    }
    return json(res, 200, plant);
  }

  match = /^\/api\/conservatory\/plants\/([^/]+)\/qr\.svg$/.exec(path);
  if (match) {
    const plant = collection.plants.find((candidate) => candidate.id === decodeURIComponent(match[1]));
    if (!plant) return fail(res, 404, "plant_not_found", "This collection has no such plant.");
    // Not a scannable code — a placeholder carrying the identity, so the label
    // layout and the image request are exercised without pulling in an encoder.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${plant.accession_number}"><rect width="64" height="64" fill="#fff"/><rect x="4" y="4" width="18" height="18" fill="#000"/><rect x="42" y="4" width="18" height="18" fill="#000"/><rect x="4" y="42" width="18" height="18" fill="#000"/><text x="32" y="38" font-size="5" text-anchor="middle">${plant.qr_identifier}</text></svg>`;
    res.writeHead(200, { "Content-Type": "image/svg+xml", ...cors() });
    return res.end(svg);
  }

  match = /^\/api\/conservatory\/resolve\/(.+)$/.exec(path);
  if (match) {
    const identifier = decodeURIComponent(match[1]);
    const plant = collection.plants.find((candidate) => candidate.qr_identifier === identifier);
    // Matched exactly or not at all: a near miss would attach one plant's
    // history to another.
    if (!plant) return fail(res, 404, "tag_not_matched", "This tag does not match a plant in this collection.");
    return json(res, 200, plant);
  }

  /* --- events --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/events$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const input = asJson();
      if (!input.kind) return fail(res, 422, "kind_required", "An event needs a kind.");
      if (Date.parse(input.occurred_at) > Date.now()) {
        return fail(res, 422, "occurred_in_future", "An event cannot be recorded as having happened in the future.");
      }
      const event = {
        id: randomUUID(),
        plant_id: plantId,
        kind: String(input.kind),
        occurred_at: input.occurred_at,
        recorded_at: now(),
        recorder_kind: "owner",
        note: input.note ?? null,
        supersedes_id: input.supersedes_id ?? null,
        superseded_by_id: null,
      };
      if (event.supersedes_id) {
        const superseded = collection.events.find((candidate) => candidate.id === event.supersedes_id);
        if (!superseded) return fail(res, 404, "supersedes_not_found", "The event being corrected is not in this ledger.");
        superseded.superseded_by_id = event.id;
      }
      collection.events.push(event);
      return json(res, 201, event);
    }
    const mine = collection.events.filter((event) => event.plant_id === plantId);
    return json(res, 200, {
      plant_id: plantId,
      standing: mine.filter((event) => !event.superseded_by_id),
      corrected: mine.filter((event) => event.superseded_by_id),
      event_count: mine.length,
      is_scientific_evidence: false,
    });
  }

  /* --- photographs --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/photographs$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const parts = parseMultipart(body, req.headers["content-type"]);
      const file = parts?.find((part) => part.name === "file");
      if (!file) return fail(res, 422, "file_required", "No photograph was uploaded.");
      const stripped = stripJpegMetadata(file.content);
      if (!stripped) {
        return fail(res, 422, "exif_not_strippable",
          "The photograph could not be read well enough to remove its location, so it was refused rather than stored.");
      }
      const photograph = {
        id: randomUUID(),
        plant_id: plantId,
        content_type: file.type || "image/jpeg",
        byte_size: stripped.bytes.length,
        taken_at: stripped.takenAt,
        recorded_at: now(),
        caption: parts.find((part) => part.name === "caption")?.content.toString("utf8") || null,
        exif_stripped: true,
        _bytes: stripped.bytes,
      };
      collection.photographs.push(photograph);
      const { _bytes, ...visible } = photograph;
      return json(res, 201, visible);
    }
    return json(res, 200, {
      photographs: collection.photographs
        .filter((photograph) => photograph.plant_id === plantId)
        .map(({ _bytes, ...visible }) => visible),
    });
  }

  match = /^\/api\/conservatory\/photographs\/([^/]+)$/.exec(path);
  if (match) {
    const photograph = collection.photographs.find((candidate) => candidate.id === decodeURIComponent(match[1]));
    if (!photograph) return fail(res, 404, "photograph_not_found", "No such photograph in this collection.");
    res.writeHead(200, { "Content-Type": photograph.content_type, ...cors() });
    return res.end(photograph._bytes);
  }

  /* --- placement --- */
  match = /^\/api\/conservatory\/plants\/([^/]+)\/placement$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    if (req.method === "POST") {
      const input = asJson();
      const location = collection.locations.find((candidate) => candidate.id === input.location_id);
      if (!location) return fail(res, 404, "location_not_found", "That growing location is not in this collection.");
      if (location.retired_at) return fail(res, 409, "location_retired", "That bench has been retired. Bring it back into use before placing a plant on it.");
      if (!input.reason) return fail(res, 422, "reason_required", "Say why the plant is being placed here.");
      const placement = {
        id: randomUUID(),
        plant_id: plantId,
        location_id: input.location_id,
        reason: String(input.reason),
        note: input.note ?? null,
        recorded_at: now(),
        corrects_id: input.corrects_id ?? null,
        corrected_by_id: null,
      };
      if (placement.corrects_id) {
        const corrected = collection.placements.find((candidate) => candidate.id === placement.corrects_id);
        if (!corrected) return fail(res, 404, "corrects_not_found", "The placement being corrected is not in this history.");
        corrected.corrected_by_id = placement.id;
      }
      collection.placements.push(placement);
      const plant = collection.plants.find((candidate) => candidate.id === plantId);
      if (plant) { plant.location = location.name; plant.updated_at = now(); }
      return json(res, 201, placement);
    }
    return json(res, 200, {
      plant_id: plantId,
      current: currentLocationOf(collection, plantId),
      // Append-only: a correction is added, the corrected entry stays visible.
      history: collection.placements.filter((placement) => placement.plant_id === plantId),
    });
  }

  match = /^\/api\/conservatory\/plants\/([^/]+)\/placement-assessment$/.exec(path);
  if (match) {
    const plantId = decodeURIComponent(match[1]);
    const plant = collection.plants.find((candidate) => candidate.id === plantId);
    const placement = currentLocationOf(collection, plantId);
    const result = assess(collection, placement?.location_id, plant?.accepted_scientific_name);
    return json(res, 200, {
      ...result,
      requirement_source_consulted: true,
      is_recommendation: false,
    });
  }

  /* --- locations --- */
  if (path === "/api/conservatory/locations" && req.method === "GET") {
    return json(res, 200, { locations: collection.locations });
  }
  if (path === "/api/conservatory/locations" && req.method === "POST") {
    const input = asJson();
    const name = String(input.name || "").trim();
    if (!name) return fail(res, 422, "name_required", "A growing location needs a name.");
    if (collection.locations.some((location) => location.name === name && !location.retired_at)) {
      return fail(res, 409, "name_in_use", "Another location in use already has that name.");
    }
    const location = {
      id: randomUUID(),
      name,
      kind: String(input.kind || "bench"),
      described_conditions: input.described_conditions ?? null,
      retired_at: null,
    };
    collection.locations.push(location);
    collection.locationHistory.push({
      id: randomUUID(), location_id: location.id, change: "created",
      previous_name: null, new_name: location.name, note: null, recorded_at: now(),
    });
    return json(res, 201, location);
  }

  match = /^\/api\/conservatory\/locations\/([^/]+)\/(rename|retire|unretire|history|environment)$/.exec(path);
  if (match) {
    const locationId = decodeURIComponent(match[1]);
    const action = match[2];
    const location = collection.locations.find((candidate) => candidate.id === locationId);
    if (!location) return fail(res, 404, "location_not_found", "That growing location is not in this collection.");

    if (action === "history") {
      return json(res, 200, {
        history: collection.locationHistory.filter((entry) => entry.location_id === locationId),
      });
    }

    if (action === "rename") {
      const name = String(asJson().name || "").trim();
      if (!name) return fail(res, 422, "name_required", "A growing location needs a name.");
      const previous = location.name;
      location.name = name;
      // A rename is not a move: nothing about where any plant is has changed.
      collection.locationHistory.push({
        id: randomUUID(), location_id: locationId, change: "renamed",
        previous_name: previous, new_name: name, note: null, recorded_at: now(),
      });
      return json(res, 200, location);
    }

    if (action === "retire") {
      const here = collection.plants.filter((plant) => currentLocationOf(collection, plant.id)?.location_id === locationId);
      if (here.length) {
        return fail(res, 409, "location_occupied",
          `${here.length} plant${here.length === 1 ? " is" : "s are"} still here. Move ${here.length === 1 ? "it" : "them"} before retiring this location.`);
      }
      location.retired_at = now();
      collection.locationHistory.push({
        id: randomUUID(), location_id: locationId, change: "retired",
        previous_name: location.name, new_name: location.name, note: null, recorded_at: location.retired_at,
      });
      return json(res, 200, location);
    }

    if (action === "unretire") {
      location.retired_at = null;
      collection.locationHistory.push({
        id: randomUUID(), location_id: locationId, change: "unretired",
        previous_name: location.name, new_name: location.name, note: null, recorded_at: now(),
      });
      return json(res, 200, location);
    }

    if (action === "environment") {
      if (req.method === "POST") {
        const input = asJson();
        const variable = String(input.variable || "").trim();
        if (!variable) return fail(res, 422, "variable_required", "Say which variable this reading is for.");
        if (input.origin !== "measured" && input.instrument) {
          return fail(res, 422, "instrument_without_measurement",
            "Only a measured reading may name an instrument.");
        }
        if (input.origin === "measured" && !input.instrument) {
          return fail(res, 422, "instrument_required", "A measured reading must say what measured it.");
        }
        const reading = {
          id: randomUUID(),
          location_id: locationId,
          variable,
          unit: String(input.unit || (variable.endsWith("_c") ? "C" : variable.endsWith("_pct") ? "%" : "")),
          value: input.value === null || input.value === undefined ? null : Number(input.value),
          origin: String(input.origin || "unknown"),
          instrument: input.instrument ?? null,
          observed_at: input.observed_at || now(),
          note: input.note ?? null,
          supersedes_id: input.supersedes_id ?? null,
          superseded_by_id: null,
        };
        if (reading.supersedes_id) {
          const superseded = collection.readings.find((candidate) => candidate.id === reading.supersedes_id);
          if (!superseded) return fail(res, 404, "supersedes_not_found", "The reading being corrected is not at this location.");
          superseded.superseded_by_id = reading.id;
        }
        collection.readings.push(reading);
        return json(res, 201, reading);
      }
      const readings = collection.readings.filter((reading) => reading.location_id === locationId);
      const variables = {};
      for (const reading of readings.filter((entry) => !entry.superseded_by_id)) {
        variables[reading.variable] = {
          unit: reading.unit,
          known: reading.value !== null,
          value: reading.value ?? undefined,
          origin: reading.origin,
          instrument: reading.instrument,
          observed_at: reading.observed_at,
        };
      }
      return json(res, 200, { location_id: locationId, variables, readings });
    }
  }

  if (path === "/api/conservatory/locations/suitability") {
    const taxon = url.searchParams.get("taxon") || "";
    const requirements = requirementsFor(taxon);
    const locations = collection.locations
      .filter((location) => !location.retired_at)
      .map((location) => ({
        location_id: location.id,
        name: location.name,
        kind: location.kind,
        ...assess(collection, location.id, taxon),
      }));
    return json(res, 200, {
      taxon,
      locations,
      requirements: requirements
        ? { value: requirements, claim_class: "cultivation_bound", source_consulted: true }
        : { claim_class: "none", reason: "The Continuum holds no cultivation bounds for this taxon.", source_consulted: true },
      anything_assessed: locations.some((location) => location.anything_assessed),
      is_recommendation: false,
      ...(requirements ? {} : { reason: "The Continuum holds no cultivation bounds for this taxon." }),
    });
  }

  /* --- collection review --- */
  if (path === "/api/conservatory/collection/review") {
    const groups = { outside: [], conflicting: [], within: [], unassessed: [] };
    for (const plant of collection.plants) {
      const placement = currentLocationOf(collection, plant.id);
      const result = assess(collection, placement?.location_id, plant.accepted_scientific_name);
      const breaches = result.assessments
        .filter((entry) => entry.outcome === "outside")
        .map((entry) => ({ variable: entry.variable, breached: entry.breached || [] }));
      const row = {
        plant_id: plant.id,
        accession_number: plant.accession_number,
        display_name: plant.display_name,
        accepted_scientific_name: plant.accepted_scientific_name,
        breaches,
        requirement_source_consulted: true,
        oldest_verdict_condition_age_days: result.oldest_verdict_condition_age_days,
      };
      if (breaches.length) groups.outside.push(row);
      else if (!result.anything_assessed) groups.unassessed.push(row);
      else groups.within.push(row);
    }
    return json(res, 200, {
      groups,
      counts: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])),
      plant_count: collection.plants.length,
      anything_assessed: groups.outside.length + groups.within.length > 0,
      requirement_source_unread_for: 0,
      is_recommendation: false,
    });
  }

  return fail(res, 404, "no_such_endpoint", `The reference backend does not answer ${req.method} ${path}.`);
}

/* --------------------------------------------------------------- main ----- */

let requestOrigin = "*";
let requestHeaders = "";

const server = createServer(async (req, res) => {
  requestOrigin = req.headers.origin || "*";
  requestHeaders = String(req.headers["access-control-request-headers"] || "");
  const url = new URL(req.url, "http://localhost");
  // Logged so a failing browser journey shows what the app actually asked for
  // rather than only which selector timed out.
  if (process.env.REFERENCE_BACKEND_LOG !== "off") {
    process.stdout.write(`${req.method} ${url.pathname}${url.search}\n`);
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    return res.end();
  }
  try {
    if (url.pathname.startsWith("/auth/v1")) return await identityRoute(req, res, url);
    if (url.pathname.startsWith("/api/conservatory")) return await conservatoryRoute(req, res, url);
    if (url.pathname === "/__reference/health") return json(res, 200, { ok: true });
    // The rest of the app reads a handful of tables through PostgREST. None of
    // them belong to the Conservatory journey, but leaving them to 404 fills
    // the console with failures that would mask a real one.
    if (url.pathname.startsWith("/rest/v1/")) {
      if (req.method === "HEAD") { res.writeHead(200, { "Content-Range": "*/0", ...cors() }); return res.end(); }
      return json(res, 200, [], { "Content-Range": "*/0" });
    }
    return json(res, 404, { message: "not found" });
  } catch (cause) {
    return json(res, 500, { message: String(cause?.message || cause) });
  }
});

const port = Number(process.env.REFERENCE_BACKEND_PORT || 8791);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`reference backend listening on http://127.0.0.1:${port}\n`);
});
