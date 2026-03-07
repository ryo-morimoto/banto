# PoC: Event Ledger

Validates assumptions E1-E5 from `assumptions.md` by benchmarking SQLite WAL mode under banto's expected access pattern.

## Hypothesis

- E1: SQLite WAL mode handles concurrent reads + writes without contention
- E2: Event append + materialization sustains 100+ events/session/minute (1.67 events/sec)
- E3: busy_timeout=5000 prevents SQLITE_BUSY under single-user multi-session load
- E4: Append-only invariant is maintained by convention (design verification)
- E5: JSON.stringify(payload) always produces valid round-trippable JSON

Performance target: banto runs 5 concurrent sessions, each producing ~10 events/sec (50 events/sec total). Dashboard polls every 100ms. This is orders of magnitude below what SQLite should handle, but we verify it.

## Environment

| Item | Value |
|------|-------|
| Bun | 1.3.10 |
| SQLite | 3.51.2 |
| OS | Linux 6.18.12 x86_64 |
| CPU | 16 cores |
| RAM | ~60 GB |
| DB mode | File-based (/tmp), WAL, synchronous=NORMAL |

## Results

### Benchmark 1: Sequential INSERT

10,000 events inserted into `session_events` in a single transaction.

| Metric | Value |
|--------|-------|
| Total events | 10,000 |
| Total time | 56.23ms |
| Throughput | 177,840 events/sec |

banto's peak requirement is ~50 events/sec. Headroom: **~3,500x**.

### Benchmark 2: INSERT + Materialization

10,000 iterations of: INSERT event + UPDATE sessions (status, context_percent) in same transaction.

| Metric | Value |
|--------|-------|
| Total events | 10,000 |
| Total time | 84.56ms |
| Throughput | 118,257 events/sec |
| Overhead vs INSERT-only | 28.33ms (+50.38%) |

The materialization UPDATE adds ~50% overhead per transaction, but throughput remains ~118k events/sec. Still **~2,300x** above the 50 events/sec requirement.

### Benchmark 3: Concurrent Read/Write (30s)

- Writer: INSERT events at 50/sec (10/sec per session, 5 sessions) for 30 seconds
- Reader: Dashboard query (tasks JOIN sessions LEFT JOIN latest event) every 100ms

| Metric | Writer | Reader |
|--------|--------|--------|
| p50 | 0.065ms | 0.042ms |
| p95 | 0.122ms | 0.074ms |
| p99 | 1.063ms | 0.098ms |
| Total ops | 1,501 | 301 |
| SQLITE_BUSY | 0 | 0 |

Zero contention. Writer p99 spike to ~1ms is normal OS scheduling jitter. Reader latency is sub-0.1ms even at p99.

### Benchmark 4: Notification Overhead

5,000 events with conditional notification INSERT (every 50th event triggers a `context_warning` notification, producing 100 notifications total).

| Metric | Value |
|--------|-------|
| Event-only (5k) | 31.43ms |
| Event + notification (5k + 100 notifs) | 41.32ms |
| Overhead | 9.89ms (+31.47%) |

Notification INSERTs add ~31% overhead when triggered every 50 events. In practice, notifications are rare (session completion, permission requests), so real-world overhead is negligible.

### Benchmark 5: JSON Round-Trip (E5)

Tested 10 payload patterns: simple objects, nested objects, arrays, Unicode, special characters, empty objects, nulls, numeric edge cases, booleans, and 10KB strings.

| Metric | Value |
|--------|-------|
| Tests | 10 |
| Failures | 0 |

All payloads survived `JSON.stringify -> SQLite TEXT -> JSON.parse -> JSON.stringify` without data loss.

## Assumption Validation

| ID | Assumption | Result | Notes |
|----|-----------|--------|-------|
| E1 | WAL handles concurrent R/W | **verified** | 0 SQLITE_BUSY errors over 30s with 50 writes/sec + 10 reads/sec. Reader p99 < 0.1ms |
| E2 | 100+ events/min is fast enough | **verified** | 118,257 events/sec with materialization. banto needs ~50/sec max. Headroom: 2,300x |
| E3 | busy_timeout=5000 prevents BUSY | **verified** | 0 BUSY errors. busy_timeout was never triggered because WAL eliminates writer-reader contention entirely |
| E4 | Append-only convention works | **verified (by design)** | No DELETE/UPDATE on session_events in any code path. Convention enforced at application layer |
| E5 | JSON round-trip is safe | **verified** | 10/10 payload patterns round-tripped correctly including Unicode, special chars, and 10KB strings |

## Conclusions

SQLite with WAL mode is more than sufficient for banto's event ledger workload. Key findings:

1. **Throughput is not a concern.** Even with materialization overhead, SQLite handles 118k+ events/sec. banto's peak load of ~50 events/sec is 2,300x below capacity.
2. **WAL eliminates read/write contention.** Zero SQLITE_BUSY errors across all benchmarks. The dashboard query and event writes can run concurrently without interference.
3. **busy_timeout is a safety net, not a necessity.** Under single-user load, WAL mode alone prevents contention. busy_timeout=5000 provides defense against edge cases (e.g., checkpoint stalls) but was never triggered.
4. **JSON storage in TEXT columns is reliable.** All tested payload patterns round-trip correctly through SQLite.
5. **Notification overhead is negligible in practice.** Even at 1-per-50-events frequency, the overhead is ~31%. Real usage will trigger notifications far less often.

No concerns identified. Proceed with SQLite as the event ledger storage engine.

## Benchmark Code

Source: `poc/event-ledger/bench.ts`

Run: `bun run poc/event-ledger/bench.ts`
