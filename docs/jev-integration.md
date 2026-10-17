# Jev integration

## What runs

Each nonempty `Model_Output` produces one TypeSafe-format request. The CLI supports
direct TypeSafe at `https://api.typesafe.ai/v1/systemone` and Vercel AI Gateway at
`https://ai-gateway.vercel.sh/typesafe/v1/systemone`. The n8n imports default to
direct TypeSafe. The request contains a state and
six independent questions: five **Score** questions and one failure-category
**Choice**. There is no generative-model fallback. Jev does not produce prose
feedback; the existing critic still provides revision advice in the generation
workflow.

The implementation uses the [official HTTP contract](https://docs.typesafe.ai/api).
It pins `jev-1.13.0`, which the [model documentation](https://docs.typesafe.ai/models)
lists as the stable alias target as of October 15, 2026. Use `JEV_MODEL` locally,
or edit the `model` variable in **Prepare Jev Request**, to evaluate a different
version. Gateway uses the verified model ID `typesafe-ai/jev-1.13.0`; direct
TypeSafe uses `jev-1.13.0`. Record new runs separately when switching models.
The [Gateway compatibility guide](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)
documents the shared response contract and service-specific credentials.

## Input contract

For the workshop, export only **Jev Results** as UTF-8 CSV, with its first row as
headers. The CLI accepts CSV, not the whole XLSX workbook. Quoted fields,
commas, newlines and a UTF-8 BOM are supported. Duplicate headers are rejected.

Participants need only `Test_ID`, `User_Input`, and `Model_Output`; put approved
facts and requirements in `User_Input`. Jev fills the five scores and code fills
the total/status. The 10-column n8n export matches the workbook exactly. The
additional fields below are optional instructor inputs. Historical human grades
remain in the hidden **Evaluation Log** and related instructor tabs.

| Column | Use |
| --- | --- |
| `Model_Output` | Candidate post. Empty/whitespace-only values become SKIPPED without a call. |
| `User_Input` | Original topic/request; facts explicitly supplied here may ground the post. |
| `Test_ID` | Identifier retained for comparison; duplicate or missing IDs do not merge rows. |
| `Reference_Facts` | Approved source text, product facts, dates, actual testimonials or campaign brief. Include text, not only a URL: Jev does not fetch links. |
| `Constraints` | Explicit requirements such as format, length or permitted voice. |
| `Persona` | Desired voice. Defaults to professional, clear and accessible for a technical audience. |
| `Status` | Human PASS/FAIL label, case-insensitive; used only after evaluation. |
| Human rubric scores and `Human_Feedback` | Preserved as input data, never included in Jev's state. |

Only `User_Input`, `Model_Output`, `Reference_Facts`, `Constraints` and `Persona`
enter the judge's state. Keep references independently reviewed: the post being
graded is not a source of facts about itself. Missing reference text is recorded
as `reference_facts_missing`, even when the rubric gives a provisional PASS.

## Score conversion and routing

Jev [Score responses](https://docs.typesafe.ai/primitives/score) use zero-based
levels and a fractional probability-weighted score. With five rubric levels,
the API score spans **0–4**, not 1–5 and not 0–1.

For the handout's integer rubric, this implementation chooses the
highest-probability level and adds one. Ties choose the lower grade. For example,
probability 0.4 on level 2 and 0.6 on level 3 yields grade **4**. The original
weighted score plus one (**3.6** in this example) is also retained in the
`Jev_<Metric>_Expected` column. This is an explicit conversion policy to calibrate
against the human labels; it is not a claim that the most likely grade is correct.

Code computes the sum of the five integer grades. The decision is exactly:

```text
FAIL if Factual_Correctness < 4 OR Total_Score < 20
PASS otherwise
```

The returned Choice does not override those rules. If the factual cutoff fails,
the failure category is Incorrect or Hallucinated Content. For other failures,
the returned category is used. If Jev returns `none` for a failed post, code
assigns a fallback from the weakest dimension and requires review.
`Jev_Category_Source` distinguishes these decisions from Jev's Choice.

`Jev_Review_Required` is separate from `Jev_Status`. It is true when any rubric
confidence is below the configured threshold, reference facts are missing,
or the independent category conflicts with the score decision. For failed
posts, low confidence in the category also requests review. Confidence
describes the model's distribution; it is not measured accuracy on this dataset.

If downstream publishing is added later, only consider rows with
`Jev_Status == PASS` **and** `Jev_Review_Required == false`. This repository
currently exports results without publishing.

Malformed responses, missing question answers, invalid distributions and
failed requests produce **ERROR** with blank scores, never a fabricated FAIL
or PASS. Empty posts produce **SKIPPED**. Old `Jev_*` result columns are cleared
on errors/skips so stale grades cannot appear current.

## n8n setup

Import one of the two generated JSON files into your n8n instance. Both imports
start inactive and have no credential IDs or keys.

1. In **Call Jev**, create/select **Header Auth**. Header name: `Authorization`.
   Header value: `Bearer <TypeSafe key>`. The default URL is
   `https://api.typesafe.ai/v1/systemone` and the model is `jev-1.13.0`.
2. In the generation variant, also connect your OpenAI credential to both
   existing model nodes. Confirm the selected creator/critic model IDs are
   available in your account.
3. Execute the form trigger and upload the Jev Results CSV. For existing
   posts, **Social Media Jev Judge Only.json** avoids generation entirely.
4. **Normalize Jev Result** retains the complete diagnostic result. The following
   **Workshop Results** node selects only the 10 participant columns. Download
   the CSV binary from **Download Results CSV** and paste its data rows as values
   at A2 in **Jev Results**. Clear `Model_Output` before rerunning generation for
   a revised prompt; populated posts are judged without regeneration.

For Vercel AI Gateway, change **Call Jev** to
`https://ai-gateway.vercel.sh/typesafe/v1/systemone`, select a Gateway Header Auth
credential, and set `const model = 'typesafe-ai/' + DEFAULT_MODEL` in
**Prepare Jev Request**. Do not send a
Gateway key to the direct TypeSafe endpoint or vice versa.

The generation variant routes populated rows around the creator and keeps them
for judging. Rows with neither topic nor post bypass generation and become
SKIPPED. Final posts are merged by original row index, so repeated Test_IDs and
topics cannot overwrite one another. Jev runs after this merge and before export.

The judge loop processes one row at a time. Each HTTP request has a 30-second
timeout and at most three attempts separated by five seconds using n8n's built-in
retry setting. After exhaustion, the error reaches normalization and the loop
continues. The CLI instead uses exponential backoff for transient errors and
honors Retry-After up to 30 seconds; longer requested waits produce an error for
a later rerun. n8n credential-configuration errors may stop execution before the
HTTP node can emit a row: resolve these in **Call Jev** before running the batch.

The workflow's original creator and critic prompts remain as provided by the
project. Jev is a final independent rubric evaluator, not the critic's rewrite
controller. If those prompts disagree with your intended persona or constraints,
align them as part of the exercise before measuring improvement.

## CLI and reports

```bash
npm ci
cp .env.example .env
# Edit .env to select a provider and set its matching key. Do not commit it.
npm run judge -- --input posts.csv --output results/baseline.csv
npm run judge -- --input posts.csv --output results/workshop.csv --workshop
npm run judge -- --input posts.csv --output results/requests.csv --dry-run
npm run judge -- --input results/baseline.csv --report-only
```

For Gateway, set `JEV_PROVIDER=gateway`, `AI_GATEWAY_API_KEY`, and
`JEV_MODEL=typesafe-ai/jev-1.13.0`. For direct TypeSafe, set
`JEV_PROVIDER=typesafe`, `TYPESAFE_API_KEY`, and `JEV_MODEL=jev-1.13.0`.
The client uses only the credential belonging to the selected provider.

Gateway `403 customer_verification_required` means the account requires a valid
payment method. Enable it in the Vercel dashboard, then retry the failed rows
with a new output name. The CLI reports that cause without exposing provider
response bodies or credentials. Other 401/403 errors require checking credentials
and account access. Authentication errors are not retried by the CLI.

`--workshop` exports only the same 10 columns as n8n and the workbook. Omit the
flag to preserve human labels and all diagnostic fields for calibration. The
summary JSON is still computed from full in-memory results. A compact CSV no
longer contains human labels, so later `--report-only` cannot compare them.

The CLI never modifies the input or overwrites an existing output. Use a new
output path for each run. It persists each completed row to the CSV and writes
a summary after the batch. An error in any row sets a nonzero exit code while
preserving successful judgments. Interrupted runs may have an incomplete CSV;
they are not automatically resumed. Re-run unfinished rows into a new file.
CSV formula-like strings are escaped on export for safe spreadsheet opening.

The report includes evaluated/skipped/error counts, review count, number of
valid human labels, number actually compared, agreement, false passes, false
fails, and row-specific disagreements. Missing and invalid human labels are
never treated as passes. The report warns when fewer than 20 labeled rows were
compared; even more rows do not by themselves prove reliability.

For a calibration exercise:

1. Label representative posts independently, including factual errors, generic
   resource lists, weak CTAs, and strong posts. Complete the five dimensions and
   human Status; retain the relevant source facts.
2. Separate calibration rows from held-out rows before changing question wording.
3. Use disagreements on the calibration set to refine `QUESTIONS` in
   `src/judge.js`. Increment `RUBRIC_VERSION`; rebuild JSON workflows with
   `npm run build:workflows`.
4. Freeze rubric, score mapping, model version and confidence threshold, then
   evaluate the held-out CSV once. Report its sample size and false passes as
   well as agreement. Do not tune on these held-out outcomes and still call the
   resulting number an independent test.
5. For regression testing, keep before/after posts under stable Test_IDs and
   compare both the previously failing and previously passing cases.

## Validation status

Automated tests use fabricated API fixtures to verify the HTTP contract,
thresholds, malformed response handling, retries, CSV round trips, human-label
isolation, and n8n Code node execution. They do not call Jev. The example CSV is
fictional and does not contain measured Jev results. On October 15, 2026, a live
request for the workbook's first post reached AI Gateway but returned
`403 customer_verification_required`. The remaining posts were not submitted.
No scores or agreement metrics are claimed from that attempt; the workbook's
12 posts remain without successful Jev results. The earlier error is preserved
in the hidden instructor tabs; the simplified participant sheet starts with
blank scores. All 12 currently lack `Reference_Facts`,
so a successful run will still flag them for human review. Actual n8n
import/execution requires your n8n instance and has not been performed.

Generated workflow source lives in `scripts/build-workflows.js`; don't edit
embedded rubric copies directly. Run `npm run build:workflows` after changes to
the shared evaluator and `npm test` to check both entrypoints.
