# TODO(verika-v2): Migrate to Cloud Spanner when service count exceeds 10
# or multi-region deployment requires global strong consistency for
# security-critical revocations. Interface does not change on migration.
# See docs/v2-spanner-migration.md. Estimated effort: 1 week.

resource "google_firestore_database" "verika_registry" {
  provider    = google-beta
  project     = var.project_id
  name        = "verika-registry"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  concurrency_mode            = "OPTIMISTIC"
  app_engine_integration_mode = "DISABLED"
}
