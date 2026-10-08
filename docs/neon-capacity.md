# Neon capacity and cost runbook

Applies to the `sourceclip-support` project (Neon org **Three Things Media**,
`org-morning-block-64229848`, Launch plan). Source: 2026-10-08 capacity review.

## Current settings

- Endpoint `ep-proud-wind-b14a1uit` (`read_write`), branch `main`, region `aws-eu-central-1`.
- Autoscaling: **min 0.25 CU → max 2 CU**.
- Scale-to-zero: **5-minute idle suspend** (idle compute = $0; first request cold-starts).
- One project, one branch; storage ~32 MB; monthly egress ~5 MB.
- Org spending notification: **$20/month** (email at 80% and 100%).
- DB access is via Cloudflare **Hyperdrive** (`POSTGRES` binding); the app is a
  request/event-driven Worker, plus a `0 3 * * *` cron and an inbox queue consumer.

## Baseline (2026-10-08)

Light probe from one client, concurrency 20, 20 s, against `/` and `/roadmap`:

| Metric | Value |
| --- | --- |
| Throughput | 95.1 req/s, 0 errors |
| p50 / p90 / p95 / p99 | 144 / 312 / 393 / 1619 ms |
| Cold start after idle | ~2.8 s |
| Response size | ~32 KiB/req |

A single 0.25–2 CU primary serves this scale comfortably.

## Growth ladder

Change **one rung at a time**, then re-measure. Never jump a rung.

| Rung | `max_cu` | Move up when |
| --- | --- | --- |
| 1 (current) | 2 | initial headroom |
| 2 | 4 | sustained primary CPU > ~70%, or p95 > ~800 ms under **real** load |
| 3 | 8 → 16 | saturation persists after query/index work |

Raising `max_cu` does not raise cost by itself — spend tracks actual CU-hours;
scale-to-zero keeps idle at $0.

## Triggers to revisit

- Console compute CPU sustained above ~70%, or p95 climbing under real traffic
  (Launch monitoring retention is only 3 days; consider Scale for 14-day retention
  and metrics export before long-range planning).
- Egress approaching the 500 GB/month allowance (then $0.10/GB).
- pgvector similarity search, or a manual `scripts/backfill-search.ts` run,
  competing with OLTP — run it off-peak, not during peak demand.

## Read replicas

Only for **read-bound** load. They add compute cost and do not help writes. When
justified: `neon branches add-compute <branch> --type read_only`, then a second
Hyperdrive config and an app read/write split. Not warranted at current or 10k-user
support scale.

## Scale-to-zero tradeoff

Idle compute is free, but the first request after an idle period cold-starts
(~2.8 s observed). Acceptable pre-launch; if latency on first visit becomes a
problem, disable scale-to-zero during peak hours instead of leaving it off 24/7.
