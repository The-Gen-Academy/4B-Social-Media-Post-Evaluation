# How the judges work

Jev and GPT-4.1-mini independently review the same post against five dimensions: Factual Correctness, Clarity, Value / Insight, Engagement and Tone Fit. Each dimension is PASS or FAIL. Code calculates Overall: any FAIL wins; otherwise all five must PASS. No average, numerical grade or confidence threshold changes this rule.

## Inputs and facts

`src/workshop.js` reads the request and saved post from the CSV. It uses `Reference_Facts` if supplied; otherwise it copies the text after an `Approved facts:` heading in the request. This is text parsing, not an LLM extraction step. Keep that heading last in the request. The provided ten requests already follow this format.

The parser cannot discover or verify facts. A person supplies them. Missing facts block generation/judging with NEEDS_CONTEXT. For a task requiring no external facts, explicitly state that in the approved-facts section. The twelve historical examples do not have this context and are retained as reference material.

## Prompts

- `src/rubric.js`: five PASS/FAIL definitions and shared evaluator policy.
- `src/generation.js`: role, task, factual boundaries, quality checks and plain-text output contract for the generator.
- `src/judge.js`: Jev Choice requests and the independent LLM's structured review prompt.

The prompts separate instructions from JSON input data, define observable acceptance criteria, specify output formats and forbid inventing supporting facts. This structure follows the guidance to use clear tasks, roles, constraints and structured context in [Anthropic's prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).

For a generator experiment, edit only `GENERATOR_PROMPT`. For a judge-instruction experiment, edit `POLICY` or clarify a dimension definition, then increment `JUDGE_VERSION`. If the acceptance rules actually change, update the human reviews and `RUBRIC_VERSION` too. Run `npm run build:workflows` and reimport the JSON into n8n. Reattach provider credentials after import.

## Responses

Jev receives one Choice question per dimension with two named options. Its selected choice is used directly. An exact probability tie leaves that dimension undecided. The LLM returns a validated object with a decision and short reason for every dimension. Neither request contains the current human labels, human feedback or the other judge's result.

An invalid or missing dimension response is an API/run error, not a quality failure. A valid FAIL on any dimension makes the overall result FAIL, even if another dimension is tied. If there is no FAIL and a dimension remains undecided, the overall result stays blank for review.

The exported Judge CSV includes one row per dimension and one Overall row. Probabilities and raw responses remain in execution data or CLI detail logs for diagnostics. They do not determine a separate numerical grade.

## Local CLI

```sh
npm ci
npm run build:workflows
npm test
npm run judge -- --provider typesafe --input reviewed-posts.csv --output results/baseline.csv --workshop
```

Set `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY` in an ignored `.env`. A dry run validates inputs and exports requests without API calls:

```sh
npm run judge -- --provider typesafe --input reviewed-posts.csv --output results/preview --dry-run
```

Use a new output filename for each run. The CLI refuses to overwrite prior results. OpenRouter and Gateway remain available as explicit alternate Jev providers for existing users; the workshop n8n files use TypeSafe directly.
