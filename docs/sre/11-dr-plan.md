# Week 11 · Disaster recovery plan: RemKontur

**Status:** design hypothesis v1.0. The plan has not been executed. RTO and RPO values are provisional because the Dossier contains no measured cost of downtime and no production baseline. The decision that selects the strategy is recorded in [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md); the reliability objectives that the plan protects are in the [SRE specification](11-sre-specification.md).

**Basis:** Lecture 11, slides 29–32 and 34–37; [SRE specification](11-sre-specification.md); [integration architecture](../07-integration-architecture.md); [data architecture](../06-data-architecture.md); [external environment](../08-external-environment.md); [access and audit](../security/09-access-audit.md); [ADR-001](../adr/0001-architectural-style.md), [ADR-002](../adr/0002-database.md), [ADR-004](../adr/ADR-004-message-broker-rabbitmq.md), [ADR-007](../adr/ADR-007-assignment-security.md) and [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md).

## 1. Purpose and scope

This plan defines how RemKontur restores its service and its data after a failure that exceeds high availability: the loss of an availability zone or a region, logical data corruption, ransomware, loss of the broker, or loss of the audit store. It specifies recovery objectives by component, the selected strategy, the decision authority, the recovery procedure, the validation gates and the exercise programme.

High availability and disaster recovery are different protections. High availability absorbs frequent small failures without a service interruption: several application instances, a load balancer, a synchronous database standby, quorum queues. Disaster recovery restores the service after a rare large failure: a backup and a second site, a documented procedure, and a tested ability to lose the primary. A replica repeats an erroneous deletion in milliseconds; only a backup and an independent copy protect against a logical catastrophe.

Out of scope: the internal DR of EAM, HR, the corporate IdP, Workforce and the notification provider; a full incident-management runbook and blameless post-mortem, which belong to Topic 3.4; and the recovery of the physical maintenance process, which is outside the information system.

## 2. Planning assumptions and business drivers

| Assumption | Consequence for this plan |
|---|---|
| The Dossier has no measured cost of downtime ([02 §10](../02-capability-value-stream.md)). | RTO and RPO are engineering proposals, not business-approved objectives. The first pilot must measure the cost of idle maintenance crews and delayed production. |
| The system is a modular monolith with a single writer for the request aggregate ([ADR-001](../adr/0001-architectural-style.md)). | Active-active across regions would require conflict resolution that the domain does not have; the plan favours a single write region with a standby. |
| PostgreSQL is the system of record for requests, history, idempotency, the audit buffer and the outbox ([ADR-002](../adr/0002-database.md)). | Loss of PostgreSQL is loss of the business fact; its RPO dominates the system RPO. |
| The audit store is append-only and legally significant ([09 §3](../security/09-access-audit.md)). | Audit has a stricter objective than the operational database: RPO 0 for confirmed records. |
| RabbitMQ is replaceable transport; events can be replayed from the outbox ([ADR-004](../adr/ADR-004-message-broker-rabbitmq.md)). | Broker recovery does not require message backup as the primary mechanism; outbox replay is the source of truth. |
| The ARM can work offline for four hours and synchronise within 60 seconds ([NFR-02](../04-requirements.md)). | A short core outage does not have to become a lost report; the DR plan must preserve the queued operations and reconcile them once. |
| There is no 24/7 on-call organisation yet. | Detection and declaration may be slower than the technical recovery; this is a documented gap, not an assumed capability. |
| A second region is technically available but not funded in the current design. | The plan selects the cheapest strategy that can meet the provisional objectives and states the cost dependency. |

The business drivers are: continuity of request registration and assignment, preservation of the maintenance history, integrity of the audit trail, and a credible recovery statement for the process owner. A recovery that restores the servers but loses the last five minutes of accepted requests does not satisfy the second driver.

## 3. Recovery objectives

### 3.1 Definitions

**RTO (Recovery Time Objective)** is the maximum acceptable time from the first failed user transaction to the restoration of the agreed service level. It is measured from the outage, not from the moment an engineer notices it.

**RPO (Recovery Point Objective)** is the maximum acceptable amount of data, measured in time, that may be lost. It defines the last recoverable point, not the age of the most recent backup.

Both objectives are set per component because a single system-wide number hides the difference between the request database, the audit trail and the analytics warehouse. The overall service objective is bounded by the strictest critical component.

### 3.2 Overall targets

| Scope | RTO | RPO | Rationale |
|---|---|---|---|
| Core request service (registration, read, assignment, completion) | 60 min | 5 min | A one-hour interruption is survivable with the offline ARM and manual dispatch; losing more than five minutes of accepted requests would require reconciliation that the process cannot perform reliably. |
| Audit trail | 4 h | 0 | Confirmed audit records must not be lost; a slower restoration is acceptable, but a gap is not. |
| Analytics and reporting | 24 h | 24 h | The warehouse is not on the critical path and can be rebuilt from events and a backup. |
| Notification delivery | 4 h | 1 h | Notifications are recoverable from the event stream; a delay does not invalidate the assignment. |

The core RTO of 60 minutes is provisional. It is consistent with a pilot-light strategy and a small operations team; it is not consistent with a promise of continuous availability. If the business requires 15 minutes, the strategy must move to a warm standby and the cost must be approved.

The 60-minute core target is an infrastructure-loss objective (DR-01, DR-02 and DR-05). A logical corruption (DR-03) has a four-hour objective and a destructive compromise (DR-04) has an eight-hour objective, because containment, point-in-time recovery and validation dominate the timeline; during DR-03 the service may be read-only. These exceptions are stated rather than hidden, and the business owner accepts them when the incident is declared.

### 3.3 Component objectives

| Component | Data class | RTO | RPO | Strategy | Dependency |
|---|---|---|---|---|---|
| PostgreSQL OLTP: requests, history, idempotency, outbox, MDM projection | Transactional, system of record | 60 min region loss; 5 min zone loss | 5 min region loss; 0 within a zone | Synchronous standby in a second zone; asynchronous cross-region replica; continuous WAL archiving and point-in-time recovery | Object storage for WAL and backups; DNS |
| Audit store | Immutable, legal evidence | 4 h | 0 | Append-only store with a synchronous copy to a second region; object lock and separate credentials | Audit writer; key management |
| Audit buffer in PostgreSQL | Transactional | Same as OLTP | Same as OLTP | Written in the same transaction as the business change | OLTP |
| RabbitMQ | Transport, reconstructable | 30 min | 0 relative to the surviving outbox | Quorum queues across three zones; definitions as code; outbox replay after recovery | OLTP outbox; DNS |
| Outbox Relay and consumers | Stateless workers | 30 min | 0 | Redeploy from the image registry; replay from the outbox; idempotent inbox | Image registry; configuration |
| Notification delivery log | Operational history | 4 h | 1 h | Backup and replay from the event stream | Object storage |
| Analytics warehouse and marts | Derived | 24 h | 24 h | Daily backup plus rebuild from retained events; no transactional recovery | Event retention; object storage |
| Master-data projection | Derived from EAM/HR | 4 h | 24 h | Rebuild from the source systems; stale projection is acceptable with a freshness marker | EAM/HR availability |
| Configuration, images and secrets | Platform | 60 min | 0 | Infrastructure as code, replicated image registry, secret-store replication | Source control; secret store |
| ARM local queue | Client-side | 0 | 0 | IndexedDB on the device; four-hour autonomy; synchronise once after recovery | Device; API |

The table is deliberately heterogeneous. A single "system RTO" would hide the fact that the audit store can take four hours while the request database must return within one, and that the warehouse can be rebuilt tomorrow.

## 4. High availability and failure domains

### 4.1 High-availability design

| Failure | Automatic response | Expected interruption | Data loss |
|---|---|---|---|
| Application process crash | Load balancer removes the instance; another instance serves the request | Seconds | None |
| Loss of one application instance or one zone | Remaining instances in the second zone continue; the load balancer reroutes | Seconds to one minute | None |
| Loss of the primary database node | Synchronous standby is promoted; the application reconnects through the same endpoint | 1–5 min | None for committed transactions |
| Loss of one RabbitMQ node | Quorum queue elects a new leader; publishers retry with the same event ID | Seconds to one minute | None for confirmed messages |
| Loss of one worker | Another consumer instance continues; unacknowledged messages are redelivered | Seconds | None; consumers are idempotent |
| Loss of the notification provider | Adapter circuit opens; notifications queue | No core interruption | Notifications delayed |

High availability is tested monthly by a zone failover in staging. It is not a substitute for DR: a synchronous standby in the same region does not survive a regional disaster, and it faithfully reproduces a logical deletion.

### 4.2 Failure domains

| Domain | What fails together | Protection |
|---|---|---|
| Process | One application or worker instance | Multiple instances; health checks; restart policy |
| Availability zone | Application instances, database node, broker node in that zone | Second zone; synchronous database standby; quorum queues |
| Region | The whole primary site, including DNS targets and object-storage endpoint | Pilot light in the second region; cross-region replica; replicated backups |
| Data | A table, a schema or a set of records | Point-in-time recovery; immutable backups; audit reconciliation |
| Identity | Corporate SSO | Cached JWKS until TTL; existing sessions until expiry; fail closed for new privileged sessions |
| External service | Workforce, EAM, HR, provider | Degradation and queueing; no DR obligation on our side |
| People | The only engineer who knows the procedure | Documented runbook; two trained deputies; exercise rotation |

### 4.3 Single points of failure

The following remain single points of failure and are accepted or mitigated explicitly: one primary write region; one corporate IdP; one Workforce service; one notification provider; one team without 24/7 coverage; and one person who currently holds most of the database recovery knowledge. The first four are architectural or contractual; the last two are organisational and must be addressed before an SLA is signed.

## 5. Selected strategy

### 5.1 Alternatives

| Strategy | RTO | RPO | Cost | Complexity | Fit for RemKontur |
|---|---|---|---|---|---|
| Backup and restore | Hours to a day | Up to the last backup | Low | Low | Fails the 5-minute RPO for the request database; acceptable only for the warehouse. |
| Pilot light | Hours, or about one hour with a warm data tier | Minutes with a continuous replica | Medium | Medium | Meets the provisional 60-minute RTO and 5-minute RPO at a cost the project can defend. |
| Warm standby | Minutes | Seconds to minutes | High | High | Better than required for a system with an offline ARM and no measured downtime cost. |
| Active-active | Near zero | Near zero | Very high | Very high | Conflicts with the single-writer aggregate and would require conflict resolution the domain does not have. |

### 5.2 Decision

Adopt a **pilot light with a warm data tier**:

- The second region continuously receives PostgreSQL WAL and hosts a read replica; the replica is promoted only on a declared disaster.
- The audit store has a synchronous immutable copy in the second region; the copy is the recovery source of record.
- Backups and WAL archives are replicated to object storage with versioning and object lock.
- Application images, infrastructure as code, broker definitions and configuration are replicated; the application tier is not running at full capacity.
- The secret store replicates the required secrets; break-glass credentials are held separately.
- DNS records have a short TTL (60 s) so that a regional switch is not delayed by caching.
- On declaration, the application, relay, workers, adapters and broker nodes are scaled up from the pilot-light baseline; the database replica is promoted.

This strategy meets the provisional objectives without paying for a permanently running second region. It is also honest about its limit: the application tier takes tens of minutes to scale, so the RTO is about an hour, not minutes. Adoption is conditional on funding the second region; if it is not funded, the 60-minute RTO is not achievable and must be re-baselined with the business owner rather than asserted in a plan.

### 5.3 Why not the alternatives

Backup and restore alone cannot meet a five-minute RPO for accepted requests and would make the offline queue the only copy of recent work. Warm standby would meet the target with more margin but roughly doubles the always-on cost for a benefit the business has not yet priced. Active-active is technically incompatible with the current single-writer model and would introduce a distributed consistency problem that the team is not organised to operate. The decision is revisited if the measured cost of downtime or a contractual SLA requires a shorter RTO.

### 5.4 Backup policy

| Data | Method | Frequency | Retention | Copy and protection |
|---|---|---|---|---|
| PostgreSQL | Continuous WAL archiving plus daily full backup | Continuous; daily full | 35 days operational; monthly full for 12 months | Cross-region object storage, versioning, encryption, checksum |
| Audit store | Append-only stream plus immutable snapshot | Continuous; daily snapshot | Per legal schedule; five years is a proposal | Synchronous second-region copy; object lock; separate credentials |
| RabbitMQ | Definitions and policies as code; messages reconstructable from the outbox | On change | Version-controlled | Image and configuration registry |
| Warehouse | Daily logical backup plus event replay | Daily | 30 days | Cross-region object storage |
| Configuration and secrets | Infrastructure as code; secret-store replication | On change | Version-controlled | Break-glass access, rotation log |

Backups are encrypted at rest and in transit. The encryption keys are managed separately from the backup account, and a restore requires a break-glass procedure with two approvers. A backup that cannot be restored is not a backup; §9 defines the verification programme.

## 6. Disaster scenarios

| ID | Scenario | Detection | Impact | Response | RTO | RPO | Decision authority |
|---|---|---|---|---|---|---|---|
| DR-01 | Loss of one availability zone | Zone health checks; database and broker alerts | Brief interruption; automatic failover | No declaration; observe failover and validate | 5 min | 0 | On-call |
| DR-02 | Loss of the primary region | Multiple independent alerts; region endpoint unavailable | Core unavailable; ARM queues creation | Declare disaster; promote replica; scale pilot light | 60 min | 5 min | Incident commander with business owner |
| DR-03 | Logical corruption or accidental deletion | Audit anomaly, reconciliation mismatch, user report | Data incorrect or missing; writes may still succeed | Stop writes; identify last good point; PITR to an isolated instance; validate; switch | 4 h | 5 min to the last good transaction | Incident commander with data owner |
| DR-04 | Ransomware or destructive compromise | Security alert; file or database encryption; audit gap | Core and backups potentially affected | Isolate; revoke credentials; restore from immutable copy; audit review | 8 h | 1 h operational; 0 audit | ИБ with incident commander |
| DR-05 | Loss of the broker | Broker alerts; outbox age rising | Analytics and notifications delayed; core continues | Rebuild quorum from definitions; replay outbox; deduplicate | 30 min | 0 relative to the outbox | On-call |
| DR-06 | Loss of the audit store | Audit writer errors; copy lag alert | Privileged writes fail closed; audit evidence at risk | Restore the immutable copy; verify the chain; reopen privileged writes | 4 h | 0 | ИБ |
| DR-07 | Corporate IdP outage | Authentication failures; JWKS unavailable | New logins fail; existing sessions continue until expiry | Use cached keys; fail closed for new privileged sessions; no DR action on our side | Per IdP | Per IdP | ИБ |
| DR-08 | Workforce or provider outage | Circuit open; saga or delivery failures | Assignment or notifications degraded | Apply the degradation table; no DR declaration | Per dependency | Per dependency | Journey owner |

DR-04 is the only scenario in which the operational RPO is one hour: a destructive compromise requires rolling back to a clean immutable snapshot, so the five-minute component RPO does not apply to data that may already be corrupted. The audit trail remains at RPO 0 through its immutable copy. DR-02 and DR-03 use the five-minute component RPO; if the cross-region replica lag exceeds five minutes, the incident commander declares an RPO breach and the business owner decides whether to accept the loss or wait for a backup restore.

### 6.1 Playbook DR-02: loss of the primary region

The time boxes are targets for a trained team, not a promise. The RTO clock starts at the first failed user transaction; detection and declaration are part of the budget.

| Phase | Time box | Actions | Exit criterion |
|---|---|---|---|
| Detect | 0–5 min | Confirm that the failure is regional, not a single service; check the status of the database, broker, object storage and DNS; start the incident log | At least two independent signals confirm the region loss |
| Declare | 5–10 min | Incident commander declares DR; notify the business owner, ИБ and communications; freeze deployments; assign roles | Declaration recorded with time and scope |
| Verify replica | 10–15 min | Read the cross-region replica lag; confirm the last applied LSN; verify backup availability; confirm DNS TTL | Replica lag ≤ 5 min; otherwise declare an RPO breach |
| Promote data | 15–25 min | Promote the replica; open it for writes; validate schema version, extensions and roles; verify audit copy availability | Database accepts writes; integrity checks pass |
| Restore platform | 25–40 min | Scale the application, relay, workers and adapters; restore configuration and secrets; declare broker queues; switch DNS | Health checks pass; internal calls succeed |
| Validate | 40–55 min | Smoke create, read, assign, complete and close; verify correlation trace, outbox publication, notification and audit write; run reconciliation counts | All gates in §8 pass |
| Announce | 55–60 min | Announce recovery with the known limitations; keep analytics and non-critical reports disabled; monitor burn rate | Business owner accepts the restored service |
| Stabilise | First 24 h | Drain the outbox; reconcile queued ARM operations; monitor duplicates, lag and audit; plan failback | No unexplained duplicate or missing fact |

If the replica lag exceeds five minutes, the incident is still recoverable, but the RPO is breached and the business owner must decide whether to accept the loss or wait for a backup restore. The decision and the actual lost interval are recorded.

### 6.2 Playbook DR-03: logical corruption or accidental deletion

1. **Contain (0–15 min).** Stop writes to the affected domain, preserve the current state for forensics, and identify the scope from the audit trail and reconciliation queries. Do not restore over the live database.
2. **Locate the last good point (15–30 min).** Use the audit record, WAL timeline and business reconciliation to identify the last transaction before the corruption. The target is a transaction boundary, not an arbitrary timestamp.
3. **Restore in isolation (30–120 min).** Provision an isolated PostgreSQL instance and perform point-in-time recovery to the target. Validate row counts, referential integrity, the audit chain and the absence of duplicate active assignments.
4. **Reconcile (120–180 min).** Compare the restored state with the outbox, the audit trail and the ARM queue. Replay events that were committed after the target only if they are known to be valid; never replay a corrupting transaction.
5. **Switch and verify (180–240 min).** Switch traffic to the restored instance, reopen writes, run the §8 gates and record the actual RPO. A second review confirms that the corrupting cause has been removed.

### 6.3 Playbook DR-04: ransomware or destructive compromise

The security response takes precedence over the availability response. Isolate the affected accounts and hosts, revoke sessions and tokens, and preserve evidence before restoring. Restore from an immutable copy that predates the compromise, verify the audit chain, and rotate every secret that could have been exposed. The business owner accepts the operational data loss; ИБ accepts the audit evidence only after the chain is verified. A restoration without a root-cause fix is a temporary recovery, not a resolution.

## 7. Roles and command

| Role | Responsibility | Named assignment |
|---|---|---|
| Incident commander | Declares DR, owns the timeline, makes the final operational decision | Rotating: Martin, Amir, Andrey |
| DR lead | Executes the technical recovery, coordinates database, platform and network steps | Amir |
| Data recovery lead | Owns replica promotion, PITR, reconciliation and data-integrity gates | Martin |
| Security lead | Owns containment, credential rotation, audit verification and the compromise decision | ИБ |
| Business owner | Accepts data loss, approves the restored service and communicates with the process owner | Process owner, to be named |
| Communications | Maintains the status message and the stakeholder updates | Product or operations representative |
| Scribe | Records times, decisions, actual RTO/RPO and evidence | Any team member, rotating |

Decision rules: the incident commander declares DR after two independent signals; the business owner accepts any RPO breach; ИБ owns the decision to restore after a compromise; no single person may both execute a restore and approve its integrity. The current team has no 24/7 rotation, so the plan assumes business-hours detection unless an on-call rotation is funded.

## 8. Validation gates

Recovery is not complete when the database opens. The following gates are executed in order, and a failed gate stops the announcement.

| Gate | Checks | Evidence |
|---|---|---|
| G1 Data integrity | Database opens; schema version matches; row counts and checksums; referential integrity; audit chain unbroken; no duplicate active assignment | Integrity report with the last applied LSN |
| G2 Functional smoke | Create, read, assign, complete and close; correlation ID across the chain; outbox publication; notification; audit write | Smoke report with trace IDs |
| G3 Reconciliation | Request, history, audit and event counts agree; outbox drained; consumer lag ≤ 15 min; no duplicate effects | Reconciliation query output |
| G4 Security | Access checks pass; privileged writes are audited; secrets rotated if compromise is suspected; audit read access logged | Security sign-off |
| G5 Business acceptance | The process owner confirms that dispatch can work and that the known limitations are acceptable | Written acceptance in the incident log |

A recovery that passes G1–G4 but fails G5 is technically complete and operationally incomplete. The distinction matters because the business owner may prefer a read-only service to a fast but unverified write path.

## 9. Testing and maintenance

| Exercise | Frequency | Scope | Success criterion | Evidence |
|---|---|---|---|---|
| Backup verification | Weekly | Restore a sample and verify checksums and schema | Restore succeeds; no corruption | Automated report |
| Zone failover | Monthly | Database and application failover in staging | RTO ≤ 5 min; RPO 0 | Failover report |
| Full restore | Quarterly | Restore the request database and audit copy to an isolated environment | RTO ≤ 4 h; audit chain intact; reconciliation passes | Restore report |
| Full DR exercise | Every six months | Declare DR, promote the cross-region replica, scale the pilot light, switch DNS, run business validation | RTO ≤ 60 min; RPO ≤ 5 min; audit RPO 0; no duplicate requests | DR report with actual times |
| GameDay | Annually | Region loss, broker loss, corrupted backup, token compromise | The plan survives a combined scenario; gaps are recorded | GameDay report |
| Runbook review | Quarterly | Roles, contacts, commands, dependencies | Every step has an owner and a current command | Review record |

The exercises are not optional demonstrations. Each one records the actual RTO and RPO, the failed steps, the missing permissions and the actions with an owner and a due date. A target that is never measured is a wish. The following indicators are reported to the reliability review: `dr_actual_rto_minutes`, `dr_actual_rpo_minutes`, `dr_restore_success_ratio`, `dr_last_test_age_days`, `backup_age_hours`, `replica_lag_seconds` and `audit_copy_lag_seconds`.

The plan is maintained when the architecture changes: a new external dependency, a new data store, a change in the single-writer model or a new regulatory requirement triggers a review. The DR plan and [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md) are versioned together.

## 10. Risks, gaps and open questions

| ID | Risk or gap | Impact | Mitigation | Owner |
|---|---|---|---|---|
| DR-R1 | No measured cost of downtime | RTO/RPO may be over- or under-engineered | Measure in the pilot; revisit the strategy | Business owner |
| DR-R2 | Second region not funded | The 60-minute RTO cannot be met | Approve the pilot-light cost or accept a longer RTO | Product |
| DR-R3 | No 24/7 on-call | Detection and declaration extend the outage | Fund a rotation or accept business-hours recovery | Operations |
| DR-R4 | Cross-region replica lag unknown under load | RPO may exceed 5 min | Measure lag under the pilot load; alert at 60 s | Martin |
| DR-R5 | Audit retention not agreed | Storage and legal exposure | ИБ and legal decision | ИБ |
| DR-R6 | Restore of 50,000 requests may exceed the RTO | The target is not achievable with the current tooling | Measure in the quarterly restore; optimise or revise the target | Martin |
| DR-R7 | One person holds most recovery knowledge | Key-person risk | Train two deputies; rotate exercise roles | Amir |
| DR-R8 | Workforce and provider DR are outside our control | Assignment or notification outage | Degradation table; contractual review | Andrey, Amir |
| DR-R9 | DNS TTL or certificate propagation delays the switch | RTO breach | Set TTL to 60 s; pre-provision certificates | Amir |
| DR-R10 | A backup may contain the same corruption | Restore does not resolve a logical incident | PITR plus immutable copies plus audit reconciliation | Martin, ИБ |

## 11. Traceability to the homework

| Homework item | Where it is addressed |
|---|---|
| RTO and RPO by component | §3.3 |
| DR strategy and alternatives | §5, [ADR-009](../adr/ADR-009-disaster-recovery-strategy.md) |
| HA versus DR | §4 |
| Recovery procedures and validation | §6, §8 |
| Exercise programme | §9 |
| Risks and open questions | §10 |

The plan is a design artefact. The first full DR exercise is the evidence that converts its targets into an operational capability.
