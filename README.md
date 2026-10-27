# Social Media Post Evaluation

Study the worked examples, then **invent ten inputs of your own** and generate **10 new posts** in n8n. Review each post, improve the generation prompt, and check whether the change helps.

**All five dimensions must PASS for the post to PASS. If any dimension FAILS, the whole post FAILS.** There are no numerical scores or averages.

## Start here

* Make one copy of the [workbook](https://docs.google.com/spreadsheets/d/1y8-rCXo2-tBDPf2kIZxWRDzSK2z9gwZWpdYbZqiJoqI/edit). An [Excel copy](Social%20Media%20Post%20Evaluation.xlsx) is also included.
* Download the [generation workflow](Social%20Media%20Post%20Generation%20Workflow.json). You will supply ten inputs of your own.
* Follow the [n8n setup guide](docs/walkthrough.md). Generation uses an OpenRouter API key. The optional Jev exercise uses a separate TypeSafe API key.

Start with the **12 worked reviews in Existing Examples**. See how the feedback supports the dimension decisions, overall result and main failure category. **Rubric** provides the five rules and four failure categories before you begin. Blank factual checks in older examples mean the saved evidence is insufficient. These examples do not count toward your ten new posts.

## Part 1: Invent 10 inputs, generate and evaluate

1. Import the generation workflow into n8n and connect your credential to **Generate Post**.
2. Invent ten different inputs in **Evaluation Log**. Include the audience, purpose, requirements and an **Approved facts:** section. Use verified facts or fictional facts you define yourself. Export your inputs as CSV, upload them to the workflow and save the ten generated posts. Save the prompt and n8n run too.
3. Read each request, its approved facts and the resulting post. Choose **PASS or FAIL for each of the five dimensions** in the workbook. Review all five, even after finding a failure.
4. Write a short explanation for each failed dimension. Point to the actual claim, missing content or wording. The workbook calculates the overall result automatically.

### Five PASS/FAIL dimensions

| Dimension | PASS when | FAIL when |
| ----- | ----- | ----- |
| Factual Correctness | Concrete claims agree with the approved facts. | A claim is invented, unsupported or contradicts the facts. |
| Clarity | The main point is easy to understand; the writing is coherent and concise. | Confusing wording, repetition or structure obscures the main point. |
| Value / Insight | The post delivers the requested information, example, resource or useful takeaway. | It is generic filler, omits requested substance or promises content that is not supplied. |
| Engagement | The opening gives a reason to read and the ending offers a relevant action or question. | The opening has no clear appeal, or the ending lacks a relevant action or question. |
| Tone Fit | The language is professional, accessible and suitable for the audience and requested voice. | It is inappropriate, unnecessarily difficult, condescending or inconsistent with the requested voice. |

If the request explicitly prohibits a call to action or question, a useful closing takeaway is sufficient for Engagement. Missing an explicit word limit, format or required link fails Value / Insight. Optional stylistic preferences alone do not cause a failure. The **Rubric** tab contains the full definitions.

**Worked example:** The approved facts say a workshop is free, online, 60 minutes long and offers no certificate. A clear, useful and engaging post promises a certificate. Mark Factual Correctness **FAIL**. The other four dimensions may PASS, but the overall result is **FAIL**. Four passes cannot cancel one failure.

If the source facts or request are missing, leave the affected dimension unfinished and explain what is needed. A post with unfinished reviews shows **PENDING**, unless another dimension already fails. Complete all five reviews before moving on.

## Part 2: Group the failures

Choose one main category for each failed post: False or Unsupported Claims, Missing Useful Content, Missing Essential Details, or Missing Closing Action. These patterns come from the 12 saved posts and instructor feedback. Use the definitions and examples in **Rubric**. **Failure Analysis** counts your new posts. Note a proposed fix.

For a few failures, inspect the n8n execution. Did the relevant facts and instructions actually reach the model? If essential details were never supplied, fix the brief; do not invent them. An ambiguous request does not prove an instruction was ignored. Record the evidence, likely cause and proposed fix in **Failure Traces**. Choose one recurring or high-impact problem.

## Part 3: Improve the generation prompt

Save the original prompt. Change one instruction in **Prepare Generation** to address the problem you observed. For example, clarify which facts may be used, require a missing practical example, or demonstrate the desired tone with a short example. Keep the five evaluation rules fixed.

Record what you changed and why you expect it to help. Improve the workflow rather than editing the generated posts by hand.

## Part 4: Rerun and compare

1. Run the revised generator on the requests whose posts failed, plus at least one whose post passed. Keep the original requests and facts unchanged.
2. Save the new outputs in **Revised Posts** and review all five dimensions again. Keep the original posts and reviews in Evaluation Log.
3. Open **Comparison**. It matches the request IDs and shows whether each result was fixed, got worse, still passes or still fails. You do not need to fill comparison labels manually.

Report the original and revised PASS counts for the same requests you reran. Note which dimension improved and whether any previously passing dimension now fails. If the first ten posts all pass or all fail, add a clearly labeled extra request to obtain the missing comparison type and report the extra case separately.

## Part 5: Decide where Jev fits (optional)

Complete your human reviews first. Jev makes fast, structured [System 1 decisions](https://docs.typesafe.ai/introduction). Ask: **can this check be made quickly from the supplied information, or does it need further evidence and reasoning?** A PASS/FAIL answer alone does not make a task simple.

Consider the five dimensions before deciding what to automate:

* **Clarity and Tone Fit:** narrow checks, such as spotting undefined jargon or insulting language, may be candidates. Test them rather than assuming the whole dimension is suitable.
* **Factual Correctness:** Jev needs your approved facts. Comparing a claim with a supplied fact is different from independently verifying truth. Reliable sources are still needed.
* **Value / Insight and Engagement:** usefulness and audience appeal need context and judgment. A call to action alone does not establish engagement. Consider an LLM with context and human review.

**Choose one dimension** and a specific check Jev might handle. Explain what information it needs and its limits. You may conclude none is suitable as currently defined.

To experiment, run your ten saved posts through [Social Media Jev Judge Only.json](Social%20Media%20Jev%20Judge%20Only.json). Connect a **TypeSafe API key** to **Call Jev** and an **OpenRouter API key** to **Independent LLM Review**. The workflow tests all five dimensions with both models; neither sees human labels or the other model's answers. Compare each dimension with your reviews. Inspect disagreements before deciding where Jev fits.

## Part 6: Improve the judge (optional)

If a suitable check has unclear instructions, refine it using the [integration guide](docs/jev-integration.md) and rerun the saved posts. Compare mistakes before and after. Missing evidence or deeper reasoning may require a different approach. These ten posts are an experiment, not proof of reliability.

## What to submit

* Your ten original inputs and approved facts, the generated posts, all five human decisions per post, overall results and brief reasons for failures.
* Failure categories, a few supporting execution traces and the exact generation-prompt change.
* Original and revised outputs, fresh dimension reviews, comparison results and both saved prompts/runs.
* If you try the judges: which checks suit Jev and why, supporting results and disagreements, and any instruction change you tested.

## For maintainers

`src/rubric.js` holds the shared five-dimension policy. `src/generation.js` holds the generator system prompt. `src/judge.js` builds Jev's questions and the independent LLM prompt. Run `npm ci`, `npm run build:workflows`, then `npm test` after changes. See [validation](docs/validation.md).
