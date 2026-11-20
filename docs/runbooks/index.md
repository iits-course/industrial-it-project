# Week 12 · Incident management, runbooks and technical debt: overview

This section completes the operational part of the Architecture Dossier. Week 11 defined what "reliable" means and how to recover from a regional loss; week 12 defines what people do when the service is unreliable, how they learn from it and what the team knowingly postponed.

The package is a design hypothesis. No incident has been managed under this regulation, no runbook has been executed, no GameDay has taken place and no debt has been repaid. The severity thresholds, response times, principal and interest figures are proposals that the pilot must replace with measurements.

## Artifacts

| Artifact | Content | Homework item |
|---|---|---|
| [Incident management and on-call regulation](12-incident-management.md) | Severity levels mapped to RemKontur, five-stage lifecycle, four roles, communication template and cadence, rotation and handover, guardrail incidents, exercise programme, process metrics | 1 |
| [Runbook set](12-runbooks.md) | Runbook standard, five procedures with trigger, impact, diagnosis, mitigation, verification, escalation and a last-verified date, quality checklist and maintenance rule | 2 |
| [Post-mortem INC-2026-04](../postmortems/12-incident-review.md) | Educational SEV-2 incident: impact, sourced timeline, contributing factors, five whys, what worked, nine actions with owner and date, budget consequences, reusable template | 3 |
| [Technical debt register](../tech-debt/12-tech-debt-register.md) | Definition and metaphor, quadrant, seven debt types, seven entries with principal and interest, prioritisation matrix, business framing, governance, template | 4 |
| [Incident lifecycle](../diagrams/12-incident-lifecycle.svg) | Five stages with entry and exit criteria, the feedback loop and the four roles | 1–3 |
| [Debt quadrant and priority](../diagrams/12-debt-quadrant.svg) | Awareness against judgement, and interest against principal with the register entries placed | 4 |

## Reading order

1. [Incident management §2–3](12-incident-management.md) — how severity is assigned from user impact and what the five stages require.
2. [Incident management §4–6](12-incident-management.md) — who does what, what is communicated and when, and what the on-call rotation actually promises.
3. [Incident management §7–8](12-incident-management.md) — the guardrail incidents that are never "just slow service", and the GameDay matrix.
4. [Runbooks §1](12-runbooks.md) — the standard every procedure follows, then RB-01 as the most likely first incident.
5. [Post-mortem](../postmortems/12-incident-review.md) — read the review before the runbooks if you want to see why the runbook steps exist.
6. [Debt register §2–5](../tech-debt/12-tech-debt-register.md) — the quadrant, the seven types and the repayment decision.

## Key decisions at a glance

| Decision | Value | Consequence |
|---|---|---|
| Severity comes from impact, not cause | SEV-1…SEV-4 with RemKontur examples | A failed component with no user effect is not a fire |
| The incident commander does not fix the system | IC, technical lead, communications lead, scribe | One decision point; debugging does not consume the coordinator |
| Communication is scheduled | SEV-1 every 30 min, SEV-2 hourly, SEV-3 on change | Silence is treated as a failure of the process |
| Mitigation before diagnosis | Flag, degrade, fail over, restore, change code — in that order | Rollback is normal, not an admission of failure |
| Audit fails closed | Privileged action rejected if the record cannot be written | Availability is traded for legal evidence |
| Every SEV-1/2 gets a blameless review | Within five business days, actions with owner and date | The learning loop is the point of the process |
| Runbooks are dated and exercised | `Not yet verified` until a GameDay observation exists | An unverified runbook is a hypothesis, not a procedure |
| Debt is recorded with principal and interest | Seven entries across the seven types | The business conversation is a number, not "we need a rewrite" |
| High interest and low principal is repaid first | TD-01 and TD-04 before the larger items | Small loans with real interest are the cheapest wins |

## Practice 3 package

Practice 3 assembles weeks 9–12 into one reviewable package. The parts are not new work; the package is the evidence that the parts fit together.

| Part | Content | Artefacts | Week | Status |
|---|---|---|---|---|
| 1 | Threat model, DFD, STRIDE, access matrix | [DFD and STRIDE](../security/09-threat-model.md), [access and audit](../security/09-access-audit.md), [ADR-007](../adr/ADR-007-assignment-security.md) | 9 | Designed |
| 2 | E2E catalogue and traceability | [Quality strategy](../quality/10-quality-strategy.md), [E2E catalogue](../quality/10-e2e-catalog.md), [traceability matrix](../quality/10-traceability.md) | 10 | Designed, not executed |
| 3 | SLI/SLO, error budget and telemetry | [SRE specification](../sre/11-sre-specification.md), [dashboard sketch](../diagrams/11-sre-dashboard.svg), [C2 resilience view](../diagrams/11-c2-resilience.svg) | 11 | Designed, not measured |
| 4 | DR plan and runbook | [DR plan](../sre/11-dr-plan.md), [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md), [RB-05](12-runbooks.md), [incident management](12-incident-management.md) | 11–12 | Designed, not exercised |
| + | GameDay scenarios | [GameDay matrix](12-incident-management.md), [runbook coverage](12-runbooks.md) | 12 | Planned |

The package is coherent only if a reader can move from a threat to a test, from a test to an SLO, and from an SLO to a runbook and a recovery objective. The cross-references in the table above are that path.

## Homework coverage

| Homework item (Lecture 12, slide 36) | Where it is answered | Evidence |
|---|---|---|
| 1 · Severity levels and on-call regulation | [§2, §4, §6](12-incident-management.md) | Severity table, role table, rotation and escalation rules |
| 2 · 3–5 runbooks including GameDay scenarios | [Runbooks](12-runbooks.md); [§8](12-incident-management.md) | RB-01…RB-05, GameDay matrix with pass criteria |
| 3 · Educational incident review | [INC-2026-04](../postmortems/12-incident-review.md) | Sourced timeline, five whys, nine actions, template |
| 4 · Tech-debt register with interest and priorities | [Register](../tech-debt/12-tech-debt-register.md) | TD-01…TD-07, quadrant, priority matrix, business framing |
| 5 · Assembled Practice 3 package | This page, "Practice 3 package" | Parts 1–4 mapped to artefacts and weeks |
| 6 · Handover for review before the board | This page, "Review handoff" | Checklist, reviewer questions, sign-off table |

## Review handoff

The package goes to the neighbouring team before the board review. The reviewer is asked to challenge the design, not to proofread it. The review is time-boxed to one working day; findings are recorded as issues with a severity of their own.

### Reviewer checklist

| # | Check | Pass criterion |
|---|---|---|
| R1 | Severity is defined by user impact | Every SEV level has a RemKontur example and a response time |
| R2 | Roles are separated | The IC has an explicit non-goal and does not debug |
| R3 | Communication has a cadence and a template | A responder can fill the template in under five minutes |
| R4 | On-call promises match the organisation | The unfunded rotation is visible as debt, not hidden in a rota |
| R5 | Every runbook has a trigger, an impact and numeric verification | No step says "check that it works" without a threshold |
| R6 | Every mitigation step states the expected result | The responder can tell whether the step worked |
| R7 | Runbooks are bound to alerts and dated | The alert text links the runbook; the date is present |
| R8 | The post-mortem is blameless and sourced | No individual is named as a cause; every timeline entry has a source |
| R9 | Actions have owner, date and type | At least one action improves detection and one improves prevention |
| R10 | Debt has principal, interest and a decision | Every entry states what happens if it is not repaid |
| R11 | Priorities follow interest and principal | The ranking is explained, not asserted |
| R12 | Cross-references resolve | Every link points to an existing artefact and a real section |

### Questions for the reviewer

1. Which severity example would you rate differently, and what user impact did we miss?
2. Which runbook step would you not trust at 03:00, and what is missing?
3. Is the post-mortem genuinely blameless, or does it still imply a person's mistake?
4. Which debt entry has the wrong interest, and what evidence would correct it?
5. Is the GameDay scenario set strong enough to find the next failure before a user does?
6. What would make the board reject this package, and is that objection answerable?

### Findings and sign-off

| Finding | Severity | Owner | Response | Status |
|---|---|---|---|---|
| To be completed by the reviewer | — | — | — | Open |

| Role | Name | Decision | Date |
|---|---|---|---|
| Author (incident management and runbooks) | Martin | Ready for review | 2026-11-20 |
| Author (post-mortem) | Andrey | Ready for review | 2026-11-20 |
| Author (debt register and SRE) | Amir | Ready for review | 2026-11-20 |
| Reviewer, neighbouring team | — | — | — |
| Business owner | — | — | — |

## Status and evidence

| Area | Designed | Implemented | Verified |
|---|---|---|---|
| Severity levels and lifecycle | Yes | No | No |
| Roles and communication | Yes | No | No |
| On-call rotation | Designed | Not staffed | No |
| Runbooks RB-01…RB-05 | Yes | No | Not exercised |
| Post-mortem and template | Yes, simulated | No | No |
| Debt register | Yes | Partly contained | No |
| GameDay programme | Planned | No | No |
| Practice 3 package | Assembled | — | In review |

The distinction matters for the board: a designed process can be approved as a plan, but it cannot be presented as evidence that the organisation already operates it. The missing items are listed in [§10](12-incident-management.md) and in the [debt register §4](../tech-debt/12-tech-debt-register.md).

## Relation to earlier weeks

The severity table reuses the user journeys from the [E2E catalogue](../quality/10-e2e-catalog.md) and the SLOs from the [SRE specification](../sre/11-sre-specification.md); it does not invent a second definition of impact. The runbooks reuse the dependency timeouts and failure behaviour from the [external environment](../08-external-environment.md), the audit fail-closed rule from [access and audit](../security/09-access-audit.md) and the recovery scenarios from the [DR plan](../sre/11-dr-plan.md). The post-mortem consumes the SLO budget and the retry rule; the debt register records what the review could not fix immediately. No new ADR is introduced in week 12: the decisions it depends on are [ADR-002](../adr/ADR-002-assignment-saga-orchestration.md), [ADR-005](../adr/ADR-005-notification-channel-adapter.md), [ADR-006](../adr/ADR-006-external-boundary-acl.md), [ADR-007](../adr/ADR-007-assignment-security.md) and [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md).
