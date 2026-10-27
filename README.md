# Social Media Post Evaluation

Generate **10 new posts** in n8n. Review every post across five dimensions, improve the generation prompt, and check whether the change helps.

**All five dimensions must PASS for the post to PASS. If any dimension FAILS, the whole post FAILS.** There are no numerical scores or averages.

## Start here

- Make one copy of the [workbook](https://docs.google.com/spreadsheets/d/1y8-rCXo2-tBDPf2kIZxWRDzSK2z9gwZWpdYbZqiJoqI/edit). An [Excel copy](Social%20Media%20Post%20Evaluation.xlsx) is also included.
- Download the [10-request CSV](examples/10-post-requests.csv) and [generation workflow](Social%20Media%20Post%20Generation%20Workflow.json).
- Follow the [n8n setup guide](docs/walkthrough.md). Generation uses an OpenRouter API key. The optional Jev exercise uses a separate TypeSafe API key.

The ten requests include fictional approved facts so you can run the exercise immediately. You may adapt them before generating. The 12 older posts and their feedback are preserved in **Existing Examples** as reference material. They do not count toward your ten new posts.

## Part 1: Generate 10 posts and evaluate each dimension

1. Import the generation workflow into n8n and connect your credential to **Generate Post**.
2. Upload the supplied 10-request CSV and run the workflow. Save the ten generated posts in **Evaluation Log**. Save the prompt and n8n run too.
3. Read each request, its approved facts and the resulting post. Choose **PASS or FAIL for each of the five dimensions** in the workbook. Review all five, even after finding a failure.
4. Write a short explanation for each failed dimension. Point to the actual claim, missing content or wording. The workbook calculates the overall result automatically.

### Five PASS/FAIL dimensions

| Dimension | PASS when | FAIL when |
| --- | --- | --- |
| Factual Correctness | Concrete claims agree with the approved facts. | A claim is invented, unsupported or contradicts the facts. |
| Clarity | The main point is easy to understand; the writing is coherent and concise. | Confusing wording, repetition or structure obscures the main point. |
| Value / Insight | The post delivers the requested information, example, resource or useful takeaway. | It is generic filler, omits requested substance or promises content that is not supplied. |
| Engagement | The opening gives a reason to read and the ending offers a relevant action or question. | The opening has no clear appeal, or the ending lacks a relevant action or question. |
| Tone Fit | The language is professional, accessible and suitable for the audience and requested voice. | It is inappropriate, unnecessarily difficult, condescending or inconsistent with the requested voice. |

If the request explicitly prohibits a call to action or question, a useful closing takeaway is sufficient for Engagement. Missing an explicit word limit, format or required link fails Value / Insight. Optional stylistic preferences alone do not cause a failure. The **Rubric** tab contains the full definitions.

**Worked example:** The approved facts say a workshop is free, online, 60 minutes long and offers no certificate. A clear, useful and engaging post promises a certificate. Mark Factual Correctness **FAIL**. The other four dimensions may PASS, but the overall result is **FAIL**. Four passes cannot cancel one failure.

If the source facts or request are missing, leave the affected dimension unfinished and explain what is needed. A post with unfinished reviews shows **PENDING**, unless another dimension already fails. Complete all five reviews before moving on.

## Part 2: Group the failures

Give each failed post one main failure category: Incorrect or Hallucinated Content, Low Informational Value, Instruction Non-Compliance, or Poor Framing. Use **Failure Analysis** to see the counts and note a proposed fix.

For a few failures, inspect the n8n execution. Did the relevant facts and instructions actually reach the model? Record the evidence, likely cause and proposed fix in **Failure Traces**. Choose one recurring or high-impact problem.

## Part 3: Improve the generation prompt

Save the original prompt. Change one instruction in **Prepare Generation** to address the problem you observed. For example, clarify which facts may be used, require a missing practical example, or demonstrate the desired tone with a short example. Keep the five evaluation rules fixed.

Record what you changed and why you expect it to help. Improve the workflow rather than editing the generated posts by hand.

## Part 4: Rerun and compare

1. Run the revised generator on the requests whose posts failed, plus at least one whose post passed. Keep the original requests and facts unchanged.
2. Save the new outputs in **Revised Posts** and review all five dimensions again. Keep the original posts and reviews in Evaluation Log.
3. Open **Comparison**. It matches the request IDs and shows whether each result was fixed, got worse, still passes or still fails. You do not need to fill comparison labels manually.

Report the original and revised PASS counts for the same requests you reran. Note which dimension improved and whether any previously passing dimension now fails. If the first ten posts all pass or all fail, add a clearly labeled extra request to obtain the missing comparison type and report the extra case separately.

## Part 5: Try automated judges (optional)

Complete your human reviews first. Then upload those same ten saved posts to [Social Media Jev Judge Only.json](Social%20Media%20Jev%20Judge%20Only.json). This workflow evaluates existing posts; it does not generate new ones.

Both judges receive the request, approved facts, post and the same five definitions. **Neither sees your human labels or the other judge's answers.**

- **Jev** receives five Choice questions, one per dimension, with PASS and FAIL as the options. It returns a choice, probabilities and confidence for each. There is no conversion to a numerical score.
- **The independent LLM judge** returns PASS or FAIL and a short evidence-based reason for each dimension. Its explanation is its own review, not an explanation of Jev's reasoning.
- **The workflow** calculates each judge's overall result using the same rule: five PASS decisions are required; any FAIL makes the post FAIL. Tied Jev decisions and failed calls are flagged for review, never counted as passes.

Connect a **TypeSafe API key** to **Call Jev** and an **OpenRouter API key** to **Independent LLM Review**. The supplied workflow already uses the correct TypeSafe URL and model. Save the downloaded results in **Judge**. Each post has five dimension rows and one overall row, so disagreements are easy to inspect.

Jev is being tested as a fast structured judge. Human labels remain the reference for this exercise; subjective criteria such as value and tone still need inspection.

## Part 6: Improve the judge (optional)

Inspect disagreements dimension by dimension. Check your own review too. If a rule is unclear, clarify that rule in the judge instructions, keep the saved posts unchanged and rerun. The [integration guide](docs/jev-integration.md) shows where the prompts live.

Compare missed failures and rejected good posts before and after the change. Count missing decisions and failed runs separately. Report this as improvement on these practice posts, not proof of performance on unseen posts.

## What to submit

- The ten generated posts, their requests and approved facts, all five human decisions per post, overall results and brief reasons for failures.
- Failure categories, a few supporting execution traces and the exact generation-prompt change.
- Original and revised outputs, fresh dimension reviews, comparison results and both saved prompts/runs.
- If you try the judges: both sets of results, disagreements with human reviews and any instruction change you tested.

## For maintainers

`src/rubric.js` holds the shared five-dimension policy. `src/generation.js` holds the generator system prompt. `src/judge.js` builds Jev's questions and the independent LLM prompt. Run `npm ci`, `npm run build:workflows`, then `npm test` after changes. See [validation](docs/validation.md).
