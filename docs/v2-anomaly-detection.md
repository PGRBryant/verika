# V2: Behavioral Anomaly Detection

## Trigger Condition

Implement when:

- A real incident occurs that behavioral detection would have caught
- Audit log analysis shows patterns worth automating (e.g., unusual capability usage, rate spikes)
- Service count grows enough that manual monitoring of cross-service interactions becomes impractical

## Current V1 State

- **Audit log**: Every authenticated request through `verikaPlugin` emits a structured audit entry with: caller, capability, target, timestamp, duration, trace ID
- **Data available**: Request rates, capability usage patterns, caller identity, response codes, latency
- **Detection**: None — audit log is written but not analyzed automatically

The V1 audit log captures everything needed for anomaly detection. It's the foundation this feature reads.

## Migration Steps

### 1. Audit Log Pipeline

Route Verika audit logs to BigQuery for analysis:

```bash
# Cloud Logging sink → BigQuery
gcloud logging sinks create verika-audit-sink \
  bigquery.googleapis.com/projects/verika-prod/datasets/verika_audit \
  --log-filter='jsonPayload.type="verika.audit"'
```

### 2. Baseline Behavior Models

Build per-service behavioral baselines from 30 days of audit data:

- **Rate baseline**: Normal request rate per service per capability per hour
- **Capability baseline**: Which capabilities each service normally uses
- **Temporal baseline**: Normal operating hours per service
- **Caller baseline**: Expected caller → target pairs

### 3. Anomaly Classifiers

Implement Cloud Dataflow streaming job with classifiers:

| Classifier | Signal | Confidence | Action |
|---|---|---|---|
| Rate spike | 5x baseline request rate | High | Auto-revoke |
| New capability | Service uses capability it never used before | Medium | Alert |
| New caller | Unknown service calling a protected endpoint | High | Auto-revoke |
| Off-hours | Requests outside normal operating window | Low | Alert |
| Capability escalation | Service attempts capabilities not in its policy | High | Auto-revoke + alert |
| Latency anomaly | Target service latency 10x baseline | Medium | Alert |

### 4. Automated Response

High-confidence anomalies trigger automated revocation:

```typescript
// Dataflow job output → Cloud Function → Verika API
await fetch(`${VERIKA_ENDPOINT}/v1/tokens/revoke`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ serviceId: anomalousService, revokeAll: true }),
});
```

Medium-confidence anomalies generate alerts for human review.

### 5. Feedback Loop

False positives are logged and fed back into the baseline model. Anomaly thresholds are tuned over time.

## Rollback Plan

Disable the Dataflow job. Audit logging continues unchanged. Revocations already issued remain in effect (they expire naturally with token TTL).

## Estimated Effort

**4-6 weeks** — BigQuery pipeline, baseline computation, Dataflow job, classifier tuning, automated response, alerting.

## Impact

- **API**: No changes — uses existing revocation endpoint
- **SDK**: No changes
- **Infrastructure**: BigQuery dataset, Dataflow job, Cloud Function
- **Operations**: New alerting channels for anomaly notifications
