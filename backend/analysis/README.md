# analysis — metrics tooling

Modules I built for the FURPS testing plan (sections 4 and 8). They consume the
outputs of a test run (`eval_report.json`, `llm_calls.log`, extraction results,
job exports, probe records) and turn them into the summary tables for the
thesis report, plus a raw-numbers JSON.

## What each module does

- `stats.py` — `describe()` stats: count, mean, median, min/max, SD, and
  percentiles (p10..p99), using linear interpolation so the numbers line up
  with `llm_metrics.py`.
- `classifiers.py` — confusion matrix, per-class precision/recall/F1, micro/
  macro/weighted F1, and accuracy. `score_classification()` writes the exact
  block that goes into `eval_report.json`.
- `extraction.py` — field-level exact and normalised exact-match, ECE
  confidence calibration, and recall/precision for low-confidence routing.
- `perf.py` — `rate`, `availability`, sample summariser, JSON-lines/array
  readers, and a job-status summary.
- `llm.py` — aggregates `llm_call` telemetry lines into per-stage latency
  (p50/p95/p99), retries, failure rates, and token/cost totals, mirroring
  `llm_metrics.py`.
- `report.py` — CLI that merges whatever artifacts are available and writes
  the Markdown report + JSON.
- `run_classification_eval.py` — runs a classification evaluation against the
  live DB document types using `test/labels.json` as ground truth.

## How I run it

From the `backend/` folder (with the venv active):

```bash
python -m analysis.run_classification_eval 2> llm_calls.log
python -m analysis.report \
  --classification backend/eval_report.json \
  --llm backend/llm_calls.log \
  --labels test/labels.json \
  --extraction backend/test_output/extraction_results.json \
  --jobs backend/test_output/jobs.json \
  --probes backend/test_output/probes.json \
  --perf backend/test_output/locust.json \
  --out docs/test-results/metrics-report.md
```

The report CLI takes optional inputs; missing ones just get reported as `no
data` instead of failing.

## Notes

- Nothing in `analysis/` touches the DB, GCS, or the LLM, except
  `run_classification_eval.py`.
- Empty-safe: every numeric function returns `None` when there's no data, so
  the report shows `no data` rather than NaN or 0.
- Fields whose `expected_fields` value is still blank in `test/labels.json`
  are excluded from scoring and marked `ground_truth_available: false`. I
  don't fabricate numbers.
- The unit tests live in `backend/tests/test_analysis.py` (run with
  `python -m pytest tests/test_analysis.py -q`). I keep that file out of this
  repository.