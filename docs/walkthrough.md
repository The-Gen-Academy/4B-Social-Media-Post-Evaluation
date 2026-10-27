# Run the 10-post exercise in n8n

## Generate

Start with **Existing Examples** in the workbook. These 12 worked reviews show how the supplied feedback maps to dimension decisions and a main failure category. **Rubric** gives you the five evaluation rules and four failure-category definitions. Blank factual checks in older examples mean the saved evidence is insufficient; a known failure still makes the overall result FAIL.

1. Download `Social Media Post Generation Workflow.json` and import it into n8n.
2. Create a Header Auth credential with name `Authorization` and value `Bearer <OpenRouter API key>`. Attach it to **Generate Post**. Keep credentials in n8n, not in the prompt or CSV.
3. Invent ten inputs in **Evaluation Log**, keeping IDs P01 through P10. Give each request an audience, purpose, requirements and an `Approved facts:` section. Use verified facts or fictional facts you define yourself. Leave the post and review fields empty, and export this tab as CSV. Select **Execute workflow**, open the test form in **Upload Posts CSV**, and upload your CSV. Wait for all ten requests to finish.
4. Download `linkedin_posts_output.csv` from **Download Results CSV**. Copy its three data columns into **Evaluation Log A:C**, starting in row 2. Keep the template headers and the review/formula cells to the right. This is one paste for the whole run.
5. Review every dimension using its PASS/FAIL dropdown. Explain failures and choose one main category from the supplied list. **Status** is calculated: any FAIL gives FAIL; all five PASS gives PASS; an unfinished review shows PENDING.

The older example CSV in the repository is reference material; your assignment is to invent ten inputs of your own. Generation requires an `Approved facts:` section and a blank `Model_Output`. Existing posts are preserved, not regenerated. An incomplete generation stops the download with an actionable error; inspect the named request and rerun after fixing it.

## Revise

Save the baseline workflow. In **Prepare Generation**, find `GENERATOR_PROMPT` and change one instruction. Keep the original inputs and the evaluation rubric fixed.

For the rerun, use the same requests with empty posts. Run the failed cases and at least one previously passing case. Paste only the three generated fields into **Revised Posts A:C**, starting in row 2. Review the five dimensions afresh. **Comparison** matches the IDs automatically, even if the revised rows are in a different order. The template covers P01 through P10; record any additional case separately.

## Optional judges

1. Import `Social Media Jev Judge Only.json`.
2. Attach a separate Header Auth credential to **Call Jev**: name `Authorization`, value `Bearer <TypeSafe API key>`. Its preconfigured URL is `https://api.typesafe.ai/v1/systemone`, and its model is `jev-1.13.0`.
3. Attach your OpenRouter Header Auth credential to **Independent LLM Review**. The LLM is GPT-4.1-mini.
4. Export Evaluation Log as CSV after completing your human reviews. Upload it through the workflow's test form.
5. Download `judge_results.csv` and import the whole file into **Judge**, replacing that tab's contents. It contains six rows per post: five dimensions and Overall. Preserve each judge run in a separately named results file before importing a later run.

Compare Human_Status with Jev_Status and LLM_Status for each dimension. Blank decisions, ties and API errors need attention and are not passing results. The LLM's reason belongs to the LLM's independent review.

`Social Media Post Generation with Jev Judge.json` combines generation and judging for an instructor demonstration. **Download Posts CSV** contains the three post fields; **Download Results CSV** contains the dimension reviews. Complete human review before opening automated results.
