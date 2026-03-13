output "cloud_run_url" {
  description = "Verika API Cloud Run service URL"
  value       = google_cloud_run_v2_service.verika_api.uri
}

output "service_account_email" {
  description = "Verika API service account email"
  value       = google_service_account.verika_api.email
}

output "kms_key_id" {
  description = "Token signing KMS key ID"
  value       = google_kms_crypto_key.token_signing_key.id
}

output "firestore_database" {
  description = "Firestore database name"
  value       = google_firestore_database.verika_registry.name
}

output "vpc_connector_id" {
  description = "VPC connector for Cloud Run"
  value       = google_vpc_access_connector.verika_connector.id
}

output "docker_registry" {
  description = "Docker Artifact Registry URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.verika_images.repository_id}"
}

output "workload_identity_provider" {
  description = "Workload Identity Provider for GitHub Actions"
  value       = google_iam_workload_identity_pool_provider.github.name
}
