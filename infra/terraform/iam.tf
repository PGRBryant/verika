# ─── Verika API Service Account ───────────────────────────────────────────────

resource "google_service_account" "verika_api" {
  account_id   = "verika-api"
  display_name = "Verika API Service Account"
  description  = "Service account for Verika identity service"
}

# Firestore access
resource "google_project_iam_member" "verika_api_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.verika_api.email}"
}

# KMS signing (also in kms.tf — cross-referenced)
# See kms.tf google_kms_crypto_key_iam_member.verika_api_signer

# Secret Manager access (bootstrap secrets only)
resource "google_project_iam_member" "verika_api_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.verika_api.email}"
}

# ─── Cross-Project Invoker Bindings ──────────────────────────────────────────
# Each consuming service needs Cloud Run invoker on Verika API

# MystWeaver API → can invoke Verika for token issuance
resource "google_cloud_run_v2_service_iam_member" "mystweaver_invoker" {
  name     = google_cloud_run_v2_service.verika_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:mystweaver-api@mystweaver-489920.iam.gserviceaccount.com"
}

resource "google_cloud_run_v2_service_iam_member" "room404_game_server_invoker" {
  name     = google_cloud_run_v2_service.verika_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:room404-game-server@room404-490104.iam.gserviceaccount.com"
}

resource "google_cloud_run_v2_service_iam_member" "room404_ai_service_invoker" {
  name     = google_cloud_run_v2_service.verika_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:room404-ai-service@room404-490104.iam.gserviceaccount.com"
}

resource "google_cloud_run_v2_service_iam_member" "varunai_invoker" {
  name     = google_cloud_run_v2_service.verika_api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:varunai@varunai-490119.iam.gserviceaccount.com"
}
