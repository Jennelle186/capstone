"""FURPS metrics & statistical analysis layer (testing plan, Sections 4 & 8).

Pure, offline, unit-tested modules that consume result artifacts produced by
test campaigns (``eval_report.json``, ``llm_calls.log``, extraction results,
jobs exports, perf samples) and emit thesis-ready summary tables.

Design rules:
  * No external/LLM/DB side effects anywhere in these modules (safe to unit-test).
  * Every numeric function is empty-safe — it returns ``None`` on no data so
    the reporter renders an explicit "no data" cell instead of NaN.
  * Ground-truth-dependent metrics degrade to "no ground truth" when the
    labels file has not been filled for a given field/document.
"""