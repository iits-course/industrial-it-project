# ADR-009. Disaster recovery strategy: pilot light with continuous data replication

- **Status:** working hypothesis for the educational architecture, week 11
- **Links:** [DR plan](../sre/11-dr-plan.md), [SRE specification](../sre/11-sre-specification.md), NFR-01/02/03/04, [ADR-001](0001-architectural-style.md), [ADR-002](0002-database.md), [ADR-004](ADR-004-message-broker-rabbitmq.md), [ADR-007](ADR-007-assignment-security.md)
- **Supersedes:** none

## Context

The core request service must survive the loss of a region with an RTO of 60 minutes and an RPO of 5 minutes; the audit trail must not lose a confirmed record, so its RPO is 0. The request database is the system of record and the outbox is the source of truth for asynchronous propagation. The architecture is a modular monolith with a single writer for the request aggregate, and the team is small. The Dossier contains no measured cost of downtime, and a second region is technically available but not funded.

The decision must therefore balance four forces: a credible recovery objective, the single-writer invariant, the legal weight of the audit trail, and a cost that can be defended before the business has priced an hour of downtime. A strategy that meets the target only on paper, or that requires an operational maturity the team does not have, is not acceptable.

## Alternatives

| Alternative | RTO | RPO | Cost | Complexity | Main risk |
|---|---|---|---|---|---|
| Backup and restore only | Hours to a day | Up to the last backup | Low | Low | Fails the 5-minute RPO for accepted requests; the offline queue becomes the only copy of recent work |
| Pilot light with a warm data tier | About 60 min | 5 min | Medium | Medium | Application scale-up and DNS switch dominate the RTO; the replica lag must be monitored |
| Warm standby | Minutes | Seconds to minutes | High | High | Roughly doubles the always-on cost for a benefit the business has not priced |
| Active-active across regions | Near zero | Near zero | Very high | Very high | Conflicts with the single-writer aggregate; requires conflict resolution and a mature multi-region operation |

## Decision

Adopt a **pilot light with a warm data tier**.

The second region continuously receives PostgreSQL WAL and hosts a read replica. The audit store has a synchronous immutable copy in the second region. Backups and WAL archives are replicated to object storage with versioning, encryption and object lock. Application images, infrastructure as code, broker definitions, configuration and secrets are replicated. The application tier is not running at full capacity; on a declared disaster it is scaled from the pilot-light baseline, the replica is promoted, and DNS is switched with a 60-second TTL.

The recovery procedure, validation gates and exercise programme are defined in the [DR plan](../sre/11-dr-plan.md). The strategy is accepted only together with those procedures: a replica without a tested promotion is not a recovery capability. Adoption is conditional on funding the second region; without it, the 60-minute RTO is not achievable and must be re-baselined with the business owner rather than asserted in a plan.

## Consequences

**Positive.** The strategy meets the provisional 60-minute RTO and 5-minute RPO without paying for a permanently running second region. It preserves the single-writer invariant and the audit RPO of 0. It is testable with a quarterly restore and a semi-annual full exercise. The failure modes are explicit: replica lag, application scale-up, DNS propagation, secret availability and the restore time of the request database.

**Negative.** The RTO is about an hour, not minutes. The application tier is cold and must be scaled, which introduces configuration drift and image-availability risk. A regional failover requires a human declaration and a trained team; there is no 24/7 on-call rotation. The second region costs money even when idle. The audit copy and the operational replica are different mechanisms and must be operated separately.

**Risks.** A cross-region replica can lag beyond the RPO under load; the plan alerts at 60 seconds and declares an RPO breach above five minutes. A logical corruption is replicated; only point-in-time recovery and immutable backups address it. A ransomware event can affect the primary and the replica; the immutable audit copy and the isolated backup account are the defence. The current key-person concentration in database recovery is an organisational risk, not a technology risk, and is mitigated by two trained deputies and role rotation in exercises.

## Verification

The decision is accepted when all of the following evidence exists:

1. A quarterly restore of the request database and the audit copy to an isolated environment meets the component RTO and preserves the audit chain.
2. A semi-annual full DR exercise declares a disaster, promotes the cross-region replica, scales the pilot light, switches DNS and passes the functional and reconciliation gates within 60 minutes.
3. The measured RPO is at most five minutes for the request database and zero for confirmed audit records.
4. The recovery produces no duplicate request, no duplicate active assignment and no unexplained missing fact after reconciliation.
5. The exercise report records actual RTO/RPO, failed steps and actions with owners and due dates.

If the measured cost of downtime or a contractual SLA requires an RTO below 30 minutes, this decision is revisited in favour of a warm standby. If the single-writer constraint is removed by a future domain decision, active-active may be re-evaluated. Until then, the pilot light is the narrowest strategy that satisfies the stated objectives at a defensible cost.
