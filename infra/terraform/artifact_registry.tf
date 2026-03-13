# ─── Docker Repository ───────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "verika_images" {
  location      = var.region
  repository_id = "verika-images"
  description   = "Docker images for Verika identity service"
  format        = "DOCKER"

  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"

    most_recent_versions {
      keep_count = 10
    }
  }
}

# ─── npm Repository ─────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "verika_packages" {
  location      = var.region
  repository_id = "verika-packages"
  description   = "npm packages — @internal/verika SDK"
  format        = "NPM"
}
