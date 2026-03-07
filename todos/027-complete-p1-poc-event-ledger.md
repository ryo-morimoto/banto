---
status: complete
priority: p1
issue_id: "027"
tags: [poc, validation, sqlite, event-ledger]
dependencies: []
---

# PoC: Event Ledger

## Problem Statement

Assumptions E1-E5 in `.z/v2/validation/assumptions.md` need load-testing validation. SQLite WAL concurrent read/write behavior under banto's specific access pattern (high-frequency inserts + WS query reads) is theoretically sound but unmeasured.

## Findings

N/A — to be filled during PoC execution.

## Proposed Solutions

1. **Micro-benchmark**: INSERT events + SELECT latest in tight loop, measure throughput
2. **Realistic simulation**: Simulate 5 concurrent sessions, each emitting 10 events/sec, with dashboard query every 100ms
3. **Both**: Micro first for baseline, then simulation for real-world

**Recommended**: Option 3.

## Recommended Action

1. Create in-memory SQLite DB with full schema from `data-model.md`
2. Run PRAGMA settings (WAL, synchronous=NORMAL, busy_timeout=5000)
3. Micro-benchmark:
   - INSERT 10,000 events sequentially → measure throughput (events/sec)
   - INSERT + concurrent SELECT (dashboard query) → measure latency
4. Realistic simulation:
   - 5 "sessions" each inserting events at 10/sec (50 events/sec total)
   - 1 "dashboard" reader querying tasks + latest sessions every 100ms
   - Run for 60 seconds
   - Measure: p50/p95/p99 insert latency, read latency, any SQLITE_BUSY errors
5. Materialization test:
   - INSERT event → UPDATE sessions (materialization) in same transaction
   - Measure overhead vs INSERT-only
6. Document results and thresholds

Output: `.z/v2/validation/poc-event-ledger.md`

## Acceptance Criteria

- [ ] Sequential INSERT throughput measured (target: >1000 events/sec)
- [ ] Concurrent INSERT + SELECT latency measured
- [ ] Realistic simulation (5 sessions, 50 events/sec) run for 60s
- [ ] p50/p95/p99 latencies documented
- [ ] Zero SQLITE_BUSY errors during simulation
- [ ] Materialization overhead measured
- [ ] Assumptions E1-E5 each marked verified/falsified
- [ ] Results written to `.z/v2/validation/poc-event-ledger.md`

## Work Log

### 2026-03-08 - Created

**By:** Claude Code

**Actions:**
- Created todo from assumptions.md E1-E5
