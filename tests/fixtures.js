import { METRICS, QUESTIONS, CATEGORY_LABELS } from '../src/judge.js';

// Fabricated API responses for contract tests, never represented as live Jev judgments.
export function responseFor(grades = [4, 4, 4, 4, 4], category = 'none', confidence = 0.9) {
  const answers = {};
  for (const [index, metric] of METRICS.entries()) {
    answers[metric] = { type: 'score', score: grades[index] - 1, confidence,
      legend: Object.fromEntries(QUESTIONS[metric].criteria.map((description, level) => [level, description])),
      probabilities: Object.fromEntries([0, 1, 2, 3, 4].map(level => [level, level === grades[index] - 1 ? 1 : 0])),
    };
  }
  answers.Failure_Category = { type: 'choice', choice: category, confidence,
    probabilities: Object.fromEntries(Object.keys(CATEGORY_LABELS).map(key => [key, key === category ? 1 : 0])) };
  return { model: 'jev-1.13.0', answers, usage: { input_tokens: 1200, output_tokens: 100 } };
}
