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
2. Invent ten varied inputs in **Evaluation Log**: two routine requests and eight realistic challenges. Use **Challenge Cases** in the workbook for ideas about missing facts, practical substance, statistics, feature status, updated notes, jargon, tone and closing requirements. Include the audience, purpose, requirements and an **Approved facts:** section. Use verified facts or fictional facts you define yourself. Export your inputs as CSV, upload them to the workflow and save the ten generated posts. Save the prompt and n8n run too.
3. Read each request, its approved facts and the resulting post. Choose **PASS or FAIL for each of the five dimensions** in the workbook. Review all five, even after finding a failure.
4. Write a short explanation for each failed dimension. Point to the actual claim, missing content or wording. The workbook calculates the overall result automatically.

### Five PASS/FAIL dimensions

| Dimension | PASS when | FAIL when |
| ----- | ----- | ----- |
| Factual Correctness | Every checkable claim is supported, calculations are correct, and limits or planned features stay explicit. | A claim is unsupported, a number is wrong, a planned feature sounds available, or a small test becomes a general guarantee. |
| Clarity | The intended reader understands the point after one reading. Essential terms and references are clear. | Unexplained jargon, ambiguous references or a disordered explanation prevents understanding. Minor wording preferences do not fail. |
| Value / Insight | Every explicit requirement is met. Advice names an action; examples show a situation and what to do or observe. | It misses a requirement, advertises rather than delivers the requested content, or substitutes slogans for practical examples. |
| Engagement | The opening gives a specific reason to read. The ending provides a feasible action or specific question. | The opening is generic hype, the ending is absent or only says 'Thoughts?', or it includes a prohibited call to action. |
| Tone Fit | The wording respects the reader and matches the audience, voice and situation. An apology acknowledges inconvenience. | A phrase insults or pressures the reader, minimizes a problem, or conflicts with the requested voice. |

Use rubric v4 for new reviews. If a request prohibits a call to action or question, end with a declarative takeaway; "Review both" is still a call to action. A missed word limit, format or required link fails Value / Insight. Count whitespace-separated words in the entire post. The **Rubric** tab has full definitions, PASS/FAIL examples and a checklist for every challenge case.

**Worked example:** The approved facts say a workshop is free, online, 60 minutes long and offers no certificate. A clear, useful and engaging post promises a certificate. Mark Factual Correctness **FAIL**. The other four dimensions may PASS, but the overall result is **FAIL**. Four passes cannot cancel one failure.

If evidence needed to judge a claim is missing, leave that dimension unfinished and explain what is needed. An explicitly unknown date or link may remain unknown; do not demand invented details. Clearly hypothetical teaching examples are allowed when consistent with the supplied facts. A post with unfinished reviews shows **PENDING**, unless another dimension already fails. Complete all five reviews before moving on.

## Part 2: Group the failures

Choose one main category when it fits: False or Unsupported Claims, Missing Useful Content, Missing Essential Details, or Missing Closing Action. If a new failure fits none of these, explain it in your feedback and propose a category rather than forcing a match. These patterns come from the 12 saved posts and instructor feedback. Use the definitions and examples in **Rubric**. **Failure Analysis** counts your new posts. Note a proposed fix.

For a few failures, inspect the n8n execution. Did the relevant facts and instructions actually reach the model? If essential details were never supplied, fix the brief; do not invent them. An ambiguous request does not prove an instruction was ignored. Record the evidence, likely cause and proposed fix in **Failure Traces**. Choose one recurring or high-impact problem.

## Part 3: Improve the generation prompt

Save the original prompt. Change one instruction in **Prepare Generation** to address the problem you observed. For example, clarify which facts may be used, require a missing practical example, or demonstrate the desired tone with a short example. Keep the same rubric version fixed for both runs. If you change a definition, review both sets again under the new rule before comparing them.

Record what you changed and why you expect it to help. Improve the workflow rather than editing the generated posts by hand.

## Part 4: Rerun and compare

1. Run the revised generator on the requests whose posts failed, plus at least one whose post passed. Keep the original requests and facts unchanged.
2. Save the new outputs in **Revised Posts** and review all five dimensions again. Keep the original posts and reviews in Evaluation Log.
3. Open **Comparison**. It matches the request IDs and shows whether each result was fixed, got worse, still passes or still fails. You do not need to fill comparison labels manually.

Report the original and revised PASS counts for the same requests you reran. Note which dimension improved and whether any previously passing dimension now fails. If all ten pass or all fail, try a clearly labeled extra case and report it separately. Keep every result. A challenge may still pass; use the existing worked failures to practice diagnosis, and do not claim a repair unless a saved failed case actually improves.

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

## Ready-to-run challenge dataset

[Download ten challenge inputs](examples/challenge-requests.csv). The same inputs are in **Challenge Cases** in the workbook. This is an instructor demonstration set with two routine and eight challenging requests, not ten pre-labeled failures. Participants can use it to design ten inputs of their own. The [case definitions](examples/challenge-requests.json) include review checks; only the request and approved facts are sent to the generator.

All facts are fictional. Outputs and human labels are deliberately blank. Use rubric `social-dimensions-v4` for the fresh baseline and its rerun. The earlier P01-P10 results used v3 and have not been relabeled.

## For maintainers

`src/rubric.js` holds the shared five-dimension policy. `src/generation.js` holds the generator system prompt. `src/judge.js` builds Jev's questions and the independent LLM prompt. Run `npm ci`, `npm run build:workflows`, then `npm test` after changes. See [validation](docs/validation.md).
