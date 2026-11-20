# Week 12 · Technical debt register

**Status:** design hypothesis v1.0. The register records known debt in the educational architecture. Principal and interest are estimates `[H]`: no production baseline, incident history or cost rate exists, so the figures are order-of-magnitude proposals for prioritisation, not accounting values. The register is the input to Module 4 (TCO, migration and decommissioning).

**Basis:** Lecture 12, slides 24–29; [FR/NFR register](../04-requirements.md); [SRE specification](../sre/11-sre-specification.md); [DR plan](../sre/11-dr-plan.md); [external environment](../08-external-environment.md); [access and audit](../security/09-access-audit.md); [post-mortem INC-2026-04](../postmortems/12-incident-review.md); [ADR-005](../adr/ADR-005-notification-channel-adapter.md), [ADR-006](../adr/ADR-006-external-boundary-acl.md), [ADR-007](../adr/ADR-007-assignment-security.md) and [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md).

**Evidence labels.** `[D]` — derived from an existing Dossier artefact; `[H]` — design hypothesis introduced here and requiring measurement or approval.

## 1. Definition and metaphor

Technical debt is the consequence of a decision that accelerated delivery now at the cost of changing the system later ([Lecture 12, slide 24]). The metaphor is a loan, and it is useful only if all three parts are recorded:

| Part | Meaning | Register field |
|---|---|---|
| Principal | The work needed to repay the debt | Estimated effort in person-weeks |
| Interest | The recurring cost of living with it | Hours per month, incidents per quarter, money, release delay |
| Default | The point at which changing the system is cheaper than repaying the debt | Risk statement and the Module 4 decision |

Debt is not automatically bad. A deliberate, recorded loan taken to meet a real deadline is a normal engineering decision. The failure mode is **unrecorded** debt: the team pays interest without knowing the principal, and the business hears "we need to rewrite" instead of a number.

The register does not replace the ADRs. An ADR records why a decision was made; the register records what it costs to keep it and when it will be revisited. A temporary ADR without a register row is an incomplete decision.

## 2. Debt quadrant

![Debt quadrant and prioritisation](../diagrams/12-debt-quadrant.svg)

The quadrant separates two questions: was the debt taken deliberately, and was it prudent? ([Lecture 12, slide 25]). The vertical axis is awareness, the horizontal axis is judgement.

| Quadrant | Description | RemKontur example |
|---|---|---|
| Deliberate and prudent | Taken with a known trade-off, a review date and an owner | Reading EAM and HR through an adapter while the contract is unknown; [ADR-006](../adr/ADR-006-external-boundary-acl.md) with a review date |
| Deliberate and reckless | Taken to save time without a plan, an owner or a review date | A shared database for all services "because we are in a hurry", with no exit plan |
| Inadvertent and prudent | Discovered later, and the team now knows how it should have been done | Two retry layers that looked reasonable in isolation ([TD-01](#td-01-split-retry-ownership-between-arm-and-orchestrator)) |
| Inadvertent and reckless | Nobody knew the boundary existed | Dispatch logic spread across three services with no owner |

Only deliberate debt can be managed directly. Inadvertent debt is discovered through incidents, reviews and architecture analysis, which is why the post-mortem and the debt register are connected: an action that is deferred becomes a register row, not a forgotten sentence in a document.

## 3. Seven types of architectural debt

| Type | Sign | RemKontur example | Register entry |
|---|---|---|---|
| Architectural | Boundaries and connections obstruct change | Assignment retry policy is split between the client and the orchestrator | TD-01 |
| Integration | Integrations without a contract or isolation | Workforce contract and change communication are informal | TD-02 |
| Data | Duplicates, no owner, no data quality | Offline conflict model untested at the queue bound | TD-04 |
| Infrastructure | Outdated versions, manual deployment | Not recorded in this register; the deployment pipeline is outside the current Dossier | — |
| Test | No tests on critical paths | The 15 s slow-provider profile is missing from the load test | TD-04 |
| Operational | No observability, runbook or alerting | Telemetry backend not deployed; no funded 24/7 rotation | TD-05, TD-06 |
| Security | Vulnerabilities, secrets in code | Audit retention period not agreed; a five-year proposal is not a policy | TD-07 |

The list is not exhaustive; it is a prompt. A debt that does not fit a type is still debt if it has a principal and an interest.

## 4. Register

Interest is stated in the language of the business: hours per month, incidents per quarter and, where possible, money. All values are estimates `[H]` and must be replaced by measurements after the first quarter of the pilot.

| ID | Debt | Type | Quadrant | Source | Principal | Interest per month | Risk if not repaid | Decision | Owner | Review |
|---|---|---|---|---|---|---|---|---|---|---|
| TD-01 | Split retry ownership between the ARM and the assignment orchestrator | Architectural | Inadvertent, prudent | [INC-2026-04](../postmortems/12-incident-review.md); [SRE §6.4](../sre/11-sre-specification.md) | 2 person-weeks | 2 incidents per quarter; 6 h manual reconciliation; release delay on P3 | The next slow-provider event can exhaust SLO-03 and create duplicate reservations | Repay by 2026-11-11 (A-01, A-02) | Andrey | 2026-11-25 |
| TD-02 | Workforce contract and change communication are informal | Integration | Deliberate, prudent | [08 §2](../08-external-environment.md); [ADR-006](../adr/ADR-006-external-boundary-acl.md) | 3 person-weeks | 4 h coordination; 1 incident per quarter | An unannounced Workforce change breaks assignment again | Contain now with a change-notification rule (A-08); formalise in Q1 2027 | Amir | 2027-01-31 |
| TD-03 | Notification provider not selected; no delivery guarantee | Integration | Deliberate, prudent | OQ-12; [ADR-005](../adr/ADR-005-notification-channel-adapter.md) | 4 person-weeks | 4 h manual delivery checks; 1 incident per quarter; lock-in risk | A provider outage or price change leaves no secondary channel | Contain with the adapter and the secondary-channel flag; select in Q1 2027 | Amir | 2027-02-28 |
| TD-04 | Offline conflict model untested at the 4 h / 500-operation bound | Data and test | Deliberate, prudent | [NFR-02](../04-requirements.md); [TS-01](../04-technical-spike.md); [SRE §7 M3](../sre/11-sre-specification.md) | 2 person-weeks | Unknown; up to 2 h support per month | A long site outage produces duplicates or a blocked queue, failing NFR-02 in the scenario it was written for | Repay before the pilot (2026-12-15) | Martin | 2026-12-15 |
| TD-05 | No funded 24/7 on-call; business-hours detection | Operational | Deliberate, prudent with an expiry | [DR plan §7](../sre/11-dr-plan.md); [SRE §3.4](../sre/11-sre-specification.md) | 6 person-weeks plus recurring cost | 2 incidents per quarter with longer MTTR; night coverage gap | A night SEV-1 runs until business hours; the 99.5% target is not credible | Accept for the pilot with an expiry; fund before any SLA is signed | Amir with the business owner | 2027-01-31 |
| TD-06 | Telemetry backend not selected or deployed | Operational | Deliberate, prudent | [SRE §4.7](../sre/11-sre-specification.md); Q4 | 3 person-weeks | 4 h blind diagnosis; slower detection; no SLO evidence | SLOs cannot be measured and incidents are diagnosed by guesswork | Repay in Q1 2027 before the pilot exit | Amir | 2027-01-31 |
| TD-07 | Audit retention period not agreed; five years is a proposal | Data and security | Deliberate, prudent | [09 §3](../security/09-access-audit.md); [SRE §3.3](../sre/11-sre-specification.md); Q4 | 1 person-week plus storage cost | Compliance risk; storage cost uncertainty | Under-retention destroys evidence; over-retention creates cost and privacy exposure | Accept with a review date; agree with ИБ and legal by Q1 2027 | ИБ | 2027-03-31 |

### TD-01 · Split retry ownership between ARM and orchestrator

The ARM retry was added for offline usability, and the orchestrator retry was added for resilience. Each looked correct in its own context. Together they produced up to six calls for one user command and violated the one-retry-owner rule. The interest is not the two retries themselves; it is the incident they amplify and the manual reconciliation that follows. Repayment is small and mechanical, which is why the item is first: remove the client retry, aggregate the circuit breaker across instances, and add the 15 s profile to the load test.

### TD-02 · Workforce contract and change communication are informal

Workforce is a neighbouring team with a contract (`workforce-v1`) but no ACL, because the contract is owned and versioned ([08 §2](../08-external-environment.md)). The debt is not the absence of an ACL; it is the absence of a change-notification and canary agreement. The interest is paid whenever the provider changes behaviour without the consuming team knowing. The containment is a process rule; the repayment is a formal service agreement with a change calendar and a canary.

### TD-03 · Notification provider not selected

[ADR-005](../adr/ADR-005-notification-channel-adapter.md) deliberately isolates the provider behind an adapter and defines an exit plan. That is prudent debt: the lock-in is bounded, and the adapter can be repointed. The remaining principal is the selection and contracting work; the interest is manual delivery checking and the absence of a guaranteed secondary channel. The decision is to contain, not to select immediately, because the core journey does not depend on notification delivery.

### TD-04 · Offline conflict model untested at the bound

NFR-02 defines a four-hour or 500-operation queue and a 60-second synchronisation target. The mechanism was tested on a minimal stand with a short disconnection; the bound, the conflict cases and the reconnect storm were not. The debt is both data-related (conflict resolution) and test-related (the scenario is missing from the suite). The interest is uncertain, which is itself a reason to repay before the pilot: an unknown interest on a core journey is worse than a known one.

### TD-05 · No funded 24/7 on-call

The team has three engineers and no funded rotation. The 99.5% SLO assumes detection and response outside business hours; the current organisation cannot provide it. The item is recorded as prudent with an expiry because the limitation is visible and has a review date. It becomes reckless if an SLA is signed before the rotation is funded. The repayment is mostly organisational: staffing, compensation and an escalation agreement, not code.

### TD-06 · Telemetry backend not selected

The SRE specification defines metrics, logs, traces and retention, but the backend is not selected and nothing is deployed. The interest is paid in every incident: diagnosis depends on database and broker metrics plus guesswork. The principal is moderate because the instrumentation contract is already designed; the remaining work is deployment, retention and access.

### TD-07 · Audit retention not agreed

The audit trail is legally significant and has no error budget. The retention period, however, is a proposal, not an agreed policy. Under-retention is an evidence risk; over-retention is a cost and privacy risk. The item is small in effort but high in consequence, which is why it has a named ИБ owner and a fixed review date rather than an open-ended "to be discussed".

## 5. Prioritisation

The priority is a function of interest and principal, not of how annoying the debt feels ([Lecture 12, slide 28]).

| | Low principal | High principal |
|---|---|---|
| **High interest** | **Repay now.** TD-01 (2 weeks, incident amplifier), TD-04 (2 weeks, core journey risk) | **Plan in parts.** TD-05 (staffing), TD-02 (contract), TD-06 (deployment) |
| **Low interest** | **Boy-scout rule.** TD-07 (legal review, do it while touching the area) | **Accept and record.** TD-03 (contain with the adapter and revisit) |

Decision rules:

1. **High interest and low principal** — repay immediately; the loan is small and the interest is real.
2. **High interest and high principal** — split the repayment into reversible parts (Strangler Fig) and fund a slice in every cycle; do not wait for a big-bang rewrite.
3. **Low interest and low principal** — repay while working in the area; do not create a project for it.
4. **Low interest and high principal** — accept explicitly, with an owner, a review date and a containment; an accepted debt is still recorded.

The ranking is reviewed monthly. A debt that has been "accepted" for more than two review cycles without a change in interest is either mispriced or invisible; both are reasons to re-open it.

## 6. The business conversation

" We need to rewrite the system" does not sell. " We lose 40 hours and two incidents a month; repayment takes three weeks" does ([Lecture 12, slide 29]). The register is written to make the second sentence possible.

| Argument | What to show | Example for TD-01 |
|---|---|---|
| Money | Hours, incidents and release delay converted to a cost | 6 h/month reconciliation and 2 incidents/quarter; 2 person-weeks to repay |
| SLO | Budget burn caused by the debt | The incident consumed 78% of the SLO-03 monthly budget |
| Goals | Which business capability is blocked | A new dispatch area cannot be onboarded while assignment is unreliable |
| Cycle | A standing share of capacity, often 15–20% | Two person-days per two-week cycle until the high-interest items are closed |

The conversation is not a request for permission to do engineering. It is a choice between paying a known interest and accepting a known risk. The business owner decides; the register records the decision and the review date.

## 7. Governance

| Rule | Detail |
|---|---|
| One register | The register in this file is the single list; a debt mentioned only in a chat does not exist |
| Entry trigger | A temporary ADR, a deferred post-mortem action, a known limitation in a design review or a discovered workaround |
| Mandatory fields | Type, quadrant, source, principal, interest, risk, decision, owner, review date |
| Review cadence | Monthly architecture review; quarterly business review of high-interest items |
| Capacity | 15–20% of each delivery cycle is reserved for debt repayment `[H]` |
| Expiry | An accepted debt without a review date is escalated to the architecture group |
| Closure | Repayment is closed with evidence (merged change, test, contract, staffing decision), not with a status update |
| Module 4 link | The register is the input to TCO, migration sequencing and decommissioning decisions |

The register is not a punishment list. A team that records debt is behaving more responsibly than a team that hides it, and the review should reward the record even when the debt itself is uncomfortable.

## 8. Register template

| Field | Content |
|---|---|
| ID | TD-nn, stable and never reused |
| Debt | One sentence in business language |
| Type | Architectural, integration, data, infrastructure, test, operational or security |
| Quadrant | Deliberate or inadvertent; prudent or reckless |
| Source | ADR, incident, review, requirement or discovery |
| Principal | Person-weeks, with the assumption stated |
| Interest | Hours per month, incidents per quarter, money, release delay |
| Risk if not repaid | The concrete failure or cost, not "it is bad" |
| Decision | Repay, contain, accept; with a date |
| Owner | One named person or team |
| Review | A date, not "later" |

## 9. Open questions

| ID | Question | Impact |
|---|---|---|
| Q1 | What is the internal cost of one engineering hour and one incident? | Converts interest into money for the business case |
| Q2 | Will the business fund 15–20% of capacity for debt repayment? | The entire governance model depends on it |
| Q3 | Which debts are acceptable to carry into Module 4? | Migration and TCO scope |
| Q4 | Who signs an "accepted" debt, and for how long? | Prevents silent accumulation |
| Q5 | What is the legal retention period for audit records? | TD-07 and the storage cost model |
