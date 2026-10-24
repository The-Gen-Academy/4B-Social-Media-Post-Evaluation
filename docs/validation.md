# Validation — October 23, 2026

- All 21 social-evaluation automated tests passed. These use fabricated API
  responses and exercise binary validation, class denominators, label isolation,
  independent review, provider errors, CSV round trips and embedded n8n code.
- Workbook fixtures verified all four human baseline/revised transitions,
  changed-brief detection, duplicate IDs, missing critiques, API-error exclusion
  and both class-specific error denominators. Fixtures were not saved as results.
- The shared Google Sheet was read back after editing; the inspected summary,
  comparison and helper cells contained no formula errors. All original 12 posts
  and their repository instructor critiques were preserved as historical data.
- All workbook tabs were rendered; the native Sheet was visually inspected.
  The updated handout was exported and checked as a seven-page PDF.
- A local n8n execution processed the three constructed demo rows through the
  judge/review/export path. The saved local OpenRouter credential had expired:
  both model endpoints returned HTTP 401. Every affected decision stayed blank
  and the exported statuses were ERROR. This verifies error handling, **not**
  successful live judgments. A valid OpenRouter credential is needed to verify
  the live success path. No model agreement or reliability claim is made.

Workflow exports contain no credentials. The original and combined generator
paths were checked with automated fixtures; this revision does not claim a live
generation or full browser form-upload test with a valid model credential.
