# Week 12 · Incident runbooks

**Status:** design hypothesis v1.0. The procedures are written against the target architecture and have not been executed against a running system. Each runbook is dated `Not yet verified` and must be exercised in a GameDay before it is treated as operational.

**Basis:** Lecture 12, slides 14–17 and 32–33; [incident management](12-incident-management.md); [SRE specification](../sre/11-sre-specification.md); [DR plan](../sre/11-dr-plan.md); [E2E catalogue](../quality/10-e2e-catalog.md); [external environment](../08-external-environment.md); [access and audit](../security/09-access-audit.md); [ADR-002](../adr/ADR-002-assignment-saga-orchestration.md), [ADR-005](../adr/ADR-005-notification-channel-adapter.md), [ADR-007](../adr/ADR-007-assignment-security.md) and [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md).

**Evidence labels.** `[D]` — derived from an existing Dossier artefact; `[H]` — design hypothesis introduced here and requiring measurement or approval.

## 1. Runbook standard

A runbook is a step-by-step instruction for one type of failure, written for a tired person at 03:00 who sees the system for the first time ([Lecture 12, slide 15]). It is bound to an alert, not stored in a wiki that nobody opens. Every step states the expected result, so the responder can tell whether the step worked before moving on.

| Section | Required content |
|---|---|
| Name and trigger | The alert or user symptom that starts the runbook |
| Impact | Which journeys and users are affected, and which still work |
| Diagnose | Dashboards, traces, queries and status pages to check, with the interpretation |
| Mitigate | Ordered, reversible actions, each with an expected result |
| Verify | Numeric exit criteria that prove restoration |
| Escalate | Conditions, contacts and the time box |
| Owner and verification | The team accountable and the date of the last exercise |
| Do not | Actions that create a second incident |

A repeated step is a candidate for automation; a good runbook becomes shorter over time. A runbook without a verification date is a guess ([Lecture 12, slide 16]).

### 1.1 Coverage

| ID | Scenario | Journey and SLO | Default severity | GameDay | Owner | Last verified |
|---|---|---|---|---|---|---|
| RB-01 | Workforce slow, unavailable or inconsistent | P3 / SLO-03 | SEV-2 | Slow Workforce | Andrey | Not yet verified |
| RB-02 | Notification provider degraded or DLQ growing | Notification delivery / SLO-S2 | SEV-2 | Slow notification provider | Amir | Not yet verified |
| RB-03 | Site connectivity loss and offline ARM | P1 / SLO-01, NFR-02 | SEV-2 | Loss of site connectivity | Martin | Not yet verified |
| RB-04 | Compromised service credentials | All journeys; guardrail | SEV-1 | Compromised service keys | ИБ with Amir | Not yet verified |
| RB-05 | Loss of the primary region | All journeys / DR-02 | SEV-1 | Loss of the primary region | Martin with Amir | Not yet verified |

Audit-store failure is a guardrail procedure, not a sixth runbook: it is specified in [incident management §7.1](12-incident-management.md) and [DR-06](../sre/11-dr-plan.md).

## 2. RB-01 · Workforce slow, unavailable or inconsistent

**Owner:** Andrey · **Last verified:** Not yet verified · **GameDay:** Slow Workforce

**Trigger.** `slo_burn_rate{slo="SLO-03"}` above 6× for 30 min or 14.4× for 5 min; `dependency_request_duration_seconds{dependency="workforce"}` p95 above 2 s; `assignment_saga_total{state="failed_manual_review"}` increasing; the Workforce circuit open; dispatchers report that assignment does not complete.

**Impact.** New assignments fail or remain unresolved. Registration, reads, completion and closure continue. No request is lost, but a request may stay unassigned longer than the dispatch target. A duplicate active assignment is a guardrail violation, not an ordinary degradation.

### 2.1 Diagnose

| Signal | Where | Expected in a healthy system | Interpretation |
|---|---|---|---|
| Workforce latency and error rate | Dependency dashboard; `dependency_request_duration_seconds{dependency="workforce"}` | p95 below 0.8 s; error rate below 1% | A latency rise with a low error rate is the slow-provider pattern |
| Circuit state | `circuit_breaker_state{dependency="workforce"}` | 0 (closed) | 1 half-open or 2 open means the client is already protecting itself |
| Saga outcomes | `assignment_saga_total{state}` | Mostly `confirmed`; few `rejected`; no `failed_manual_review` | Growing `pending` means the orchestrator is waiting; growing `failed_manual_review` means compensation is stuck |
| Reservation consistency | Workforce reservation by `saga_id` | Zero or one reservation per saga | Two reservations for one saga is a duplicate-risk signal |
| Database pool | `db_pool_in_use`, `db_pool_wait_seconds` | Below 20 connections; low wait | A saturated pool means the problem is local, not only external |
| Provider status | Workforce status page or owner channel | No announced incident | Confirms whether the cause is external |

### 2.2 Mitigate

1. **Confirm the circuit state before changing anything.** If the circuit is open, the assignment path is already failing fast; do not disable it. Expected result: the failure is bounded and no new reservation is being created.
2. **Disable client-side retries for assignment.** The ARM must not retry an assignment command; the orchestrator is the single retry owner ([SRE §6.4](../sre/11-sre-specification.md)). Expected result: request volume to Workforce stops growing.
3. **Keep the request unassigned and show the degradation message.** Do not write an assignment manually into the database. Expected result: the dispatcher sees "Assignment is temporarily unavailable; the request remains unassigned" and can continue other work.
4. **Reconcile reservations by `saga_id`.** For every saga in `pending` or `failed_manual_review`, read the reservation by saga ID before any new attempt. Expected result: a reservation that already exists is confirmed, not reserved twice.
5. **Cancel orphan reservations by `saga_id`.** If the saga is rejected and a reservation exists, cancel it with the same key. Expected result: Workforce holds no reservation for a rejected saga.
6. **Drain the manual-review queue.** Assign a named reviewer to every `failed_manual_review` saga; record the decision in the audit trail. Expected result: no saga older than 30 min remains unexplained.
7. **Re-enable normal assignment only after three successful half-open probes.** Expected result: the circuit closes and confirmed assignments resume.

### 2.3 Verify

| Check | Pass criterion |
|---|---|
| Assignment outcomes | 20 consecutive confirmed or correctly rejected sagas |
| Unresolved sagas | No saga older than 30 min without an owner |
| Duplicate reservations | Zero reservations duplicated by `saga_id` |
| Active assignments | Exactly one active assignment per request |
| SLO burn | `slo_burn_rate{slo="SLO-03"}` below 1× for 15 min |
| Core journeys | Registration, read and closure remain within their SLOs |

### 2.4 Escalate

If there is no improvement 30 min after step 2, raise to SEV-1 and contact the Workforce owner. If the failure is region-wide and other dependencies also fail, switch to [RB-05](12-runbooks.md). If a duplicate active assignment is confirmed, treat it as SEV-1 and open a guardrail review.

### 2.5 Do not

- Retry an assignment with a new idempotency key; it creates a second reservation.
- Edit the assignment table or the saga state directly.
- Mark a request as assigned because the dispatcher "knows" the engineer.
- Cancel a reservation without the `saga_id` that created it.

## 3. RB-02 · Notification provider degraded or DLQ growing

**Owner:** Amir · **Last verified:** Not yet verified · **GameDay:** Slow notification provider

**Trigger.** `notification_delivery_total{result="unknown"}` above 5% for 10 min; DLQ depth above zero; oldest undelivered notification older than 15 min; provider `5xx` or timeout rate rising; the provider circuit open.

**Impact.** Assignment and closure remain valid; only the notification is delayed or lost. Users see the assignment in the ARM. A false "delivered" status is a defect; a delayed notification is an accepted degradation ([SRE §7.2](../sre/11-sre-specification.md)).

### 3.1 Diagnose

| Signal | Where | Expected in a healthy system | Interpretation |
|---|---|---|---|
| Delivery result mix | `notification_delivery_total{result}` | Mostly `accepted`; `unknown` below 1% | A rising `unknown` means the provider did not confirm |
| Delivery latency | `notification_delivery_duration_seconds` | p95 below 2 s | A latency rise precedes timeouts |
| DLQ depth | Broker management console | 0 | Any message in DLQ has exhausted five attempts |
| Circuit state | `circuit_breaker_state{dependency="notification_provider"}` | 0 (closed) | Open means the adapter is already failing fast |
| Provider status | Provider status page or contract channel | No incident | Confirms external cause |
| Token bucket | Adapter metrics | Within contract | A rate-limit rejection is not a provider outage |

### 3.2 Mitigate

1. **Do not create a new event key for a retry.** The adapter retries with the same key; a new key duplicates the notification ([ADR-005](../adr/ADR-005-notification-channel-adapter.md)). Expected result: one delivery per event.
2. **Enable the secondary channel flag** if the primary provider is unavailable and the contract allows it. Expected result: delivery resumes through the secondary channel with the same event ID.
3. **Leave the queue bounded and visible.** Do not delete messages to reduce the DLQ depth. Expected result: the backlog is measurable and recoverable.
4. **Show "Notification delayed" in the ARM.** The assignment is valid; the user must not be told that delivery failed permanently. Expected result: support calls decrease and no manual re-notification is attempted.
5. **Replay the DLQ after the provider recovers**, one message at a time, with deduplication by `event_id`. Expected result: one effect per event; no duplicate notification.
6. **Record the delivery status honestly.** A notification whose outcome is unknown stays `unknown`; it is not marked `delivered` by hand.

### 3.3 Verify

| Check | Pass criterion |
|---|---|
| Delivery success | Above 99% for 10 min |
| DLQ | Empty and stable |
| Oldest undelivered | Below 5 min |
| Duplicate deliveries | Zero for the incident window |
| Assignment and closure | Unaffected; SLO-03 and SLO-05 stable |

### 3.4 Escalate

If delivery is still below 99% after 30 min, raise to SEV-1, contact the provider and publish a business update. If the provider contract has no secondary channel, record the gap as a tech-debt item ([TD-03](../tech-debt/12-tech-debt-register.md)).

### 3.5 Do not

- Delete or purge the DLQ to make the dashboard green.
- Send the same notification manually outside the adapter; it bypasses deduplication and audit.
- Switch provider without preserving the event-to-delivery mapping.
- Mark a message as delivered without a provider acknowledgement.

## 4. RB-03 · Site connectivity loss and offline ARM

**Owner:** Martin · **Last verified:** Not yet verified · **GameDay:** Loss of site connectivity

**Trigger.** Site heartbeat missing; API unreachable from more than one site; ARM sync queue growing; users report that the form does not send; `business_requests_registered_total` drops to zero in an area with normal volume.

**Impact.** Registration continues locally within the offline window (up to 4 h or 500 operations, [NFR-02](../04-requirements.md)). Reads come from the local cache. Assignment, priority change and closure are disabled because they require a current server state. After reconnection, queued operations synchronise once, without duplicates.

### 4.1 Diagnose

| Signal | Where | Expected in a healthy system | Interpretation |
|---|---|---|---|
| Site heartbeat | Network monitoring | Present | Missing heartbeat with working users is a monitoring gap |
| ARM queue depth and age | ARM diagnostics; `arm_queue_depth`, `arm_queue_oldest_age_seconds` | Near zero | A growing queue means the site is offline or the API is rejecting |
| API reachability | Synthetic check from the site network | 200 within 2 s | A regional failure affects many sites; a single site is a local network issue |
| Authentication | SSO and token expiry | Valid session | An expired token can look like a network failure |
| Server error rate | `rr_requests_total{outcome="error"}` | Below 1% | A server-side error is not an offline event |

### 4.2 Mitigate

1. **Confirm offline mode is active and bounded.** The ARM must show "Offline. The request will be sent when the connection returns." Expected result: the user knows the operation is queued, not lost.
2. **Protect the queue bound.** Do not raise the 500-operation or 4-hour limit during the incident; an unbounded queue is a hidden outage ([SRE §7.3](../sre/11-sre-specification.md)). Expected result: the oldest queued operation is visible and below the limit.
3. **Disable assignment, priority and closure in the affected sites.** These actions require a current server state and must fail explicitly. Expected result: no conflicting offline change.
4. **Tell users what still works.** Create and cached reads are available; the rest waits. Expected result: users do not switch to paper or telephone, which would create a second, invisible record.
5. **Prepare the reconnect path.** Stagger reconnection with jitter and a rate limit so that all sites do not replay at once. Expected result: the API is not overwhelmed by the reconnect storm.
6. **After reconnection, confirm one operation per idempotency key.** Reconcile the queue against the server records. Expected result: one request per queued operation; no duplicate.

### 4.3 Verify

| Check | Pass criterion |
|---|---|
| Queue drain | Typical site queue drained within 60 s after reconnect ([NFR-02](../04-requirements.md)) |
| Lost operations | Zero |
| Duplicate requests | Zero for the incident window |
| Oldest queued operation | Below 4 h during the offline period |
| Server error rate | Back to baseline after the drain |

### 4.4 Escalate

If a site is offline for more than 4 h, or the queue approaches 500 operations, raise to SEV-2 and involve the network owner. If any queued operation cannot be confirmed after reconnection, raise to SEV-1: a lost report is the failure the offline design exists to prevent.

### 4.5 Do not

- Extend the offline window without a measured storage and conflict analysis.
- Edit IndexedDB or the local queue by hand.
- Replay a queued operation with a new key.
- Tell users that an offline create is "registered" before the server confirms it.

## 5. RB-04 · Compromised service credentials

**Owner:** ИБ with Amir · **Last verified:** Not yet verified · **GameDay:** Compromised service keys

**Trigger.** Secret-scanning alert; anomalous Workforce or provider calls from an unexpected source; a spike in `401`/`403`; an audit anomaly; a notification from ИБ; a credential found in a repository, log or image.

**Impact.** The compromised credential may allow unauthorised reservations, notifications or audit reads, depending on its scope. Availability may be unaffected, which makes this incident easy to under-rate: it is SEV-1 until ИБ establishes the blast radius.

### 5.1 Diagnose

| Signal | Where | Expected in a healthy system | Interpretation |
|---|---|---|---|
| Credential identity and scope | Secret store; access-audit A-08/A-10 | Least privilege, one purpose | A shared or broad scope enlarges the blast radius |
| Last use and source | Adapter logs, gateway logs | Known hosts and schedule | An unexpected source confirms misuse |
| Assignment anomalies | Reservations by `saga_id`; duplicate active assignments | One reservation per saga | Unauthorised reservations may become assignments |
| Notification anomalies | `notification_delivery_total`; provider records | One delivery per event | Bulk or unexpected messages indicate misuse |
| Audit access | Audit store read log | Only named investigations | A read outside an investigation is a signal |
| Audit chain | Hash chain verification | Continuous | A gap means evidence may be lost |

### 5.2 Mitigate

1. **Revoke the credential first, analyse second.** Revoke the client or rotate the secret in the secret store. Expected result: the old credential is rejected within the token lifetime.
2. **Disable the affected integration flag if revocation is not immediate.** Expected result: the adapter stops calling the dependency; the core journeys continue with the documented degradation.
3. **Preserve evidence before cleanup.** Export the relevant logs, audit records and gateway entries by `correlation_id`; do not delete or rotate the logs. Expected result: the investigation has a defensible timeline.
4. **Rotate every secret that could have been exposed**, including adjacent adapters that shared a store or a deployment identity. Expected result: no credential from the exposed set remains valid.
5. **Force re-authentication of affected human sessions** if a user credential is implicated. Expected result: stolen sessions cannot continue.
6. **Verify the blast radius with the audit trail.** Compare reservations, assignments, notifications and audit reads against the expected business volume for the exposure window. Expected result: every unexplained action has an owner or is contained.
7. **Notify ИБ and the incident commander.** If personal data or legal evidence is involved, follow [DR-04](../sre/11-dr-plan.md).

### 5.3 Verify

| Check | Pass criterion |
|---|---|
| Old credential | Rejected on every endpoint |
| New credential | Works only from the expected host and scope |
| Unauthorised actions | None after the revocation timestamp |
| Audit chain | Intact and verified |
| Business state | No duplicate active assignment or unexplained notification |
| Secret inventory | No remaining copy of the exposed secret |

### 5.4 Escalate

This runbook starts at SEV-1. Escalate to the security lead and the business owner immediately; if data exfiltration or destructive activity is suspected, move to [DR-04](../sre/11-dr-plan.md). The closure requires ИБ sign-off, not only an engineering confirmation.

### 5.5 Do not

- Wait for confirmation before revoking a credential that is known to be exposed.
- Delete logs, audit records or the compromised host to "clean up".
- Rotate the secret and keep the old one active "for rollback".
- Reuse the same credential across adapters after the incident.

## 6. RB-05 · Loss of the primary region

**Owner:** Martin with Amir · **Last verified:** Not yet verified · **GameDay:** Loss of the primary region

**Trigger.** At least two independent signals: the region endpoint is unavailable; PostgreSQL, RabbitMQ and object storage are unreachable; multiple services fail at once; the failure persists beyond five minutes. A single service failure is not a regional loss.

**Impact.** Core journeys are unavailable until the DR plan completes. The offline ARM queues new registrations within its 4-hour window. The recovery objectives are RTO 60 min and RPO 5 min for the core data, and RPO 0 for the audit trail ([ADR-009](../adr/ADR-009-disaster-recovery-strategy.md)).

### 6.1 Diagnose

| Signal | Where | Expected in a healthy system | Interpretation |
|---|---|---|---|
| Region health | Provider status; synthetic checks from two networks | Available | Two independent failures confirm a regional event |
| Database and broker | Connection errors; replication lag | Reachable; lag below 5 min | A reachable replica changes the recovery path |
| Cross-region replica lag | Replication dashboard; last applied LSN | Below 5 min | Above 5 min means an RPO breach must be declared |
| Audit copy | Object-store health; hash chain | Synchronous and intact | The audit copy is the recovery source of record |
| DNS TTL | DNS configuration | 60 s | A long TTL delays the switch |
| Backups | Object storage; restore test record | Available and verified | An unverified backup is not a recovery option |

### 6.2 Mitigate

Follow the phased playbook in [DR plan §6.1](../sre/11-dr-plan.md). The time boxes are targets for a trained team, not a promise.

1. **Detect and declare (0–10 min).** The incident commander confirms a regional event with two independent signals, declares DR, notifies the business owner and ИБ, freezes deployments and assigns roles. Expected result: the declaration is recorded with time and scope.
2. **Verify the replica (10–15 min).** Read the lag and the last applied LSN; verify backup availability and DNS TTL. Expected result: lag ≤ 5 min, or an explicit RPO breach is declared.
3. **Promote the data tier (15–25 min).** Promote the replica, open it for writes, validate schema version, extensions and roles, and confirm the audit copy. Expected result: the database accepts writes and integrity checks pass.
4. **Restore the platform (25–40 min).** Scale the application, relay, workers and adapters; restore configuration and secrets; declare broker queues; switch DNS. Expected result: health checks pass and internal calls succeed.
5. **Validate (40–55 min).** Run the smoke path create → read → assign → complete → close; verify the correlation trace, outbox publication, notification and audit write; run reconciliation counts. Expected result: gates G1–G5 pass.
6. **Announce and stabilise (55–60 min and the first 24 h).** Announce with known limitations; keep analytics disabled; drain the outbox; reconcile the ARM queue; monitor duplicates and lag. Expected result: no unexplained duplicate or missing fact.

### 6.3 Verify

| Gate | Check | Pass criterion |
|---|---|---|
| G1 Data integrity | Schema version, row counts, checksums, referential integrity, audit chain, no duplicate active assignment | All pass; last applied LSN recorded |
| G2 Functional smoke | Create, read, assign, complete, close, correlation trace, outbox, notification, audit | All pass |
| G3 Reconciliation | Request, history, audit and event counts agree; outbox drained; consumer lag ≤ 15 min | All pass |
| G4 Security | Access checks; privileged writes audited; secrets rotated if compromise is suspected | ИБ sign-off |
| G5 Business acceptance | The process owner confirms that dispatch can work with the known limitations | Written acceptance |

### 6.4 Escalate

The incident commander declares DR and owns the timeline. The business owner accepts any RPO breach and the restored service. ИБ owns the decision to restore after a compromise. If the replica lag exceeds five minutes, the incident is still recoverable, but the business owner decides whether to accept the loss or wait for a backup restore; the decision and the lost interval are recorded.

### 6.5 Do not

- Promote the replica without checking the lag and the last applied LSN.
- Switch DNS before the validation gates pass.
- Reopen writes before the audit copy is verified.
- Restore over the live database during a logical-corruption incident; use an isolated instance.
- Announce recovery while the outbox or the ARM queue is still unexplained.

## 7. Runbook quality checklist

| Check | Evidence |
|---|---|
| Bound to a specific alert or symptom | The alert text contains the runbook link |
| Impact states what still works | The degradation table row is referenced |
| Every mitigation step has an expected result | The step text contains "Expected result" |
| Verification is numeric | A threshold and a time window |
| Escalation has a condition, a contact and a time box | Named role and team |
| Owner and last verification date are present | The table in §1.1 |
| The procedure has been exercised | GameDay report with the observed deviations |
| The procedure is shorter than the previous version, or the reason is recorded | Change history |

## 8. Maintenance

Runbooks are reviewed quarterly and after every SEV-1/2 incident, every GameDay and every architecture change that touches an external edge. A review that finds nothing is recorded as a review; a runbook that has not been reviewed for two quarters is removed from the alert links until it is verified. The runbook set is the operational counterpart of the [C2 resilience view](../diagrams/11-c2-resilience.svg): every edge E1–E12 with a pattern code must appear in at least one diagnosis table.
