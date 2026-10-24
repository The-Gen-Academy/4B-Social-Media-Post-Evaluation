# 4B: Human-led Social Media Post Evaluation

Learn to define publication quality, critique actual outputs, fix recurring errors,
and check for regressions. Each exact post receives **one human PASS or FAIL**
with an evidence-based critique. Any material blocker means FAIL; optional polish
can still PASS. Supported claims, clear communication, delivered promises, brief
compliance and appropriate voice are acceptance requirements, not numerical grades.

This exercise follows [Hamel Husain's critique-shadowing approach](https://hamel.dev/blog/posts/llm-judge/).
The course's workload, publication policy and sample sizes are teaching choices.

## Start here

- [Assignment handout](https://docs.google.com/document/d/1tGiUY_TwSEagGAc0sL96trBsf2RK04OVu9VI_rTx7pA/edit)
- [Shared Google workbook](https://docs.google.com/spreadsheets/d/1y8-rCXo2-tBDPf2kIZxWRDzSK2z9gwZWpdYbZqiJoqI/edit)
- [Download the matching Excel workbook](Social%20Media%20Post%20Evaluation.xlsx)
- [Current demo: step-by-step walkthrough](docs/walkthrough.md)

## Required exercise

1. Prepare **30 development briefs and 10 reserved briefs**. Cover different
   scenarios and audiences. Include approved source text, constraints and stable
   `Test_ID` values. Keep the reserved set out of generator tuning.
2. Generate a baseline. A `Run_ID` identifies one set of exact posts. Review each
   output yourself: write `Human_Critique`, then `Human_Decision` and
   `Human_Policy_Version`. `Human_Reviewer` is optional for this individual exercise.
   An incomplete evaluation packet stays `NEEDS_CONTEXT`
   with a blank decision. An unsupported claim in an otherwise complete packet FAILs.
3. Group observed failures into useful tags. Cite cases, identify a cause, and
   make a targeted generator change. Categories emerge from critiques.
4. Generate revised outputs under a new `Run_ID`, preserving case IDs and briefs.
   Review the new posts afresh. Compare FAIL→PASS improvements and PASS→FAIL
   regressions. Freeze the generator and evaluate the 10 reserved briefs separately.

Assessment rewards grounded reasoning and honest experiments, not a high pass rate.

## Workbook

| Tab | Purpose |
| --- | --- |
| Start Here | Policy, workflow and field instructions. |
| Evaluation Log | Source evidence, exact posts, human labels, optional model reviews and provenance. |
| Summary | Human pass rate and coverage; separate judge confusion counts and class-specific rates. |
| Compare Runs | Paired human outcomes; flags missing/duplicate IDs, changed briefs, unreviewed or unchanged posts. |
| Failure Analysis | Counts the primary tags you derive from human failures. |
| Failure Traces | Evidence, violated requirement, proposed fix and rerun outcome. |
| Worked Examples | Three constructed teaching examples; excluded from performance metrics. |

The **35 CSV columns match Evaluation Log A:AI**. Paste data into those columns;
AJ:AN contain helper formulas. The workbook supports 500 output rows and 100
paired comparison cases. Extend all formulas and ranges together for larger sets.
The original 12 posts and instructor critiques are preserved as historical
examples. Approved context was absent, so their current decisions are blank.

Use one row per `Test_ID + Run_ID`. For a new generator run, append new rows.
For judge calibration on fixed posts, keep each judge version in a separate
workbook snapshot, preserving the exact posts, labels and split membership.
Do not append duplicate case/run rows from multiple judge versions to one log.

## Optional: calibrate an automated judge

Freeze 30 human-labeled baseline examples into **6 TRAIN / 12 DEV / 12 TEST**.
Keep related briefs and all versions of an input in the same split. Only TRAIN
examples enter the prompt. Use DEV to refine instructions, then freeze the judge
and evaluate TEST once. These splits are separate from the generator's reserved set.

The Jev path asks **one binary Choice question**. Jev cannot generate prose, so
a separate generative model produces `LLM_Critique` and `LLM_Decision` without
seeing Jev's prediction or the current human label. This is an independent
review, **not an explanation of Jev's reasoning**. Inspect disagreements against
the human evidence. Do not average or vote the two decisions into a new grade.

Report the four confusion counts, fail detection, pass acceptance, false-pass
and false-fail rates, coverage and errors. False-pass rate uses human FAIL cases
as its denominator; false-fail rate uses human PASS cases. Zero denominators are
not estimable. A 12-case test demonstrates the procedure; it does not establish
production reliability. Confidence is not measured accuracy.

## Run in n8n

Import the workflow for your stage:

- [Generate posts](Social%20Media%20Post%20Generation%20Workflow.json)
- [Judge existing posts](Social%20Media%20Jev%20Judge%20Only.json)
- [Generate and judge](Social%20Media%20Post%20Generation%20with%20Jev%20Judge.json)

Each HTTP node needs an OpenRouter **Header Auth** credential: header name
`Authorization`, value `Bearer <your API key>`. Exports contain no credentials.
The generator and independent reviewer use `openai/gpt-4.1-mini`; the Jev request
uses `typesafe/jev-1.13`. Record the actual returned model and run settings.

Execute the workflow, open **Upload Posts CSV**, upload a prepared CSV, and submit.
Download the binary CSV from **Download Results CSV** in the execution. Generation
is one pass so students can inspect baseline and revised outputs. Populated posts
are preserved; clear `Model_Output` in a new input copy and use a new `Run_ID` to
generate fresh posts. New posts clear prior human labels and judge results.

`ERROR`, `NEEDS_CONTEXT`, `SKIPPED` and `AMBIGUOUS` are execution states, never
quality labels. No workflow publishes content. See the [walkthrough](docs/walkthrough.md)
for context preparation, imports, calibration and regression comparison.

## CLI and implementation

```bash
npm ci
cp .env.example .env
# Set OPENROUTER_API_KEY in your editor.
npm run judge -- --input examples/posts.csv --output results/demo.csv --workshop
npm run judge -- --input results/demo.csv --report-only
npm run judge -- --input examples/posts.csv --output results/preview.csv --dry-run
```

Use a new output path for every run. `--workshop` exports the workbook contract,
including human evidence. Omit it to retain raw model responses in the CSV.
The summary separates run, judge version and split, records the actual model IDs,
and includes failed or incomplete calls in each group's coverage denominator.
No live result is implied by the constructed examples.

Edit the publication policy and TRAIN examples in [src/judge.js](src/judge.js).
Change `JUDGE_VERSION` when judge instructions, examples or settings change.
Change `RUBRIC_VERSION` only when the human acceptance policy changes, and then
re-adjudicate affected human labels. Edit the generator prompt and its version in
[src/generation.js](src/generation.js). Rebuild the importable workflows and run checks:

```bash
npm run build:workflows
npm test
```

Tests cover binary response validation, ties, missing context, duplicate identities,
label isolation, independent critiques, CSV round trips, provider errors and
embedded n8n code. See [integration details](docs/jev-integration.md) for contracts
and validation limits.
