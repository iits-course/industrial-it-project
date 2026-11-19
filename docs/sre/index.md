# Week 11 · SRE and disaster recovery: overview

This section completes the reliability part of the Architecture Dossier. It turns the quality evidence of week 10 into measurable service objectives, a telemetry design, resilience patterns on the container view, an explicit degradation model and a tested recovery plan.

The package is a design hypothesis. No production telemetry, load test or disaster-recovery exercise has been executed; the volumes, targets and thresholds are proposals that the pilot must replace with measurements.

## Artifacts

| Artifact | Content | Homework item |
|---|---|---|
| [SRE specification](11-sre-specification.md) | Five user-path SLIs and SLOs, proposed SLAs, error budgets and policy, burn-rate alerts, logs/metrics/traces with correlation ID, dashboard sketch, resilience patterns on C2, graceful degradation, verification programme | 1–5 |
| [DR plan](11-dr-plan.md) | RTO/RPO by component, HA versus DR, pilot-light strategy, disaster scenarios and playbooks, roles, validation gates, exercise programme | 6 |
| [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md) | Decision record for the pilot-light strategy with continuous replication and an immutable audit copy | 6 |
| [C2 v0.3 · resilience view](../diagrams/11-c2-resilience.svg) | Container view with timeouts, retries, circuit breakers, rate limits, bulkheads, DLQ and degradation annotations | 4 |
| [SRE dashboard sketch](../diagrams/11-sre-dashboard.svg) | Panel layout for SLO burn, RED, journey funnel, dependencies, outbox and business throughput | 3 |

## Reading order

1. [SRE specification §2–3](11-sre-specification.md) — which journeys matter, how the SLI is counted, why the target is 99.5% rather than 99.99%, and how the error budget changes the release posture.
2. [SRE specification §4–5](11-sre-specification.md) — how the numbers are produced: the correlation ID, the log schema, the metric catalogue, traces, retention and the dashboard.
3. [SRE specification §6–7](11-sre-specification.md) — what protects each external edge and what the user sees when a dependency fails.
4. [DR plan §3–6](11-dr-plan.md) — the recovery objectives, the selected strategy and the two most important playbooks.
5. [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md) — why the pilot light was chosen over backup/restore, warm standby and active-active.

## Key decisions at a glance

| Decision | Value | Consequence |
|---|---|---|
| Reliability is measured per user journey | Five SLOs: registration, read, assignment, propagation, completion | A single "system availability" number cannot hide a broken journey |
| Internal target is stricter than the external promise | SLO 99.5%, proposed SLA 99.0% for registration | The team has a margin before a contractual breach |
| The error budget decides releases | >50% normal, 25–50% cautious, 1–25% reliability-only, 0% freeze | Reliability becomes a shared currency, not an argument |
| One correlation ID per business operation | ARM → API → database → outbox → broker → consumers → audit | A single trace answers "where" and "why" |
| Every external edge has a timeout, a retry rule and a bulkhead | C2 v0.3, edges E1–E12 | A slow Workforce cannot exhaust the read and write paths |
| Degradation is explicit and tested | M0–M5 modes, failure table | Users see what still works, not a generic error |
| Audit fails closed | Privileged action is rejected if the audit cannot be recorded | Legal evidence is not traded for availability |
| DR is a pilot light with a warm data tier | RTO 60 min, RPO 5 min, audit RPO 0 | A regional loss is recoverable without a permanently running second region |

## Status and evidence

| Area | Designed | Implemented | Verified |
|---|---|---|---|
| SLO catalogue and budgets | Yes | No | No |
| Telemetry schema and correlation ID | Yes | No | No |
| Dashboard | Sketch | No | No |
| Resilience patterns | Yes, on C2 | No | No |
| Degradation table | Yes | No | No |
| DR plan and ADR | Yes | No | No |

The distinction matters for review: a design artefact can be accepted as a plan, but it cannot be presented as evidence that the system meets the target. The readiness checklist in [§8.3](11-sre-specification.md) lists the missing measurements and the open questions.

## Relation to earlier weeks

The SLOs reuse the NFR thresholds rather than inventing new ones: NFR-02 for registration durability, NFR-03 for the two-second read budget, DQ-06 for the fifteen-minute freshness target and NFR-04 for the audit guardrail. The E2E catalogue supplies the journeys and the negative branches; the external-environment tables supply the dependency timeouts; the access-and-audit document supplies the fail-closed rule and the audit fields. The resilience view is an overlay on the week-8 C2 external boundary, not a replacement for it.
