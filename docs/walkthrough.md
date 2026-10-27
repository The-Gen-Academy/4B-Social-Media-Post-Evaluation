# Run the 10-post exercise in n8n

## Generate and review

The workbook has three tabs: **Evaluation Log**, **Failure Analysis** and **Failure Traces**. The twelve worked reviews are already in Evaluation Log; failed examples are also in Failure Traces. Keep them as reference examples. Your ten new posts are separate.

1. Import `Social Media Post Generation Workflow.json` into n8n. Create a Header Auth credential with name `Authorization` and value `Bearer <OpenRouter API key>`, and attach it to **Generate Post**. Keep keys in credentials.
2. Invent ten LinkedIn requests with unique post IDs. Include the audience, purpose, requirements and an `Approved facts:` section at the end. Use verified facts or fictional facts you supply. Prepare a CSV with only these ten requests and blank post text.
3. Select **Execute workflow**, open the test form in **Upload Posts CSV**, and upload the CSV. Download `linkedin_posts_output.csv` from **Download Results CSV** when all ten posts are ready.
4. Add the post IDs, original requests and outputs beneath the worked examples in **Evaluation Log**. Keep the review fields and overall formulas. Save the generation prompt and execution.
5. Review Factual Correctness, Clarity, Value, Engagement and Tone for every post. Mark each PASS or FAIL and explain failed dimensions in your own feedback. Any FAIL makes the post FAIL; all five must PASS for an overall PASS.
6. Update **Failure Analysis** and assign one main category to every failed post. Add a clearly defined category when the existing categories do not fit. Add every failed post, its review and matching main category to **Failure Traces**. Existing category counts include worked examples; report your ten new posts separately.

Generation requires approved facts and blank `Model_Output` cells. Existing posts are preserved. An incomplete generation stops the download with an error so you can fix the named request or credential and rerun it. A request may produce a good post; do not change the grading rules merely to create a failure.

## Revise

Save the baseline workflow. In **Prepare Generation**, find `GENERATOR_PROMPT` and change one instruction to address an observed problem. Keep the original requests, facts and evaluation rules fixed.

Run the failed requests and at least one previously passing request, with their post text cleared in the input CSV. Add revised outputs as new rows in **Evaluation Log**, using new IDs and noting which originals they revise. Review all five dimensions again. Compare original and revised decisions, add revised failures to **Failure Traces** and update **Failure Analysis**. Use the same three tabs; no comparison tab is needed. Preserve every original output and review.

## Optional: judge one main failure category with OpenAI

1. Download and import [Social Media LLM Category Judge.json](../Social%20Media%20LLM%20Category%20Judge.json).
2. Open **Ask OpenAI** and attach an **OpenAI API credential**. Use your OpenAI API key in the credential, not in a Code node or CSV. The endpoint and `gpt-5.4-mini` model are already configured.
3. Open **Choose Failure Category**. At the top, set `category`, `definition` and `contrast_rule`. Use the exact name from Failure Analysis, including spelling and capitalization. Start with a supplied definition or write your own for a new category.
4. Export **Failure Traces** as CSV. Each failed trace needs a saved request, post and human-assigned main category. Include the selected category and other categories, so the exercise has both TRUE and FALSE examples.
5. Select **Execute workflow**, open the test form in **Upload Failure Traces CSV**, and upload the file. The workflow evaluates saved posts; it does not generate anything.
6. Download `category_judge_results.csv` from **Download Category Results CSV**. Read **Calibration Summary** for exact-match accuracy, both class counts, false alarms, misses, unresolved cases and errors. Keep the results file for this run. No workbook tab needs to be added or replaced.

For local Docker setups, open the test form on the same host port as the n8n editor. If the editor is at `localhost:5679` but the form URL shows `localhost:5678`, change only the port to `5679`. Start Execute workflow before opening the form.

For example, choose **Missing Practical Detail**. A trace assigned that main category has human ground truth TRUE. A trace assigned **Unsupported Claims** has ground truth FALSE. The judge must independently decide whether Missing Practical Detail is the **main** issue. FALSE does not mean the post passes, and a secondary issue does not automatically make the answer TRUE.

OpenAI receives only the selected definition and contrast rule, request, saved post and available approved facts. Human feedback, main category and five dimension decisions stay out of the request. The comparison happens afterward. If evidence is insufficient, the prediction stays blank with Run_Status UNRESOLVED. Failed API calls stay blank with Run_Status ERROR. Neither counts as FALSE or as a correct decision.

Read every disagreement. Clarify the category definition or the boundary with another category, then rerun the same traces. Preserve the previous CSV so you can compare results. Accuracy is matches divided by completed TRUE/FALSE calls; always report the total, unresolved count and errors too. These are calibration examples, so improvement does not establish accuracy on new traces.

### Optional command-line version

Set `OPENAI_API_KEY` in the ignored local `.env`, then run:

```sh
npm ci
npm run judge:category -- --input failure-traces.csv --category "Missing Practical Detail" --output results/category-v1.csv
```

Use `--definition "Your rule"` and `--contrast "How to distinguish similar issues"` to change the prompt. Use `--dry-run` to inspect requests without API calls. Each output filename must be new. The CLI writes the results CSV and a `.summary.json` file.

### Older Jev experiment

`Social Media Jev Judge Only.json` and `Social Media Post Generation with Jev Judge.json` are separate advanced examples. They evaluate all five dimensions with TypeSafe Jev and an independent LLM through OpenRouter. They are not part of the one-category OpenAI exercise. Their provider setup is in [jev-integration.md](jev-integration.md).
