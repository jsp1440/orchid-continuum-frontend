# CONSERVATORY-QR-PRINT-001 — Collection Entry and Label Printing

## Completed

- Replaced the judging-event API dependency with `/api/conservatory`.
- Added personal collection dashboard, plant list, search, plant creation, and plant detail.
- Added automatic accession-number display.
- Added authenticated QR SVG rendering for each plant.
- Added selectable batch label preview and browser printing.
- Added print isolation so navigation and controls do not appear on labels.

## Operator workflow

1. Open `/conservatory/plants/new`.
2. Enter a display name, accepted scientific name when known, location, and notes.
3. Save; Calyx assigns the next `OC-YYYY-NNNN` accession.
4. Open `/conservatory/labels`.
5. Select plants and print the QR label sheet.

## Deployment gates

The backend must be deployed first, owner authentication must work, `VITE_CALYX_API_URL` must point to that backend, and `CALYX_CONSERVATORY_DIR` must be a persistent mounted path. Collection entry remains blocked until a harmless test plant survives a backend restart.

## Brain record

The Conservatory is now treated as the primary operational priority. Stable collection identity, accession numbering, QR resolution, and printable labels precede photographs, histories, sensors, relationship-matrix integration, and matrix identification.
