# Judge one main failure category with OpenAI

Choose the failure category you care about most, then test whether an LLM identifies the same main problem as your human review. This optional exercise uses the existing **Failure Traces** tab. Your five human PASS/FAIL decisions remain the evaluation of the post.

## Run it

1. Import [Social Media LLM Category Judge.json](../Social%20Media%20LLM%20Category%20Judge.json) into n8n. Attach an **OpenAI API credential** to **Ask OpenAI**. The workflow calls `gpt-5.4-mini` directly through OpenAI.
2. In **Choose Failure Category**, edit the three fields at the top: `category`, `definition` and `contrast_rule`. Use the exact category name from your workbook. Give a short definition and explain the boundary with a similar problem. Five existing definitions are available in the node; you can use a category you added yourself.
3. Export **Failure Traces** as CSV. Include failed traces from your target category and other main categories. Each row must have a post ID, request, saved post, overall FAIL and human main category. Blank placeholders and passing posts are ignored. Missing labels, duplicate IDs and a target absent from the file stop the run with an error.
4. Select **Execute workflow**, open **Upload Failure Traces CSV**, upload the file and wait for completion. Download `category_judge_results.csv` and inspect **Calibration Summary**. Keep the file beside the workbook. No new workbook tab is required.

## What the judge decides

The question is: **Is the selected category the main failure in this trace?**

| Human main category | Selected category | Human ground truth |
| --- | --- | --- |
| Missing Practical Detail | Missing Practical Detail | TRUE |
| Unsupported Claims | Missing Practical Detail | FALSE |

The workflow derives this human label from an exact, trimmed category-name match. The model independently returns TRUE or FALSE with a short reason. FALSE does not mean the post passes. A secondary issue is not enough for TRUE: the judge is matching your choice of the main problem.

OpenAI receives the definition, contrast rule, original request, saved post and available facts. It does **not** receive the human category, feedback, dimension decisions or other model answers. Comparison happens afterward. Approved facts come from a supplied `Reference_Facts` field or the text after `Approved facts:` in the request. Keep that heading last. The workflow does not invent or independently verify these facts.

When essential evidence is missing, the model may return UNRESOLVED. Its prediction and match stay blank. Refusals, invalid responses and failed calls produce ERROR with a blank prediction. Neither is turned into FALSE.

## Calibrate it

Read each mismatch and its reason. A false positive is judge TRUE with human FALSE. A false negative is judge FALSE with human TRUE. Clarify a boundary in the definition or contrast rule, or add a short illustrative example and counterexample. Keep human labels fixed while comparing prompt versions. Do not change a human label merely to agree with the model.

Rerun the same saved traces and retain both results files. **Calibration Summary** reports the total, both human class counts, completed calls, matches, false positives, false negatives, unresolved cases and errors. Accuracy is matches divided by completed TRUE/FALSE decisions. Always report its numerator and denominator alongside unresolved and error counts. A one-class set cannot test both false alarms and misses.

Improving agreement on these examples is calibration. Check a few fresh traces afterward to see whether the change holds up. The model is not trained or fine-tuned by this workflow.
