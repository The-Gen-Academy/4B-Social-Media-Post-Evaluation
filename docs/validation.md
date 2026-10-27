# Validation: five-dimension PASS/FAIL exercise

Validated on 2026-10-27:

- All three workflow JSON files rebuild from shared source. Their node graphs and embedded Code nodes are checked by executable tests.
- Mocked API round trips cover generation, independent five-dimension reviews, 60 judge rows for a ten-post run, error handling and CSV exports.
- Tests verify that each single failed dimension produces an overall FAIL, all five passes produce PASS, and missing/invalid/tied decisions cannot produce PASS.
- Current human labels, feedback and other model answers are excluded from model inputs. Newly generated posts clear old reviews.
- The workbook's actual formulas were exercised for every single-dimension failure, all-pass, incomplete review, empty post, all four comparison outcomes and reordered revised IDs. The twelve earlier posts and their feedback were checked for exact preservation.
- The Google Sheet is updated from the verified workbook. The handout and workflow setup describe the same ten-post exercise.

Automated tests use fabricated provider responses. No fresh paid Jev or LLM evaluation was run for this revision, and no model-quality improvement is claimed from prompt edits alone. Participants measure that with their own ten-post experiment.

Run `npm ci`, `npm run build:workflows` and `npm test` to reproduce the code checks. Rebuilding must leave the checked-in workflow JSON unchanged.
