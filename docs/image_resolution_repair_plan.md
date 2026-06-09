# Homepage Image Resolution Repair Plan

Status: immediate repair plan
Date: 2026-06-08

## Problem

The homepage gallery and atlas cards depend on image URLs coming from the Orchid Continuum database. The data layer currently exposes image URLs from:

- `species.image_url`
- `atlas_occurrences.media_url`

If those URLs are malformed, stale, blocked by remote hosts, point to HTML pages rather than image bytes, or fail in the browser, the homepage can show broken images or empty visual cards.

## Existing frontend behavior

The frontend already has several useful safeguards:

- The Living Gallery only asks for rows with `species.image_url`.
- Atlas occurrence cards prefer linked curated species images and then fall back to occurrence media URLs.
- Placeholder image tiles already exist.

However, the gallery image element currently needs an explicit browser-level failure fallback.

## Immediate UI repair

Add local image failure state inside the gallery card.

Desired behavior:

```text
imageUrl exists
  -> browser attempts to load image
  -> if image loads: render it
  -> if image fails: show neutral non-AI placeholder tile
```

This prevents the public homepage from displaying broken image icons while preserving the strict rule that no AI-generated orchid images are used.

Suggested patch concept:

```tsx
const GalleryCard: React.FC<CardProps> = ({ record }) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [record.imageUrl]);

  const hasRealImage = !!record.imageUrl && !record.isPlaceholder && !imageFailed;

  return hasRealImage ? (
    <img
      src={record.imageUrl}
      alt={record.scientificName}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <PlaceholderImageTile failed={imageFailed} />
  );
};
```

## Data repair layer

The UI fallback prevents a broken public experience, but it does not fix the underlying records. The data layer should also gain an image health audit.

Add a future worker or script that records:

- source table
- source row id
- taxon
- image_url
- HTTP status
- content-type
- content-length
- final redirected URL
- last checked timestamp
- image_status: ok | broken | html_page | blocked | timeout | unknown
- replacement_candidate_url
- repair_status

## Recommended database table

```sql
CREATE SCHEMA IF NOT EXISTS oc_media;

CREATE TABLE IF NOT EXISTS oc_media.image_url_health (
    id BIGSERIAL PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_row_id TEXT NOT NULL,
    scientific_name TEXT,
    image_url TEXT NOT NULL,
    http_status INTEGER,
    content_type TEXT,
    content_length BIGINT,
    final_url TEXT,
    image_status TEXT NOT NULL DEFAULT 'unknown',
    checked_at TIMESTAMPTZ DEFAULT now(),
    repair_status TEXT NOT NULL DEFAULT 'unreviewed',
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_image_url_health_status
ON oc_media.image_url_health(image_status);
```

## Replacement strategy

If a record cannot be repaired, do not keep broken imagery on the public homepage.

Preferred order:

1. Use a verified Orchid Continuum approved image for the same species.
2. Use a verified image for the same genus only if clearly labeled as genus-level visual context.
3. Use a neutral placeholder and mark the image as needing repair.
4. Remove the card from homepage rotation until a valid image is available.

## Important rule

Do not fabricate images and do not use AI-generated orchid imagery. A missing image is better than a false image.

## Longer-term improvement

The best solution is to cache approved images under Orchid Continuum control rather than hotlinking remote URLs. Each cached image should retain original credit, license, source URL, source institution/grower, and provenance.
