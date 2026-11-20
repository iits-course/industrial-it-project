# Week 12 · Educational post-mortem: INC-2026-04

**Status:** educational simulation. The incident, the timeline and the figures are constructed to exercise the review method; they are not production measurements. The review is blameless: it changes the system, not the people ([Lecture 12, slides 18–22]). Numbers are marked `[H]` where they are hypotheses rather than data from a running system.

**Incident:** INC-2026-04 · Assignment retries amplify a Workforce slowdown
**Date:** 2026-10-14, 10:05–12:05 UTC · **Severity:** SEV-2 · **Duration:** 2 h 00 min
**Services:** Repair Request Service, assignment orchestrator, Employee ARM, Workforce client
**Owner of the review:** Andrey · **Review date:** 2026-10-16 · **Published:** 2026-10-19

**Basis:** [Incident management](../runbooks/12-incident-management.md); [RB-01](../runbooks/12-runbooks.md); [SRE specification](../sre/11-sre-specification.md); [DR plan](../sre/11-dr-plan.md); [E2E-02](../quality/10-e2e-catalog.md); [access and audit](../security/09-access-audit.md); [ADR-002](../adr/ADR-002-assignment-saga-orchestration.md) and [ADR-007](../adr/ADR-007-assignment-security.md).

**Evidence labels.** `[D]` — derived from an existing Dossier artefact; `[H]` — hypothesis or simulated value introduced for the exercise.

## 1. Summary

At 10:05 the Workforce service became slow: its p95 latency rose from 0.8 s to about 12 s after a deployment by the neighbouring team. The assignment client timed out at 2 s, as designed, but two layers retried the call: the ARM had a client retry added for offline usability, and the orchestrator retried for resilience. The per-instance circuit breaker never opened because no single instance reached its 20-request minimum while traffic was spread across four instances. The retry wave multiplied the calls, filled the saga worker queue and produced duplicate reservations; the database unique constraint prevented duplicate active assignments, but the constraint violation surfaced as an HTTP `500` rather than a business rejection.

The incident was declared SEV-2 at 10:16 and mitigated at 11:20 after the ARM retry was disabled and the orchestrator retry was capped. Registration, reads, completion and closure continued throughout. No request was lost and the audit trail is intact. The assignment journey consumed 70 of its 90-event monthly budget, leaving 22%, which placed the journey in the reliability-only posture under the error-budget policy.

## 2. Impact

| Dimension | Impact | Evidence |
|---|---|---|
| Users | Dispatchers in all four areas could not complete new assignments for 75 min; 19 requests stayed unassigned for more than 30 min | Support log; `business_unassigned_requests` |
| Assignment commands | 118 saga attempts in the window, about 40 dispatcher actions multiplied by the client retry; 70 bad events: 63 unresolved beyond 60 s, 5 `failed_manual_review`, 2 requests that returned `500` | `assignment_saga_total{state}`; API logs |
| Data | No lost request; no duplicate active assignment; 2 duplicate reservations at Workforce, cancelled by `saga_id` | Reservation reconciliation; database constraint |
| Audit | No gap and no alteration; every privileged action has one audit record | Audit chain check; `audit_event_id` reconciliation |
| Notifications | Delayed up to 38 min; no duplicate delivery; assignment remained valid | `notification_delivery_duration_seconds`; DLQ empty |
| SLO | SLO-03: 70 of 90 budget events consumed (78%); 20 remaining (22%) | `slo_budget_remaining_ratio{slo="SLO-03"}` |
| SLA | The proposed 98.0% SLA was not breached in the window; the internal policy is the stricter constraint | SLO report |
| Business | 14 support calls; no contractual penalty; dispatch worked with a manual workaround | Incident log |

The distinction between "no lost data" and "no impact" matters. The system preserved every request and every audit record, which is the designed invariant. It still failed the dispatcher's journey for 75 minutes, and that is the reliability failure the review addresses.

## 3. Timeline

All times are UTC. The timeline is reconstructed from telemetry, the audit trail and the scribe's notes; where the sources disagree, the telemetry timestamp is used for system events and the scribe's note for human decisions.

| Time | Event | Source |
|---|---|---|
| 10:05 | Workforce p95 rises from 0.8 s to about 12 s after a neighbouring-team deployment | Dependency dashboard |
| 10:06 | First assignment calls hit the 2 s timeout; the orchestrator marks sagas `pending` | Trace; saga state |
| 10:07 | The ARM client retries the command twice with a new idempotency key | ARM log |
| 10:09 | The orchestrator retries the reservation, adding a second retry layer | Orchestrator log |
| 10:12 | First dispatcher calls support: "assignment spins and then fails" | Support log |
| 10:14 | The 1 h / 5 min burn-rate alert fires at 14.4× for SLO-03 | Alert manager |
| 10:16 | On-call declares SEV-2 and takes the incident commander role; scribe assigned | Incident record |
| 10:20 | First business update published using the template | Status page |
| 10:24 | Circuit breaker still closed on all four instances; the minimum volume was never reached per instance | `circuit_breaker_state` |
| 10:28 | Feature flag disables the ARM retry; the orchestrator retry is capped at one attempt | Change log |
| 10:34 | Second business update: no change in impact, workaround confirmed | Status page |
| 10:40 | The neighbouring team rolls back the Workforce deployment | Workforce owner |
| 10:44 | Workforce latency returns to baseline; half-open probes succeed | Dependency dashboard |
| 10:52 | Backlog drains; reconciliation finds two duplicate reservations | Reconciliation query |
| 11:05 | Duplicate reservations cancelled by `saga_id`; the `500` cases are converted to business rejections manually | Incident log |
| 11:20 | All sagas reach a terminal state; SLO burn falls below 1× | `assignment_saga_total`; burn rate |
| 12:05 | Stability window ends; incident resolved; review scheduled for 2026-10-16 | Incident record |

**Detection:** 9 min from the first failed transaction to the confirmed alert. The first user report arrived at 10:12, two minutes before the alert, which shows that the alert was correct but not early.
**Mitigation:** 75 min from the first failure to the last terminal saga; 41 min from declaration to the last terminal saga.

## 4. Contributing factors

The review rejects a single root cause. The failure required several conditions to align; removing any one of them would have reduced the impact substantially ([Lecture 12, slide 21]).

| Type | Factor | Why it mattered |
|---|---|---|
| Technical | Two retry layers: ARM and orchestrator | Multiplied calls to an already slow dependency and violated the one-retry-owner rule in [SRE §6.4](../sre/11-sre-specification.md) |
| Technical | Circuit breaker threshold counted per instance with a 20-request minimum | Traffic was spread across four instances, so no instance opened the circuit |
| Technical | ARM retry used a new idempotency key | Created duplicate reservations instead of a safe replay |
| Technical | Unique-constraint violation mapped to `500` | Turned a correct guardrail into an ambiguous server error |
| Organisational | Workforce deployment was not announced to the consuming team | The change arrived without a canary or a heads-up |
| Organisational | Load test used a constant 2 s delay, not a 15 s slow-provider profile | The failure mode was never exercised |
| Organisational | No GameDay had been run for the assignment journey | The runbook and the circuit configuration were untested |
| Latent | The runbook had no reservation-reconciliation or duplicate-check step | The responder had to invent the recovery under pressure |
| Latent | The dashboard had no unresolved-saga or duplicate-reservation panel | The first diagnosis relied on a dependency latency chart |
| Latent | No funded 24/7 rotation | Detection depended on a user call outside the alert window |

## 5. Five whys

| Why | Answer | Consequence |
|---|---|---|
| Why did 63 sagas stay unresolved beyond 60 s? | Workforce latency of about 12 s exceeded the 2 s client timeout, and retries amplified the load | The saga workers could not drain the queue |
| Why did retries amplify the load? | The ARM and the orchestrator both retried the same command | One user action produced up to six calls to Workforce |
| Why did two layers retry? | Each retry was added locally for a good reason — offline usability and resilience — without an owner for the whole chain | A local optimisation became a global failure mode |
| Why did the circuit breaker not open? | Its threshold required 20 requests per instance in 30 s, and traffic was split across four instances | The protection existed but never activated |
| Why was this not found before? | The load test used a constant 2 s delay, no GameDay was run, and the provider deployment was not announced | The system was tested against a convenient failure, not the feared one |

The chain moves from the person to the system. No individual ignored a rule: the rule about retry ownership was not represented in the architecture review, and the circuit threshold looked reasonable in isolation.

## 6. What worked and what did not

| Worked | Evidence |
|---|---|
| Registration, reads, completion and closure continued | SLO-01/02/05 stable during the window |
| The offline ARM preserved user work | No lost create; queue drained after recovery |
| The audit trail stayed complete | Hash chain verified; one record per privileged action |
| The communication template produced a usable first update in 15 min | Status page at 10:20 |
| Reconciliation by `saga_id` found the duplicate reservations | Two reservations cancelled without a second assignment |
| The database constraint prevented duplicate active assignments | Zero duplicate active assignments confirmed |

| Did not work | Evidence |
|---|---|
| The circuit breaker never opened | `circuit_breaker_state` stayed 0 on all instances |
| Two retry layers multiplied the load | Call counts at ARM, orchestrator and Workforce |
| The ARM retry created duplicate reservations | Two reservations with different keys for one command |
| The constraint violation returned `500` | API logs; support calls |
| The runbook lacked a duplicate and reconciliation step | RB-01 at the time of the incident |
| The dashboard lacked an unresolved-saga panel | Diagnosis relied on dependency latency |
| The alert lagged the first user report by 2 min | Support log 10:12; alert 10:14 |

## 7. Actions

Every action has an owner, a date and a priority. There is no action of the form "talk to the on-call engineer"; review actions enter the same backlog as features ([Lecture 12, slide 22]).

| ID | Action | Type | Owner | Due | Priority | Linked debt |
|---|---|---|---|---|---|---|
| A-01 | Remove the ARM retry for assignment; make the orchestrator the single retry owner | Prevention | Andrey | 2026-10-28 | P1 | [TD-01](../tech-debt/12-tech-debt-register.md) |
| A-02 | Aggregate the circuit-breaker threshold across instances instead of per instance | Prevention | Amir | 2026-10-28 | P1 | [TD-01](../tech-debt/12-tech-debt-register.md) |
| A-03 | Add a 15 s slow-provider profile with split traffic to the load test and the GameDay | Verification | Martin | 2026-11-04 | P1 | [TD-04](../tech-debt/12-tech-debt-register.md) |
| A-04 | Alert on `assignment_saga_total{state="failed_manual_review"}` and on unresolved saga age | Detection | Amir | 2026-10-21 | P1 | — |
| A-05 | Add reservation reconciliation and duplicate checks to RB-01 | Mitigation | Andrey | 2026-10-21 | P1 | — |
| A-06 | Add unresolved-saga and duplicate-reservation panels to the assignment dashboard | Detection | Martin | 2026-11-04 | P2 | — |
| A-07 | Map the unique-constraint violation to a business rejection with a stable reason code | Prevention | Martin | 2026-11-11 | P2 | — |
| A-08 | Agree a change-notification and canary rule with the Workforce owner | Communication | Amir | 2026-11-18 | P2 | [TD-02](../tech-debt/12-tech-debt-register.md) |
| A-09 | Run the assignment GameDay with the neighbouring team and publish the observation | Verification | Andrey | 2026-11-25 | P2 | [TD-05](../tech-debt/12-tech-debt-register.md) |

The actions are tracked in the reliability backlog. A-01, A-02 and A-03 are prerequisites for re-running the GameDay; A-04 and A-05 reduce the next incident's detection and mitigation time even if the dependency fails again.

## 8. Budget and policy consequences

| Item | Value | Consequence |
|---|---|---|
| SLO-03 budget | 90 events per 30 days | Fixed by the SLO catalogue |
| Bad events in the incident | 70 | 63 unresolved, 5 manual review, 2 `500` outcomes |
| Remaining budget | 20 (22%) | Reliability-only posture for P3 |
| Release posture | Reliability-only | No feature releases on assignment until the budget recovers above 25%; fixes, tests and observability only |
| Proposed SLA | 98.0% monthly | Not breached; 70 of 9,000 is 0.78% bad events, so the external promise survived while the internal budget did not |
| Exception | Required for any assignment feature release | Written approval from product, engineering and the reliability lead ([SRE §3.6](../sre/11-sre-specification.md)) |

The gap between the internal and external numbers is the point of the error budget: the team loses its release freedom before the customer loses the service. A review that only asks "did we breach the SLA?" would have closed this incident with no consequence.

## 9. Lessons

1. **Retry is an architecture property.** A retry added locally can become a global amplifier. The chain needs one owner, and the owner must be visible in the architecture review.
2. **A circuit breaker must see the traffic it protects.** A per-instance threshold is meaningless when traffic is spread across instances.
3. **Test the failure you fear.** A constant 2 s delay tests the timeout; a 15 s delay with retries tests the system.
4. **Guardrails need good error semantics.** The unique constraint did the right thing and returned the wrong message.
5. **The runbook is part of the mitigation.** The missing reconciliation step cost more time than the missing dashboard.
6. **Blameless does not mean consequence-free.** The system changed, the budget posture changed and the release plan changed; no individual was blamed.

## 10. Publication and follow-up

The review is published in the Dossier because a post-mortem is the best textbook about the system ([Lecture 12, slide 20]). The follow-up review is scheduled for 2026-11-25, after A-01–A-05 are closed and the GameDay is executed. Closure requires evidence for each action, not a status update: a merged change, a passing test, a dashboard link or a published GameDay observation.

| Follow-up | Date | Owner |
|---|---|---|
| Action check 1 (A-01, A-02, A-04, A-05) | 2026-10-28 | Andrey |
| Action check 2 (A-03, A-06) | 2026-11-04 | Martin |
| GameDay and final review | 2026-11-25 | Andrey |

## Appendix A · Post-mortem template

| Section | What to record |
|---|---|
| Summary | What happened, severity, duration, user-visible effect |
| Impact | Users, requests, data, audit, money, SLO budget, SLA |
| Timeline | Minute by minute, UTC, with the source of each entry |
| Detection and response | What fired, what was late, who responded, MTTD and MTTR |
| Contributing factors | Technical, organisational and latent; no single root cause |
| Five whys | The chain from the symptom to the system condition |
| What worked and what did not | Detection, runbook, communication, degradation, recovery |
| Actions | Owner, date, priority, type (prevent, detect, verify, communicate) |
| Budget and policy | Budget consumed, posture, release consequences, exceptions |
| Lessons | What the team learned about the system that it did not know before |
| Follow-up | Action checks, GameDay, publication date |

## Appendix B · Evidence sources

| Evidence | Source | Used for |
|---|---|---|
| Assignment outcomes | `assignment_saga_total{state}`, `assignment_saga_duration_seconds` | Impact and timeline |
| Dependency latency | `dependency_request_duration_seconds{dependency="workforce"}` | Trigger and recovery |
| Circuit state | `circuit_breaker_state{dependency="workforce"}` | Contributing factor |
| Retry calls | ARM and orchestrator logs by `correlation_id` | Retry amplification |
| Reservations | Workforce reservation by `saga_id` | Duplicate analysis |
| Audit | `audit_event_id`, `correlation_id`, hash chain | Guardrail verification |
| Notifications | `notification_delivery_total{result}`, DLQ depth | Supporting impact |
| Budget | `slo_budget_remaining_ratio{slo="SLO-03"}` | Policy consequence |

## Appendix C · Review quality checklist

| Check | Evidence in this review |
|---|---|
| Blameless language: no individual named as a cause | §4–§5 attribute the outcome to system conditions |
| Timeline is sourced, not remembered | §3 cites telemetry, audit and scribe notes |
| Contributing factors include organisational and latent causes | §4 |
| Actions have an owner, a date and a type | §7 |
| At least one action improves detection and one improves prevention | A-04/A-06 and A-01/A-02/A-07 |
| Budget and policy consequences are stated | §8 |
| What worked is recorded, not only what failed | §6 |
| The review is published and followed up | §10 |
