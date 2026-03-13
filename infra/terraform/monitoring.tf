# ─── Uptime Check ────────────────────────────────────────────────────────────

resource "google_monitoring_uptime_check_config" "verika_health" {
  display_name = "Verika API Health Check"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "cloud_run_revision"
    labels = {
      project_id         = var.project_id
      service_name       = "verika-api"
      location           = var.region
      configuration_name = ""
      revision_name      = ""
    }
  }
}

# ─── Alert: Uptime Failure ───────────────────────────────────────────────────
# Verika down = ecosystem auth down. Immediate alert.

resource "google_monitoring_alert_policy" "verika_uptime" {
  display_name = "Verika API Uptime Failure"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failure"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "60s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }
    }
  }

  notification_channels = []

  alert_strategy {
    auto_close = "1800s"
  }
}

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

# ─── Alert: Redis Connection Failures ───────────────────────────────────────

resource "google_monitoring_alert_policy" "redis_failures" {
  display_name = "Verika Redis Connection Failures"
  combiner     = "OR"

  conditions {
    display_name = "Any Redis connection failure"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/verika_redis_errors\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_COUNT"
      }
    }
  }

  notification_channels = []
}

# ─── SLO: Token Issuance ────────────────────────────────────────────────────
# 99.9% of token issuance requests succeed within 500ms

resource "google_monitoring_slo" "token_issuance" {
  provider     = google-beta
  service      = google_monitoring_custom_service.verika.service_id
  display_name = "Token Issuance SLO — 99.9% within 500ms"

  goal                = 0.999
  rolling_period_days = 30

  request_based_sli {
    good_total_ratio {
      total_service_filter = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"verika-api\" AND metric.type = \"run.googleapis.com/request_count\""
      good_service_filter  = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"verika-api\" AND metric.type = \"run.googleapis.com/request_latencies\" AND metric.labels.response_code_class = \"2xx\""
    }
  }
}

resource "google_monitoring_custom_service" "verika" {
  provider     = google-beta
  service_id   = "verika-api"
  display_name = "Verika Identity Service"
}
