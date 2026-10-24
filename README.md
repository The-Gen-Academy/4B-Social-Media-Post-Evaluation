# 4B: Social Media Post Evaluation

Review actual AI-generated posts, explain what works or fails, improve the generator,
and check whether the change helped. Give each post **one PASS or FAIL**, supported
by a written critique. This exercise follows [Hamel Husain's approach](https://hamel.dev/blog/posts/llm-judge/).

## Start here

- [Assignment handout](https://docs.google.com/document/d/1tGiUY_TwSEagGAc0sL96trBsf2RK04OVu9VI_rTx7pA/edit)
- [Google workbook](https://docs.google.com/spreadsheets/d/1y8-rCXo2-tBDPf2kIZxWRDzSK2z9gwZWpdYbZqiJoqI/edit#gid=1455183772)
- [Excel workbook](Social%20Media%20Post%20Evaluation.xlsx)
- [Walkthrough](docs/walkthrough.md)

## The six-column Evaluation Log

| Column | What to put here |
| --- | --- |
| Test_ID | A unique case ID. Keep it the same when testing a revised generator. |
| User_Input | The brief, audience, constraints and approved source facts, all in one cell. |
| Model_Output | The exact generated post. |
| Human_Feedback | Your critique: specific evidence and why it matters. |
| Status | One overall PASS or FAIL. Leave blank until reviewed. |
| Failure_Category | The main problem in a failed post. Leave blank for PASS. |

There are no dimension scores, totals, reviewer names or run metadata columns.
The original 12 posts and feedback are retained. Review that earlier feedback
against your current brief before assigning PASS or FAIL.

The other tabs have narrow purposes:

| Tab | Use |
| --- | --- |
| Failure Analysis | Category, Count and Suggested_Fix. Counts come from FAIL rows in Evaluation Log. |
| Failure Traces | Test_ID, Evidence, Likely_Cause and Proposed_Fix for selected failures. |
| Judge | Optional automated results, kept separate from your human review. |

## Complete the exercise

1. Prepare 30 development briefs. Put the request, audience and constraints in
   User_Input. End the cell with **Approved facts:** followed by actual source
   text and its source. If no external facts are needed, say so explicitly.
2. Generate the posts. Review five, clarify what success means, then review all
   30. Write Human_Feedback before setting Status.
3. Group failures in Failure_Category. Use Failure Analysis and a few execution
   traces to choose one focused change.
4. Save the baseline workbook. Make a separate revised copy, keep the same
   Test_IDs and briefs, clear Model_Output and review fields, and generate again.
   Compare the human judgments: FAIL→PASS, PASS→FAIL, PASS→PASS and FAIL→FAIL.
5. Freeze the change. Compare baseline and revised generators on 10 reserved
   briefs that did not influence the change. Keep these results in separate
   workbook copies and report them separately.

Save prompts, model settings and n8n executions with each workbook copy. Students
do not need to repeat this information on every row. The workbook supports 500
posts and 20 failure categories; extend the Count formulas for more categories.

## Run in n8n

Import the workflow for your stage:

- [Generate posts](Social%20Media%20Post%20Generation%20Workflow.json)
- [Judge existing posts](Social%20Media%20Jev%20Judge%20Only.json)
- [Generate and judge](Social%20Media%20Post%20Generation%20with%20Jev%20Judge.json)

Attach OpenRouter Header Auth to each HTTP node: header name Authorization,
value Bearer followed by your API key. Exports contain no credentials.
Upload a CSV exported from the six-column Evaluation Log.

**Generation** downloads six columns for Evaluation Log A:F.
**Judge-only** downloads seven columns for Judge A:G.
The combined workflow has separate downloads for posts and judge results.
Review the posts yourself before opening automated results.

A populated Model_Output is preserved. Clear it in a new workbook copy to
generate a fresh post. New posts clear the earlier human labels. Missing source
facts and API errors leave decisions blank, with an explanation in feedback or
the judge's Run_Status/Review_Notes. No workflow publishes posts.

## Optional judge exercise

Freeze 30 reviewed baseline cases into separate TRAIN (6), DEV (12) and TEST (12)
files/workbook copies. Keep related inputs together. Only TRAIN examples enter
the prompt. Use DEV to improve the judge, then freeze it before TEST.

Judge has seven columns: Test_ID, Human_Status, Jev_Status, LLM_Critique,
LLM_Status, Run_Status and Review_Notes. Jev makes a binary decision. A separate
LLM supplies its own critique and decision; the critique does not explain Jev's
reasoning. Compare **Human_Status with Jev_Status**. Investigate disagreements
in Review_Notes, without changing human labels just to agree with the model.

Report the four human/judge confusion counts, false-pass and false-fail rates,
coverage and execution errors. False-pass rate divides by compared human FAIL
cases; false-fail rate divides by compared human PASS cases. A missing class is
not estimable. A small classroom test does not establish production reliability.

## CLI and implementation

~~~bash
npm ci
cp .env.example .env
# Set OPENROUTER_API_KEY in your editor.
npm run judge -- --input examples/posts.csv --output results/demo.csv --workshop
npm run judge -- --input results/demo.csv --report-only
npm run judge -- --input examples/posts.csv --output results/preview.csv --dry-run
~~~

The workshop export matches the seven-column Judge tab. A companion
.details.jsonl file preserves source packets, human critiques and model details;
.summary.json holds the measured counts. Keep these files beside the CSV.
Omit --workshop for an advanced CSV with execution details.

Edit the generator in src/generation.js and the policy/TRAIN examples in
src/judge.js. Follow [integration details](docs/jev-integration.md), rebuild the
workflows with npm run build:workflows, and run npm test.
