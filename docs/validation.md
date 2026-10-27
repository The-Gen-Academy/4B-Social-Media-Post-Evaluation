# Validation: five-dimension PASS/FAIL exercise

Validated on 2026-10-27:

- All three workflow JSON files rebuild from shared source. Their node graphs and embedded Code nodes are checked by executable tests.
- Mocked API round trips cover generation, independent five-dimension reviews, 60 judge rows for a ten-post run, error handling and CSV exports.
- Tests verify that each single failed dimension produces an overall FAIL, all five passes produce PASS, and missing/invalid/tied decisions cannot produce PASS.
- Current human labels, feedback and other model answers are excluded from model inputs. Newly generated posts clear old reviews.
- The workbook's actual formulas were exercised for every single-dimension failure, all-pass, incomplete review, empty post, all four comparison outcomes and reordered revised IDs. The twelve earlier posts and their feedback were checked for exact preservation at that revision.
- The Google Sheet is updated from the verified workbook. The handout and workflow setup describe the same ten-post exercise.

Automated tests use fabricated provider responses. No fresh paid Jev or LLM evaluation was run for the older five-dimension revision described above, and no model-quality improvement is claimed from prompt edits alone. Participants measure that with their own ten-post experiment.

Run `npm ci`, `npm run build:workflows` and `npm test` to reproduce the code checks. Rebuilding must leave the checked-in workflow JSON unchanged.

## Rubric v4 and challenge cases

The 2026-10-27 revision adds ten fictional requests with acceptance checks defined before generation: two routine requests and eight challenges. The CSV has only `Test_ID`, `User_Input` and blank `Model_Output`; the separate review checks are not sent to the generator. All ten cases pass the actual CSV parser, approved-facts extraction and generation eligibility checks.

The same five v4 definitions are used in the workbook and both judge requests. The handout gives a shorter version. Earlier worked labels are historical and have not been relabeled as v4 results. That historical version used comparison formulas; the current three-tab workbook records reruns as new rows in Evaluation Log instead.

The 24 automated workflow tests pass. Workbook verification covers preserved posts, labels, formulas, dropdowns and formatting, exact new input text, and blank new outputs. In Google Sheets, temporary test IDs verified both an all-PASS match and a single-dimension regression; every original ID and review value was restored and checked afterward. The challenge cases have not been run against a live model. No failure rate or improvement is claimed for them.

## OpenAI main-category calibration

The standalone category workflow calls OpenAI directly using an n8n OpenAI credential and `gpt-5.4-mini`. Its structured output distinguishes TRUE, FALSE and UNRESOLVED. It does not generate posts, call Jev or send human labels, feedback or dimension decisions to the model.

Ten additional tests cover exact main-category labels, prompt input isolation, missing evidence and failed calls, comparison denominators, direct OpenAI transport, current workbook header aliases, executable n8n nodes, stable form IDs and quoted CSV round trips. All 34 automated tests pass. These tests use fabricated provider responses; they validate behavior and error handling, not model accuracy.

Before the category revision, a live local n8n run on October 27, 2026 evaluated the workbook's ten saved failed traces using `gpt-5.4-mini-2026-03-17`. The unchanged CSV parser, category nodes, OpenAI calls and generated CSV completed successfully. A manual-trigger harness supplied the actual CSV as binary; the browser upload interaction itself was not exercised. The generated CSV matched the normalized run results, and model payloads contained no human labels or feedback.

Under the earlier five-category taxonomy, the then-default **Missing Practical Detail** definition produced agreement of **5/10**: two true positives, three true negatives, four false positives and one false negative. All ten calls completed, with no unresolved cases or errors. There were three human TRUE examples and seven human FALSE examples. This is a measured starting point for calibration, not a claim that the judge is calibrated or reliable on new posts.

The browser upload path was then tested with two saved traces (POST_004 and POST_008). The corrected imported form waited for the CSV, parsed both rows, completed both OpenAI calls, and provided a downloadable results file. Both rows were OK and matched their human main categories. The fix adds stable, distinct webhook IDs to all four supplied workflows. This two-row transport check is separate from the ten-row calibration baseline above.

The current taxonomy has four categories: Incorrect or Hallucinated Content, Low Informational Value, Poor Framing, and Missing or Inappropriate CTA. Low Informational Value is now the workflow default and includes promotional copy that omits the requested substantive content. Poor Framing includes missing scope or context. The ten-row and two-row live results above used the earlier taxonomy and have not been relabeled. No live accuracy result is claimed for the revised categories.
