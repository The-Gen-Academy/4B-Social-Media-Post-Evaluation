# Project walkthrough

## 1. Prepare one case

Start in Evaluation Log. Use one row per Test_ID. User_Input contains the whole
brief, including source facts, so you do not need separate context columns:

~~~text
Write a LinkedIn post for beginning AI engineers.
Explain one practical retrieval test, then ask a relevant question.
Use at most 80 words.

Approved facts:
Retrieval selects source passages for an answer. Irrelevant passages can leave
an answer unsupported. No benchmark result or improvement percentage is supplied.
Source: instructor-approved facts for this teaching example.
~~~

The exact **Approved facts:** heading lets the workflow find the evidence.
Put audience and constraints before it. Add actual excerpts, not just URLs.
If the task needs no external factual claims, state that under the heading.

## 2. Generate and review

Import Social Media Post Generation Workflow.json into n8n. Attach OpenRouter
Header Auth to Generate Post. Export Evaluation Log as CSV and upload it through
Upload Posts CSV. Download the output from Download Results CSV and paste its
six data columns into Evaluation Log A:F.

Read the post, write Human_Feedback, then select PASS or FAIL in Status.
Do this yourself before viewing any automated opinion.

| Post | Status | Critique |
| --- | --- | --- |
| Gives a practical retrieval inspection step and a relevant closing question. | PASS | Delivers the requested test within the length limit; claims match the source facts. |
| Claims retrieval improves accuracy by 40%. | FAIL | The source contains no benchmark supporting 40%; remove or substantiate the claim. |
| Says retrieval matters but gives no test. | FAIL | Omits the practical inspection step requested in the brief. |

These are teaching illustrations, not measured model results.
If facts are missing, leave Status blank and explain what is needed in feedback.
If a generation call fails, the row remains present with blank output/status and
a Generation issue message. Inspect the n8n execution and retry after fixing it.

## 3. Find a failure pattern

Give each FAIL one Failure_Category. In Failure Analysis, enter the same
category text; Count updates automatically. Add a Suggested_Fix.
Use Failure Traces for selected cases: quote the Evidence, inspect the n8n
execution, distinguish a Likely_Cause from observation, and record a Proposed_Fix.

The workbook retains earlier instructor feedback on the original posts.
Re-review it under the current brief; it is not an automatically approved label.

## 4. Compare a change

Keep the baseline workbook. Make a revised copy, retain Test_ID and User_Input,
and clear Model_Output, Human_Feedback, Status and Failure_Category before
generating again. Review the new posts afresh.

Match Test_IDs between copies. Count fixes (FAIL→PASS), regressions (PASS→FAIL)
and the two unchanged outcomes. Save the prompt/settings and workflow execution
with each copy. Use separate copies for the 10 reserved cases and report those
results separately from the 30 development cases. Do not mix multiple versions
of the same post into one Evaluation Log.

## 5. Optional: run and calibrate a judge

Complete your human review first. Save frozen TRAIN, DEV and TEST workbook/CSV
copies. Import Social Media Jev Judge Only.json; attach OpenRouter Header Auth
to Call Jev and Independent LLM Review.

Upload the six-column Evaluation Log CSV. Download judge_results.csv from
Download Results CSV. Paste its seven data columns into the **Judge** tab A:G:

| Column | Meaning |
| --- | --- |
| Test_ID | Links to the exact post in this workbook's Evaluation Log. |
| Human_Status | Your reference PASS/FAIL from the evaluated file. |
| Jev_Status | Jev's PASS/FAIL prediction. |
| LLM_Critique | A separate LLM's evidence-based critique. |
| LLM_Status | That separate LLM's PASS/FAIL opinion. |
| Run_Status | Whether each model completed, failed or lacked context. |
| Review_Notes | Execution issues and your investigation of disagreements. |

Do not paste these results over the human review. Jev cannot write prose:
LLM_Critique is an independent opinion, not an explanation of Jev's decision.
Review errors and blank decisions; do not count them as PASS or quality FAIL.

Compare Human_Status with Jev_Status. Use DEV disagreements to revise the judge
and only TRAIN cases as prompt examples. Freeze it, then evaluate TEST once.
Save a new workbook copy for each judge version. Record counts, false-pass and
false-fail rates, and valid decisions / attempted cases in your submission.

The combined workflow also has Download Posts CSV (six columns) and
Download Results CSV (seven judge columns). Review posts before opening judge
results. Generation-only followed by judge-only is the simplest learning path.

For a runnable illustration, examples/posts.csv contains three constructed
cases with approved facts and human critiques. Keep them separate from measured
student results. See jev-integration.md for TRAIN formatting and CLI details.
