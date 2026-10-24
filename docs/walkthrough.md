# Current project walkthrough

This written demo replaces the previous scoring demonstration. It covers the
same files students will use for the binary publication-evaluation assignment.

## 1. See what a useful evaluation looks like

Open **Worked Examples** in the workbook. The examples are constructed reference
cases, not measured model results:

| Case | Human decision | Decisive evidence |
| --- | --- | --- |
| DEMO_001 | PASS | Delivers two approved resources and their uses; no CTA is required by the brief. |
| DEMO_002 | FAIL | Promises resources but names none and supplies no attachment. |
| DEMO_003 | FAIL | Invents a 90% improvement claim absent from the approved facts. |

The critique identifies evidence and why it matters. A fluent post can FAIL for
an unsupported claim. A plain post can PASS while still allowing optional polish.

## 2. Run the judge demo

1. Download [examples/posts.csv](../examples/posts.csv). It contains the three
   exact worked examples, context and human reference critiques.
2. Import [Social Media Jev Judge Only.json](../Social%20Media%20Jev%20Judge%20Only.json)
   into n8n. Create/select Header Auth on **Call Jev** and **Independent LLM Review**:
   name `Authorization`, value `Bearer <OpenRouter API key>`.
3. Execute the workflow and open **Upload Posts CSV**. Upload the CSV and submit.
4. Inspect **Normalize Jev Result**: there is one `Jev_Decision`, not a set of
   dimension grades. Inspect **Normalize Independent Review** for the separate
   `LLM_Critique` and `LLM_Decision`.
5. Download the CSV from **Download Results CSV**. Copy its data rows into a
   temporary workbook copy's **Evaluation Log A:AI**. Preserve the header and
   helper formulas in AJ:AN. Do not paste duplicate case/run rows.
6. Set Summary Run_ID to `worked-example`, Judge_Version to `jev-publication-v2.0`,
   and Judge_Split to `DEV`. Read the four confusion counts and both class-specific
   rates. These three constructed examples are only a wiring demonstration.

The initial TRAIN example list is empty. The model may disagree with the human
reference: inspect that disagreement instead of editing the label to match it.
If context or credentials are missing, fix the execution problem and rerun under
a new output filename. An API error must not become a quality FAIL.

## 3. Do the assignment with your own cases

Prepare 30 development briefs and 10 reserved briefs. For every case, supply
approved source text, constraints, persona and scenario. Set Context_Status READY
after checking that the packet is sufficient. Leave Model_Output blank when you
want generation. Use a new Run_ID, such as `baseline`, and stable Test_ID values.

Import [Social Media Post Generation Workflow.json](../Social%20Media%20Post%20Generation%20Workflow.json).
Attach OpenRouter Header Auth to **Generate Post**, upload your prepared CSV,
and download the generated posts. The workflow makes one generation pass and
records the generator version. It does not revise posts automatically.

Independently review each exact output. Fill Human_Critique, Human_Decision,
Human_Reviewer and Human_Policy_Version (`social-publication-v2`). Do this before
looking at automated judgments. Use Failure Traces to collect evidence, then
derive primary tags and count them in Failure Analysis.

## 4. Make and test one improvement

Change the generator prompt in `src/generation.js`, update GENERATOR_VERSION,
run `npm run build:workflows`, and reimport the generator workflow. For an n8n-only
exercise, edit the same GENERATOR_PROMPT and GENERATOR_VERSION constants embedded
in **Prepare Generation** and **Keep Generated Post**, and export that workflow
with your submission. Keep the judge policy fixed during this experiment.

Make a new input copy with the same cases and approved context. Set Run_ID to
`revised`; clear Model_Output. The generator clears prior labels on newly
generated posts. Append the new output rows to Evaluation Log and review them
afresh. Set Compare Runs baseline/revised IDs and fill the stable case IDs.

Inspect every PASS_TO_FAIL regression as well as FAIL_TO_PASS improvements.
Changed briefs, duplicate IDs, missing reviews and unchanged posts are flagged
and excluded from changed-output outcomes. Once the generator is frozen, run
and report the reserved briefs separately using Generator_Split=RESERVED.

## 5. Optional judge calibration

Use 30 frozen human-labeled baseline outputs: 6 TRAIN, 12 DEV and 12 TEST. Keep
related cases in one split. Add only TRAIN examples to the prompt. Refine the
judge on DEV, record versions, then test once after freezing. Keep each judge
version in a separate workbook snapshot so old and new predictions on the same
posts cannot be double-counted. See [integration details](jev-integration.md).

The [combined workflow](../Social%20Media%20Post%20Generation%20with%20Jev%20Judge.json)
is available after human calibration. It generates only blank posts, preserves
populated posts, then runs Jev and the independent reviewer. Attach credentials
to all three HTTP nodes. Its automatic results do not replace the human reference.
