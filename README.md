# Social Media Post Evaluation

Study the worked examples, then run the n8n workflow to generate 10 posts from your own inputs. Add the outputs to Evaluation Log, review all five dimensions, group the failures in Failure Analysis, and save every failed post in Failure Traces.

**All five dimensions must PASS for the post to PASS. If any dimension FAILS, the whole post FAILS.** There are no numerical scores or averages.

## Start here

* Make a copy of the [workbook](https://docs.google.com/spreadsheets/d/1y8-rCXo2-tBDPf2kIZxWRDzSK2z9gwZWpdYbZqiJoqI/edit).
* Download the [generation workflow](Social%20Media%20Post%20Generation%20Workflow.json). You will supply ten inputs of your own.
* Follow the [n8n setup guide](docs/walkthrough.md). Generation uses an OpenRouter API key. The optional failure-category judge uses an OpenAI API key.

The workbook has three tabs: Evaluation Log, Failure Analysis and Failure Traces. Start with the 12 worked reviews already in Evaluation Log. See how the feedback supports the PASS/FAIL decisions and the main failure category; the failed examples are also in Failure Traces. Keep these examples as a reference. They do not count toward your ten new posts.

## Part 1: Invent 10 inputs, generate and evaluate

1. Set up n8n. Import the generation workflow and connect your OpenRouter credential to Generate Post. Keep API keys in n8n credentials, not in the workbook or prompt.
2. Generate 10 posts. Invent ten different LinkedIn post requests and give each a unique post ID. Include the audience, purpose and any requirements. Put an Approved facts: section at the end of each request, using verified facts or fictional facts you define. Upload a CSV containing only these ten new requests, with the post text empty. Select Execute workflow, open the upload form and run the workflow until all ten posts are generated.
3. Add the outputs to Evaluation Log. Download linkedin_posts_output.csv and add its post IDs, original requests and generated posts beneath the worked examples. Keep the existing headers, review fields and overall-result formulas. Save the generation prompt and n8n execution so you can inspect what happened.
4. Evaluate all 10 posts. Read the request, supplied facts and generated output. Mark PASS or FAIL for Factual Correctness, Clarity, Value, Engagement and Tone. Review every dimension, even after finding a failure. Write brief human feedback that points to the main problem and explains every failed dimension. All five must PASS for the overall post to PASS; any FAIL makes it FAIL.

### Five PASS/FAIL dimensions

| Dimension | PASS when | FAIL when |
| ----- | ----- | ----- |
| Factual Correctness | Every checkable claim is supported, calculations are correct, and limits or planned features stay explicit. | A claim is unsupported, a number is wrong, a planned feature sounds available, or a small test becomes a general guarantee. |
| Clarity | The intended reader understands the point after one reading. Essential terms and references are clear. | Unexplained jargon, ambiguous references or a disordered explanation prevents understanding. Minor wording preferences do not fail. |
| Value / Insight | Every explicit requirement is met. Advice names an action; examples show a situation and what to do or observe. | It misses a requirement, advertises rather than delivers the requested content, or substitutes slogans for practical examples. |
| Engagement | The opening gives a specific reason to read. The ending provides a feasible action or specific question. | The opening is generic hype, the ending is absent or only says 'Thoughts?', or it includes a prohibited call to action. |
| Tone Fit | The wording respects the reader and matches the audience, voice and situation. An apology acknowledges inconvenience. | A phrase insults or pressures the reader, minimizes a problem, or conflicts with the requested voice. |

Use the definitions above for your new reviews. Value and Tone in the workbook mean Value / Insight and Tone Fit in these definitions. If a request prohibits a call to action or question, the ending should be a declarative takeaway; 'Review both' is still a call to action. A missed word limit, format or required link fails Value / Insight. Count words across the entire post, including headings, bullets and links.

**Worked example:** The approved facts say a workshop is free, online, 60 minutes long and offers no certificate. A clear, useful and engaging post promises a certificate. Mark Factual Correctness **FAIL**. The other four dimensions may PASS, but the overall result is **FAIL**. Four passes cannot cancel one failure.

If evidence needed to judge a claim is missing, leave that dimension unfinished and explain what is needed. An explicitly unknown date or link may remain unknown; do not demand invented details. Clearly hypothetical teaching examples are allowed when consistent with the supplied facts. A post with unfinished reviews shows **PENDING**, unless another dimension already fails. Complete all five reviews before moving on.

## Part 2: Analyse failures and save failed traces

Update Failure Analysis using the patterns in your feedback. Start with the five supplied categories: Unsupported Claims, Missing Practical Detail, Wrong Content Type, Missing or Inappropriate CTA, and Missing Context. Read their definitions and suggested fixes in that tab. Choose one main category for each failed post in Evaluation Log. If none fits, add your own clearly named category to the dropdown and Failure Analysis, with a short definition and a proposed fix. Make sure its count includes the matching failed posts. Existing counts include the worked examples, so report the failures from your ten new posts separately.

Add every failed post to Failure Traces. Keep its post ID, original request, generated output, all five dimension decisions, overall FAIL and human feedback together. Assign one failure category to each failed trace, matching its category in Evaluation Log. The main category should be inferable from the feedback; keep any secondary problems in the explanation. For a few failures, also inspect the saved n8n execution to check what instructions and facts reached the model. Use this evidence to identify a likely cause and a specific fix.

## Part 3: Improve the generation prompt

Save the original prompt. Change one instruction in **Prepare Generation** to address the problem you observed. For example, clarify which facts may be used, require a missing practical example, or demonstrate the desired tone with a short example. Keep the same rubric version fixed for both runs. If you change a definition, review both sets again under the new rule before comparing them.

Record what you changed and why you expect it to help. Improve the workflow rather than editing the generated posts by hand.

## Part 4: Rerun and compare

1. Run the revised generator on the requests whose posts failed, plus at least one whose post passed. Keep the original requests and facts unchanged.
2. Add the revised outputs as new, clearly labelled rows in Evaluation Log and review all five dimensions again. Give each revision a new post ID and note which original post it revises in the feedback. Keep the original outputs and reviews intact.
3. Compare each revised post with its original review: FAIL to PASS is fixed; PASS to FAIL is a regression; otherwise it still passes or still fails. Add any revised failures to Failure Traces and update Failure Analysis. Use these same three tabs; no separate comparison tab is required.

Report the original and revised PASS counts for the same requests, noting improvements and regressions by dimension. Keep every output. If all ten pass, use a supplied worked failure to practise diagnosis. Do not claim a fix unless a saved failed post actually improves.

## Part 5: Calibrate an LLM judge for one failure category (optional)

Choose the **one failure category you care about most**. Complete your human reviews and assign one main category to every failed trace first. This exercise tests whether the judge identifies the same **main problem** you identified. It does not replace the five human PASS/FAIL decisions.

1. Import [Social Media LLM Category Judge.json](Social%20Media%20LLM%20Category%20Judge.json) into n8n. Attach an **OpenAI API credential** to **Ask OpenAI**. The model is `gpt-5.4-mini`, called directly through OpenAI.
2. Open **Choose Failure Category**. Edit the three fields at the top: the exact category name, a short definition, and a contrast rule explaining how it differs from similar problems. The five existing definitions are supplied in the node.
3. Export **Failure Traces** as CSV and upload it through the workflow. Include traces whose main category is your chosen category and traces assigned to other categories. Keep the saved posts and human labels fixed.
4. Download `category_judge_results.csv`. Open **Calibration Summary** to see agreement, missed matches, false alarms and unresolved cases. No extra workbook tab is needed.

**What the judge sees:** the selected definition, contrast rule, request, saved post and any supplied approved facts. It never sees the human category, feedback or dimension decisions. Facts come from `Reference_Facts` or the text after `Approved facts:` in the request; this is a text parser, not independent fact checking.

**What TRUE and FALSE mean:** TRUE means the selected category is the post's main problem. FALSE means it is not the main problem, even if a secondary issue of that kind is present. Every input is already a failed post, so FALSE does not mean the post passes. Missing evidence and failed calls remain unresolved.

The workflow creates the comparison label automatically: **TRUE** when the saved human `Failure_Category` exactly matches the selected category, **FALSE** otherwise. It compares this label with the judge only after the model call. This evaluates agreement with the human main-category assignment, not every failure that may be present.

## Part 6: Inspect disagreements and improve the definition

Read the post and the judge's reason for each mismatch. A **false alarm** is judge TRUE with human FALSE. A **miss** is judge FALSE with human TRUE. Check whether the issue is an unclear definition, a missing distinction, missing evidence or an incorrect human label. Do not change a label just to agree with the model.

Clarify the definition or contrast rule, save the previous results, and rerun the same saved traces. Compare agreement and unresolved counts. Report accuracy as matches / completed calls, alongside the total traces and errors. Include both TRUE and FALSE human cases; a one-class set cannot test both kinds of mistake. Improvement on these examples is prompt calibration, not proof that the judge will work on new posts.

### Older Jev experiment

[Social Media Jev Judge Only.json](Social%20Media%20Jev%20Judge%20Only.json) and the combined generation workflow remain available as an advanced, separate five-dimension experiment. They use TypeSafe for Jev and OpenRouter for the independent LLM. They are not required for the one-category OpenAI exercise. See [the older integration guide](docs/jev-integration.md).

## What to submit

* Your ten original requests and supplied facts, generated posts, all five human PASS/FAIL decisions, overall results and feedback in Evaluation Log. Preserve the twelve worked examples.
* Updated Failure Analysis with categories, counts and proposed fixes. Define any new category. Include every failed post in Failure Traces with its feedback and assigned main category.
* The generation-prompt change, saved n8n runs, revised outputs and fresh reviews, plus a before/after comparison of the same requests.
* If you try the optional judge: your selected category and definition, saved results, disagreements and the instruction change you tested. Report agreement as matches out of resolved traces, alongside unresolved traces and errors.

## For maintainers

`src/rubric.js` holds the five-dimension policy. `src/generation.js` holds the generator prompt. `src/category-judge.js` holds the one-category OpenAI prompt and comparison. `src/judge.js` supports the older Jev experiment. Run `npm ci`, `npm run build:workflows` and `npm test` after edits. See [validation](docs/validation.md) and the [category judge guide](docs/category-judge.md).
