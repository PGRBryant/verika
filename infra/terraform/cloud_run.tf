resource "google_cloud_run_v2_service" "verika_api" {
  name     = "verika-api"
  location = var.region

  template {
    scaling {
      min_instance_count = 0   # Scale to zero until Redis/VPC peering is live; bump to 2 after
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/verika-images/verika-api:latest"

      resources {
        limits = {
          memory = "512Mi"
          cpu    = "1"
        }
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "KMS_KEY_RING"
        value = "verika-signing"
      }

      env {
        name  = "KMS_KEY_NAME"
        value = "token-signing-key"
      }

      env {
        name  = "KMS_LOCATION"
        value = var.region
      }

      env {
        name  = "REDIS_HOST"
        value = var.redis_host
      }

      env {
        name  = "REDIS_PORT"
        value = tostring(var.redis_port)
      }

      env {
        name  = "FIRESTORE_DATABASE"
        value = "verika-registry"
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      ports {
        container_port = 8080
      }

      startup_probe {
        http_get {
          path = "/ready"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 6
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        period_seconds = 30
      }
    }

    max_instance_request_concurrency = 1000
    timeout                          = "10s"

    service_account = google_service_account.verika_api.email

    vpc_access {
      connector = google_vpc_access_connector.verika_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Do NOT allow unauthenticated access
resource "google_cloud_run_v2_service_iam_member" "noauth" {
  name     = google_cloud_run_v2_service.verika_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
  # NOTE: This is intentionally NOT created. The resource block is here
  # as documentation that unauthenticated access is explicitly denied.
  count = 0
}
