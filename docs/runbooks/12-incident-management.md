# Week 12 · Incident management and on-call regulation

**Status:** design hypothesis v1.0 for the educational architecture. No incident has been managed under this regulation, no rotation has been staffed and no GameDay has been executed. The severity thresholds, response times and page limits are proposals to be validated in the pilot; they are not an operational commitment.

**Basis:** Lecture 12, slides 5–13, 18–22 and 30–35; [SRE specification](../sre/11-sre-specification.md); [DR plan](../sre/11-dr-plan.md); [E2E catalogue](../quality/10-e2e-catalog.md); [external environment](../08-external-environment.md); [access and audit](../security/09-access-audit.md); [FR/NFR register](../04-requirements.md); [ADR-007](../adr/ADR-007-assignment-security.md) and [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md).

**Evidence labels.** `[D]` — derived from an existing Dossier artefact; `[H]` — design hypothesis introduced here and requiring measurement or approval.

## 1. Scope and position in the trust model

Week 11 defined when a service is unreliable: the SLO burns faster than the error-budget policy allows, and a symptom-based alert wakes the on-call engineer. This document defines what the people do after that alert. It covers severity levels, the incident lifecycle, roles, communication, the on-call regulation and the exercise programme. The step-by-step procedures for specific failures are in the [runbook set](12-runbooks.md); the learning artefact is the [post-mortem](../postmortems/12-incident-review.md).

The boundary between the artefacts is deliberate:

| Question | Artefact |
|---|---|
| Is the service healthy, and how much budget is left? | [SRE specification §3](../sre/11-sre-specification.md) |
| Is this failure a disaster or an ordinary degradation? | [DR plan §6](../sre/11-dr-plan.md) |
| Who leads, who fixes, who communicates, how fast? | This document |
| What exactly do I type at 03:00? | [Runbooks](12-runbooks.md) |
| Why did it happen, and what changes? | [Post-mortem](../postmortems/12-incident-review.md) |
| What did we knowingly postpone? | [Tech-debt register](../tech-debt/12-tech-debt-register.md) |

An incident is an unplanned interruption or a degradation of service quality that affects users or threatens an SLO ([Lecture 12, slide 6]). A problem is the underlying cause and is handled after service restoration. A request is planned work — access, a report, a configuration change — and must not consume the incident process. The distinction matters because the incident process is optimised for restoration speed, not for explanation.

## 2. Severity levels

Severity is assigned from user and business impact, not from the number of failing components. A single database replica failure with automatic failover is not an incident; a wrong assignment rule that affects one dispatch area is. The level determines the response before anyone is awake enough to reason about it.

| Level | Criterion | RemKontur example | Response and communication |
|---|---|---|---|
| SEV-1 | A core operation is impossible at scale, or safety, legal evidence or personal data is at risk | Registration impossible in a region; duplicate active assignments at scale; audit chain broken; confirmed personal-data leak | Acknowledge in 5 min; incident commander; business owner notified; updates every 30 min |
| SEV-2 | Serious degradation with a workaround, or a guardrail is blocking privileged work | Assignment unavailable; notification provider down; audit store unavailable and privileged actions fail closed; read p95 above 5 s | Acknowledge in 15 min; incident commander for incidents longer than 30 min; updates hourly |
| SEV-3 | Partial degradation with limited user impact | One dispatch area affected; analytics lag above 1 h; master-data projection older than 60 min | Business hours; journey owner leads; update when the state changes |
| SEV-4 | No user impact | Wrong figure in a report; cosmetic defect; a single request has a manual workaround | Ticket in the normal backlog |

The following rules apply to every level:

1. **Impact, not cause.** A failed broker with no user impact is SEV-3 at most; a healthy broker with wrong assignment results is SEV-1.
2. **Escalation is cheap.** Any responder may raise the severity; only the incident commander may lower it, and the decision is recorded.
3. **One incident, one level.** A single incident may contain several failing components; the level describes the worst user-visible effect, not each component separately.
4. **Security overrides availability.** A suspected compromise is SEV-1 until ИБ determines otherwise, even if the service is fully available ([09 §2](../security/09-access-audit.md)).
5. **Guardrails are incidents.** A lost audit record, a duplicate active assignment or an unauthorised privileged change is never downgraded to a ticket, because the consequence is legal or safety-related, not merely a slower response.

The severity values are educational `[H]`. A real service would calibrate them against measured cost of downtime, which the Dossier does not contain ([02 §10](../02-capability-value-stream.md)).

## 3. Incident lifecycle

![Incident lifecycle](../diagrams/12-incident-lifecycle.svg)

The lifecycle has five stages and one feedback loop. The loop is the point of the process: an incident that does not change detection, the runbook or the architecture will repeat with a different person ([Lecture 12, slide 19]).

| Stage | Entry condition | Actions | Exit criterion | Evidence |
|---|---|---|---|---|
| 1 · Detect | A symptom alert fires, a user calls, or a synthetic check fails | Validate the signal; open the incident channel; start the timeline; assign a scribe | The signal is confirmed as a real user impact, not a monitoring artefact | Alert link, first user report, timestamp |
| 2 · Respond | Confirmed impact | Assign severity; name the incident commander; identify affected journeys; send the first business message; freeze risky changes | Roles are assigned and the first update is published | Incident record, severity decision, first update |
| 3 · Mitigate | Roles assigned | Roll back, switch a flag, fail over, degrade, drain or isolate; prefer the fastest reversible action | Users can complete the affected journey, or the documented degradation is active and visible | Action log with expected and actual result |
| 4 · Resolve | Mitigation works | Confirm SLO burn is below 1×; drain backlogs; reconcile duplicates; monitor for a stability window | Metrics stable for 30 min; no unexplained duplicate or missing fact; business owner accepts | Dashboard snapshot, reconciliation output |
| 5 · Review | SEV-1 or SEV-2 resolved, or any guardrail incident | Blameless post-mortem within five business days; actions with owner and date; publish | Actions are in the backlog; the review is published; the runbook and tests are updated | [Post-mortem](../postmortems/12-incident-review.md), action register |

The stage boundaries are not a waterfall. Mitigation may begin before the severity is formally assigned, and a failed mitigation returns the incident to stage 3. What must not happen is a silent transition: every change of stage, severity or owner is written into the timeline with a UTC timestamp.

### 3.1 Detection

Detection is measured from the first failed user transaction, not from the first alert. The SRE specification provides symptom-based burn-rate alerts ([§3.7](../sre/11-sre-specification.md)); a user call is a legitimate detection source but is a signal that the alerting has a gap. The target is detection within five minutes for SEV-1 and fifteen minutes for SEV-2 `[H]`. The educational incident in the [post-mortem](../postmortems/12-incident-review.md) detects at nine minutes, inside the fifteen-minute SEV-2 target, but the first user report arrives two minutes before the alert. Detection met the target and still depended on a user; that gap becomes an action rather than a reproach.

### 3.2 Mitigation before diagnosis

During an incident the goal is to restore the service, not to find the cause ([Lecture 12, slide 6]). A rollback is a normal mitigation, not an admission of failure. The following order is preferred because each step is faster and more reversible than the next:

1. Stop the bleeding with a flag, a rollback or a traffic shift.
2. Degrade explicitly according to the table in [SRE §7.2](../sre/11-sre-specification.md).
3. Fail over to a replica or a secondary channel.
4. Restore from backup or invoke the [DR plan](../sre/11-dr-plan.md).
5. Change code only when the first four options are unavailable or insufficient.

A mitigation that creates a new inconsistency is not a mitigation. For example, manually editing an assignment in the database to "unblock" a dispatcher violates the single-writer invariant and the audit rule; the correct action is to keep the request unassigned, tell the dispatcher, and reconcile through the saga.

## 4. Roles

A serious incident has four roles. One person may hold more than one role in a small team, but the incident commander and the technical lead must be different people as soon as the team size allows it.

| Role | Responsibility | Explicit non-goal | Current assignment |
|---|---|---|---|
| Incident commander (IC) | Declares severity; owns the timeline and decisions; assigns roles; approves mitigation and rollback; is the single point of accountability | Does not debug, type commands or fix the system | Rotating: Martin, Amir, Andrey |
| Technical lead | Diagnoses; directs engineers; executes or supervises the mitigation; reports the technical state to the IC | Does not own business communication | Service owner of the affected journey |
| Communications lead | Publishes the status update on schedule; translates technical state into business impact; maintains the single external channel | Does not speculate about causes or timelines | Product or operations representative |
| Scribe | Records UTC timestamps, decisions, actions and evidence links in real time | Does not participate in debugging | Any team member, rotating |

Supporting roles are invited as needed: ИБ for any security or audit event, the data owner for correctness incidents, the business owner for acceptance of a degraded or restored service, and the neighbouring team for Workforce incidents. The IC requests them; the communications lead tells them what to say and when.

The rule that the incident commander does not fix anything is not ceremonial. A commander who is debugging stops coordinating, and the other responders lose the single decision point. In a three-person team the IC may be the only person available; in that case the IC explicitly hands the technical work to the secondary on-call and records the split.

## 5. Communication

Communication is a scheduled obligation, not a courtesy. Silence is interpreted as either "nothing is happening" or "nobody is in control"; both are worse than an update that says "no change". The template is prepared in advance and filled in during the incident ([Lecture 12, slide 11]).

| Field | Content rule | RemKontur example |
|---|---|---|
| What is happening | One sentence, user-visible effect, start time | Assignment is unavailable in the Central dispatch area since 10:05 |
| Impact | What still works and what does not | Registration, card, history and closure work; new assignments fail and requests remain unassigned |
| What we are doing | Current action, not a hypothesis about cause | We disabled the client retry and are reconciling reservations by saga ID |
| Workaround | A concrete action the user can take | Keep the request unassigned; retry after 15 minutes; record the intended engineer in the request comment |
| Next update | A fixed time, even if there is no news | 11:00 UTC, even if nothing changes |
| Reference | Incident ID and, for support, the correlation ID range | INC-2026-04; support reference SUP-4412 |

Communication rules:

1. **Cadence.** SEV-1 every 30 minutes; SEV-2 hourly; SEV-3 when the state changes. An update is published at the promised time even when there is nothing new.
2. **One channel.** The status page or the business chat is the source of truth; the incident channel is internal. Side conversations are summarised back into the incident channel.
3. **No speculation.** Do not name a cause, a vendor or a person until the fact is confirmed. "We are investigating" is acceptable; "the provider is down" is not, until it is verified.
4. **No internal detail.** Do not expose hostnames, stack traces, tokens, correlation IDs or personal data to business users. The support reference maps to the correlation ID inside the team.
5. **What works first.** Users need to know how to continue working, not how the system is built.
6. **Closing message.** State the restored service, the known limitations, the monitoring period and when the review will be published.

## 6. On-call regulation

The on-call rotation is the human interface of the alerting system. If the on-call engineer is woken every night, the problem is in the alerts and the architecture, not in the engineer ([Lecture 12, slide 12]).

### 6.1 Rotation and handover

| Element | Rule |
|---|---|
| Rotation | One week, Monday 09:00 to Monday 09:00; primary and secondary on-call |
| Handover | Written note before the shift: open incidents, at-risk SLOs, changes in the last 24 h, expiring certificates or secrets, known degradations, planned maintenance |
| Acknowledgement | SEV-1 within 5 min; SEV-2 within 15 min; SEV-3 during business hours |
| Escalation | No acknowledgement in 5 min (SEV-1) or 10 min (SEV-2) → secondary on-call; then the incident commander; then the engineering lead |
| Access check | Runbook access, dashboards, break-glass procedure and contact list verified before the shift starts, not during an incident |
| Night calls | Maximum of two per person per week as a planning assumption; exceedance triggers an alert-quality review and compensation |
| Compensation | Agreed with the employer; this document defines the operational need, not the employment terms |

The current team has three engineers and no funded 24/7 rotation. Until a rotation is funded, the plan assumes business-hours detection with best-effort night coverage, and this limitation is recorded as a technical debt ([TD-05](../tech-debt/12-tech-debt-register.md)). A service that promises 99.5% availability without a funded rotation is making a promise it cannot keep; the gap must be visible to the business owner, not hidden in a rota spreadsheet.

### 6.2 Alert hygiene

| Rule | Rationale |
|---|---|
| Page only on user symptoms or guardrail violations | A CPU threshold is a dashboard signal, not a reason to wake a person |
| Every page has a runbook link and an owner | An alert without an action is noise |
| Every page is actionable within 15 minutes | Otherwise it belongs in a ticket |
| No alert on a single transient error | Flapping trains responders to ignore pages |
| Review page volume weekly | More than two night pages per week per person is a design defect |
| Delete or downgrade alerts that never lead to action | An ignored alert is worse than no alert because it hides the next real one |

The alert catalogue is the one in [SRE §3.7 and §5.2](../sre/11-sre-specification.md). This document adds the human response, not a second alerting system.

## 7. Guardrail and security incidents

Some failures are not reliability variances and must not be handled as "slow service". The following table defines the first response; the detailed steps are in the runbook set and the DR plan.

| Event | Severity | First action | Runbook or plan |
|---|---|---|---|
| Audit store unavailable | SEV-2 | Privileged changes fail closed; ordinary reads continue; check the durable buffer | [DR-06](../sre/11-dr-plan.md); §7.1 below |
| Confirmed loss or alteration of an audit record | SEV-1 | Preserve evidence; stop privileged writes; involve ИБ | [DR-06](../sre/11-dr-plan.md); §7.1 below |
| Suspected compromised service credential | SEV-1 | Revoke the credential, rotate the secret, preserve evidence, check the blast radius | [RB-04](12-runbooks.md) |
| Duplicate active assignment | SEV-1 | Stop new assignments in the affected area; reconcile by saga ID; verify the audit trail | [RB-01](12-runbooks.md) |
| Personal-data leak in logs or traces | SEV-1 | Stop the leak, revoke access, preserve evidence, notify ИБ | [SRE §4.7](../sre/11-sre-specification.md) |

### 7.1 Audit fail-closed procedure

The audit trail is legally significant and has no error budget ([SRE §3.3](../sre/11-sre-specification.md)). The fail-closed rule means that a privileged action is rejected when the audit record cannot be durably written; availability is deliberately traded for evidence.

1. Confirm that the failure is in the audit path, not in the business transaction: check `audit_buffer_oldest_age_seconds`, the Audit Writer logs and the audit store health.
2. Keep privileged writes closed. Do not bypass the audit writer "temporarily"; a bypass converts an availability incident into a legal one.
3. Preserve the durable buffer. It is the recovery source; it must not be truncated or recreated.
4. If the store is unavailable, follow [DR-06](../sre/11-dr-plan.md): restore the immutable copy, verify the hash chain, and only then reopen privileged writes.
5. Reconcile the buffer with the business records by `audit_event_id` and `correlation_id`; confirm that every accepted privileged action has exactly one audit record.
6. Record the incident as SEV-2 if only availability was affected and as SEV-1 if any record was lost or altered. The business owner and ИБ sign the closure.

## 8. Exercise programme and GameDay

A runbook that has never been executed is a hypothesis. The GameDay is a controlled simulation: the scenario is announced at the start, the roles are assigned, the team works from the real dashboards and runbooks, and a short review follows ([Lecture 12, slides 32–33]).

| Scenario | What it tests | Runbook | Expected automatic behaviour | Pass criterion |
|---|---|---|---|---|
| Loss of site connectivity | Offline ARM, queue bounds, reconnect, duplicate prevention | [RB-03](12-runbooks.md) | Create is queued locally; assignment, priority and closure are disabled; reads are served from cache | No lost or duplicated create after reconnect; queue drained within 60 s for a typical site |
| Compromised service credentials | Revocation, blast-radius limitation, audit verification | [RB-04](12-runbooks.md) | Anomalous calls trigger the security alert; the credential is revoked; the audit trail is intact | Old credential rejected; no unauthorised assignment or notification after revocation |
| Loss of the primary region | DR declaration, replica promotion, DNS switch, validation gates | [RB-05](12-runbooks.md); [DR-02](../sre/11-dr-plan.md) | Region health checks fail; the pilot light is declared; the replica is promoted | RTO ≤ 60 min; RPO ≤ 5 min; gates G1–G5 pass |
| Slow notification provider | Timeout, circuit breaker, DLQ, secondary channel | [RB-02](12-runbooks.md) | Adapter times out at 5 s, retries with the same key, then DLQ; assignment stays valid | Delivery success above 99% for 10 min; DLQ drained; no duplicate delivery |
| Slow Workforce service | Assignment timeout, circuit breaker, saga reconciliation | [RB-01](12-runbooks.md) | Assignment fails fast; create, read and closure continue | No duplicate active assignment; SLO-03 burn returns below 1× |
| Stale master-data projection | Freshness banner, last valid projection, blocked unknown equipment | [RB-01](12-runbooks.md) and [SRE §7.2](../sre/11-sre-specification.md) | The adapter serves the last valid projection and raises the freshness banner | Unknown or retired equipment cannot be used; the banner is visible |

Each exercise produces a written observation: what happened automatically, what the user saw, how much budget was consumed, which runbook step was missing and which action was added. A GameDay without a written observation is a demonstration, not an exercise ([SRE §8.2](../sre/11-sre-specification.md)).

## 9. Process metrics

The incident process is itself measured. The metrics are diagnostic, not a performance ranking of individuals; a team that hides incidents to improve a number has defeated the purpose.

| Metric | Definition | Initial target `[H]` | Why it matters |
|---|---|---|---|
| MTTD | First failed user transaction → confirmed detection | ≤ 5 min SEV-1, ≤ 15 min SEV-2 | Detection is the part of recovery the team can shorten without a code change |
| MTTR | Detection → service restored | ≤ 60 min SEV-1, ≤ 4 h SEV-2 | Restoration is the promise to the user |
| Post-mortem timeliness | SEV-1/2 with a published review within five business days | 100% | Memory decays; a late review repeats the timeline from guesses |
| Action closure | Review actions closed by the agreed date | ≥ 80% at 30 days, ≥ 95% at 90 days | A review without completed actions is a document, not a learning loop |
| Repeat incidents | Incidents with the same contributing factor within 90 days | 0 | The strongest signal that the learning loop is broken |
| Page volume | Pages per on-call week, split by night and day | ≤ 2 night pages per person | High volume is an alert or architecture defect |
| Actionable pages | Pages that led to an action | ≥ 90% | Measures alert quality, not responder diligence |
| Runbook use | Incidents where the runbook was opened | 100% for covered scenarios | An unused runbook is either unknown or wrong |

The baseline is missing because no incident has been recorded. The first three months of the pilot establish the baseline; targets are then re-baselined rather than defended.

## 10. Readiness checklist and open questions

| Item | Status | Location |
|---|---|---|
| Severity levels with user-impact criteria and response times | Designed | §2 |
| Incident lifecycle with entry and exit criteria | Designed | §3 |
| Roles with explicit non-goals | Designed | §4 |
| Communication template and cadence | Designed | §5 |
| On-call rotation, handover and escalation | Designed, not staffed | §6 |
| Guardrail and security incident handling | Designed | §7 |
| Five runbooks including GameDay scenarios | Designed, not exercised | [Runbooks](12-runbooks.md) |
| One educational post-mortem and a template | Written | [Post-mortem](../postmortems/12-incident-review.md) |
| Tech-debt register with interest and priority | Written | [Register](../tech-debt/12-tech-debt-register.md) |
| Funded 24/7 rotation | Missing | [TD-05](../tech-debt/12-tech-debt-register.md) |
| Measured MTTD/MTTR baseline | Missing | §9 |
| GameDay executed | Missing | §8 |

| ID | Question | Impact |
|---|---|---|
| Q1 | Will the business fund a 24/7 rotation, and with what response times? | The severity response table and the 99.5% SLO both depend on it |
| Q2 | Who is the named business owner for accepting a degraded or restored service? | The closure of every SEV-1/2 incident |
| Q3 | Which communication channel is authoritative for dispatch sites? | The template and the status page |
| Q4 | What is the legal retention period for audit records? | Audit incident severity and storage cost ([TD-07](../tech-debt/12-tech-debt-register.md)) |
| Q5 | Which neighbouring team owns the Workforce contract and its on-call? | Assignment incidents cross an organisational boundary |
