# 4B: Social Media Post Evaluation with Jev

Generate a social media post in n8n, let Jev score it, and see whether it passes.
Participants upload the CSV produced by their generation workflow unchanged.
No columns need to be filled, added or cleared for Jev.

```text
n8n generates the post → Jev scores five dimensions → Code calculates PASS/FAIL
```

## Workshop workbook

Open the downloaded results CSV directly to see the grades. The **Jev Results** tab in
[Social Media Post Evaluation.xlsx](Social%20Media%20Post%20Evaluation.xlsx) is an optional
reference with the same 10 output columns:

| Columns | Who fills them |
| --- | --- |
| `Test_ID`, `User_Input`, `Model_Output` | Carried over automatically from the generation workflow's CSV. |
| `Jev_Factual_Correctness`, `Jev_Clarity`, `Jev_Value`, `Jev_Engagement`, `Jev_Tone` | Jev supplies each score on the workbook's 1–5 scale. |
| `Jev_Total_Score`, `Jev_Status` | n8n calculates the total and applies the pass/fail rule. |

**PASS requires factual correctness ≥ 4 AND total score ≥ 20/25.** A post fails if either condition is not met. For example, 22/25 with factual correctness of 3 is still FAIL.

The **Scoring Guide** tab explains the steps and rubric. The 12 original posts now contain actual Jev scores from the October 16, 2026 OpenRouter run: **1 PASS and 11 FAIL**. The empty template row was skipped. The workbook has total/status formulas for 100 posts. Original human grading and the previous detailed review are retained in hidden instructor tabs.

## Run the workshop in n8n

1. Import [Social Media Jev Judge Only.json](Social%20Media%20Jev%20Judge%20Only.json).
2. In **Call Jev**, select an HTTP Header Auth credential: name `Authorization`, value `Bearer <your OpenRouter API key>`. The workflow uses OpenRouter’s System One endpoint and model `typesafe/jev-1.13`. Get a key from [OpenRouter](https://openrouter.ai/settings/keys); no separate TypeSafe account is needed.
3. Download **linkedin_posts_output.csv** from your existing post-generation workflow. Execute the Jev workflow, open **Upload Posts CSV**, select that file unchanged, and submit the form. You do not need to open the workbook or edit the CSV first.
4. Jev scores the final post. **Normalize Jev Result** calculates its total and PASS/FAIL. **Workshop Results** keeps only the 10 participant columns.
5. Download the CSV from **Download Results CSV** and open it directly in Excel or Google Sheets. All scores, totals and PASS/FAIL decisions are already filled in. There is no required workbook copy/paste step.
6. For a failed post, inspect the lowest scores, improve your generation prompt, and rerun the generation stage from its original input file. Upload its newly generated CSV to Jev unchanged. To judge the same posts again, upload the same generation output file. Save each result under a new name.

One-time setup is steps 1–2. Each evaluation run is **upload → submit → download results**.

For an optional combined workflow, import [Social Media Post Generation with Jev Judge.json](Social%20Media%20Post%20Generation%20with%20Jev%20Judge.json), connect the creator/critic credentials and **Call Jev**, then upload the same original input CSV you used for generation. It generates missing posts and judges the finished outputs. To generate a fresh batch after changing the generation prompt, rerun with that original input CSV; populated posts are judged as-is.

`ERROR` means the API call or response failed; it is not a quality judgment. `SKIPPED` means the post was empty. These rows have no scores. Inspect the n8n execution and rerun errors. The workflows export results without publishing posts.

## Instructor and developer details

Confidence, review flags, failure categories, model versions and raw API responses stay available in **Normalize Jev Result** for debugging. They are excluded from the workshop CSV and main workbook view. Human-label calibration is an optional instructor exercise, not a participant requirement.

The Node CLI can produce the same compact export:

```bash
npm ci
cp .env.example .env
# Set OPENROUTER_API_KEY in .env using your editor.
npm run judge -- --input posts.csv --output results/workshop.csv --workshop
```

Omit `--workshop` for the full diagnostic CSV. Use a new output name for each run. The input is never overwritten and secrets stay in the ignored `.env` file or n8n credentials.

For direct TypeSafe or Vercel AI Gateway setup, detailed scoring criteria, optional source/context fields, score conversion, confidence handling and human-label calibration, see [the integration guide](docs/jev-integration.md).

The shared rubric and score rules are in [src/judge.js](src/judge.js). The 10-column contract is in [src/workshop.js](src/workshop.js). Rebuild the n8n files after changing these sources:

```bash
npm run build:workflows
npm test
```

Validation covers all three provider routes, score thresholds, malformed responses, retries, label isolation, compact CSV output and embedded n8n Code nodes. All 29 automated tests pass. A live CLI run through OpenRouter successfully scored all 12 posts with `typesafe/jev-1.13-20260917`. Jev agreed with 8 of 12 historical human labels; all posts still need review because separate reference facts were missing. A local Docker n8n 2.18.7 import and form-upload execution was verified on October 16, 2026: execution 269 completed in 3.651 seconds, with 1 PASS, 11 FAIL, 1 empty row SKIPPED and no API errors. Its exported CSV matches the earlier live CLI grades.

## Resources

- [Exercise handout](https://docs.google.com/document/d/1tGiUY_TwSEagGAc0sL96trBsf2RK04OVu9VI_rTx7pA/edit)
- [Original generation workflow](Social%20Media%20Post%20Generation%20Workflow.json)
- [Project demo and n8n setup guide](https://www.loom.com/share/12e27b10b4604d89b2672b1759a543c4)
