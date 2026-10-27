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

## Rubric v4 and challenge cases

The 2026-10-27 revision adds ten fictional requests with acceptance checks defined before generation: two routine requests and eight challenges. The CSV has only `Test_ID`, `User_Input` and blank `Model_Output`; the separate review checks are not sent to the generator. All ten cases pass the actual CSV parser, approved-facts extraction and generation eligibility checks.

The same five v4 definitions are used in the workbook and both judge requests. The handout gives a shorter version. Earlier worked labels are historical and have not been relabeled as v4 results. Comparison now reads IDs from Evaluation Log so a fresh R01-R10 batch can use the existing comparison formulas.

The 24 automated workflow tests pass. Workbook verification covers preserved posts, labels, formulas, dropdowns and formatting, exact new input text, and blank new outputs. In Google Sheets, temporary test IDs verified both an all-PASS match and a single-dimension regression; every original ID and review value was restored and checked afterward. The challenge cases have not been run against a live model. No failure rate or improvement is claimed for them.
