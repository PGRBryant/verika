# ─── Alert: Token Issuance Latency ──────────────────────────────────────────

resource "google_monitoring_alert_policy" "token_latency" {
  display_name = "Verika Token Issuance Latency > 200ms (p99)"
  combiner     = "OR"

  conditions {
    display_name = "p99 latency exceeds 200ms"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"verika-api\" AND metric.type = \"run.googleapis.com/request_latencies\""
      comparison      = "COMPARISON_GT"
      threshold_value = 200
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }

  notification_channels = []
}

# ─── Alert: Revocation Endpoint Errors ──────────────────────────────────────

resource "google_monitoring_alert_policy" "revocation_errors" {
  display_name = "Verika Revocation Error Rate > 0.1%"
  combiner     = "OR"

  conditions {
    display_name = "Revocation error rate threshold"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"verika-api\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class != \"2xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.001
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = []
}

# ─── Resources deferred until Cloud Run is live and emitting metrics ────────
# Uncomment after first successful deployment:
#
# resource "google_monitoring_uptime_check_config" "verika_health" { ... }
# resource "google_monitoring_alert_policy" "verika_uptime" { ... }
# resource "google_monitoring_alert_policy" "redis_failures" { ... }
# resource "google_monitoring_slo" "token_issuance" { ... }

resource "google_monitoring_custom_service" "verika" {
  provider     = google-beta
  service_id   = "verika-api"
  display_name = "Verika Identity Service"
}
