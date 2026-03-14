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

  notification_channels = [google_monitoring_notification_channel.oncall_email.name]
}

# ─── Notification Channel ────────────────────────────────────────────────────

resource "google_monitoring_notification_channel" "oncall_email" {
  display_name = "Verika Oncall Email"
  type         = "email"

  labels = {
    email_address = "pgrbryant@gmail.com"
  }
}

# ─── Uptime Check ────────────────────────────────────────────────────────────

resource "google_monitoring_uptime_check_config" "verika_ready" {
  display_name = "Verika API /ready"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/ready"
    port         = 443
    use_ssl      = true
    validate_ssl = true

    auth_info {
      username = ""
      password = ""
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "verika-api-hdzhlg4y7a-ue.a.run.app"
    }
  }
}

resource "google_monitoring_alert_policy" "verika_uptime" {
  display_name = "Verika API Down"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failed"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.verika_ready.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "60s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.labels.host"]
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.oncall_email.name]
}

resource "google_monitoring_alert_policy" "redis_failures" {
  display_name = "Verika Redis Fail-Open Rate > 5%"
  combiner     = "OR"

  conditions {
    display_name = "High fail-open rate on revocation checks"

    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"verika-api\" AND metric.type = \"logging.googleapis.com/user/verika_revocation_fail_open\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.oncall_email.name]
}

resource "google_monitoring_custom_service" "verika" {
  provider     = google-beta
  service_id   = "verika-api"
  display_name = "Verika Identity Service"
}
