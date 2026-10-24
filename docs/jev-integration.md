# Binary Jev integration

## Model responsibilities

`src/judge.js` defines one publication policy and one Jev `choice` question:
`Publication_Decision`, with `PASS` and `FAIL` criteria. The result is accepted
only when the response envelope, labels, confidence and two probabilities are
valid and the selected label has the greatest probability. A tie is `AMBIGUOUS`
with a blank decision. Probability and confidence are diagnostics, not grades or
measured correctness. There is no numeric publication threshold.

Jev supports [typed decisions](https://docs.typesafe.ai/api/system-one), including
the [Choice primitive](https://docs.typesafe.ai/primitives/choice). It does not
write prose. The independent review uses OpenRouter chat completions and a strict
[structured-output schema](https://openrouter.ai/docs/guides/features/structured-outputs):

```json
{"critique":"Evidence and decisive publication requirement.","decision":"PASS"}
```

`decision` must be PASS or FAIL. A refused, truncated, malformed or empty review
is an error. The reviewer sees the same policy, approved context and TRAIN
examples as Jev, but no Jev prediction or current human feedback. Its critique
must be attributed to the independent LLM. Disagreement flags human review and
never changes Jev's recorded prediction. `Review_Required=false` means the two
model decisions agreed with valid responses; it does **not** authorize publishing
or certify accuracy. All course decisions still require human validation.

## Input and output

The [35-column contract](../src/workshop.js) is shared by CLI, n8n and workbook.
The required evaluation packet is `Test_ID`, `Run_ID`, `User_Input`, nonempty
`Model_Output`, `Reference_Facts` and `Context_Status=READY`. If no external facts
are needed, explicitly record that conclusion in Reference_Facts. Include actual
approved source text; the models do not retrieve URLs. Add constraints, persona,
scenario and source/trace provenance as applicable.

Only brief, candidate, facts, constraints, persona and selected TRAIN examples
enter model requests. Current human labels, critiques, previous judgments,
failure tags and historical review notes are excluded. Supply source evidence
independently; a generated post cannot be evidence for its own concrete claims.

`Human_Decision`, `Human_Critique`, `Human_Reviewer` and
`Human_Policy_Version=social-publication-v2` form the human reference record.
Review the exact input/output packet, not an earlier version of the post.
The generator clears those fields whenever it creates a new post and moves the
previous critique into historical notes. Existing posts are preserved as-is.

Execution statuses remain separate from decisions:

| Status | Meaning |
| --- | --- |
| OK | Valid response with one PASS/FAIL decision. |
| ERROR | Identity, generation, API or response-validation failure. |
| NEEDS_CONTEXT | Evaluation packet is incomplete. |
| SKIPPED | No candidate post. |
| AMBIGUOUS | Jev returned tied probabilities; human review required. |
| NOT_RUN | No judge/reviewer call has been made. |

Duplicate `Test_ID + Run_ID` pairs are blocked. Do not mix several judge versions
of the same exact posts in one CSV or workbook; save separate snapshots. Workbook
helper columns flag duplicate identities and exclude them from valid comparisons.

## Providers and credentials

The n8n imports default to OpenRouter. Attach the same Header Auth credential to
**Call Jev**, **Independent LLM Review**, and **Generate Post** when present.
Use `Authorization: Bearer <OpenRouter API key>`. No API key or credential ID is
included in exported workflows.

| Jev provider | Endpoint | Default model | Environment key |
| --- | --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1/systemone` | `typesafe/jev-1.13` | OPENROUTER_API_KEY |
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-1.13.0` | TYPESAFE_API_KEY |
| Vercel AI Gateway | `https://ai-gateway.vercel.sh/typesafe/v1/systemone` | `typesafe-ai/jev-1.13.0` | AI_GATEWAY_API_KEY |

CLI flags `--provider` and `--model` override environment settings. The independent
review always uses OpenRouter and also requires OPENROUTER_API_KEY. Set
`REVIEW_MODEL` or `--review-model` for a compatible structured-output model. In n8n,
changing Jev provider requires changing the endpoint, credential and model together;
the independent review retains its own OpenRouter credential and endpoint.

The Jev CLI retries transient failures up to three times, with bounded backoff;
it does not retry authentication failures or disclose response bodies. The review
CLI makes one attempt. n8n HTTP nodes have a 60-second timeout and up to three
attempts, five seconds apart. Credential-configuration failures can stop a whole
n8n execution; fix the credential before rerunning. Each run exports results and
never publishes posts. The CLI refuses to overwrite output files, persists each
completed row, and exits nonzero on evaluation errors.

## Calibration without leakage

1. Freeze exact human-labeled baseline posts and their sources.
2. Assign related cases together to 6 TRAIN, 12 DEV and 12 TEST examples. Include
   both labels where possible; report actual class counts and any additional cases.
3. Add only complete human-reviewed TRAIN records to `TRAIN_EXAMPLES` in
   `src/judge.js`. Use the CSV field names, including Judge_Split=TRAIN, reviewer,
   policy, brief, facts, post, decision and critique. The defaults are intentionally
   empty, so the initial judge is a zero-shot baseline until students add examples.
4. Iterate on DEV disagreements, checking the human label as well as the judge.
   Increment JUDGE_VERSION for each behavioral change. Do not change posts while
   measuring a judge improvement. Never put DEV examples into the prompt.
5. Freeze policy, prompt, examples, model and settings before TEST. Save raw
   responses and the actual model identifiers. New tuning after looking at TEST
   needs a new untouched test set.

Use one judge version and split at a time in Summary. Report human FAIL→judge
PASS and human PASS→judge FAIL counts with their class denominators, as well as
coverage. Missing context, ties and API failures cannot be counted as correct
answers. A missing class makes its rate undefined. Three demo examples and twelve
test examples are not a reliability study.

## Reproducibility

All three n8n workflows are generated from the shared source files by
`scripts/build-workflows.js`. Changes to the generator, policy, TRAIN examples
or CSV contract require rebuilding and reimporting the workflow.
Automated tests use fabricated responses, clearly separated from any live run.
The workbook keeps historical posts and instructor feedback but no purported
current judge results. See the current walkthrough for the runnable demonstration.
