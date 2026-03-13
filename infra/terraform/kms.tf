resource "google_kms_key_ring" "verika_signing" {
  name     = "verika-signing"
  location = var.region
}

resource "google_kms_crypto_key" "token_signing_key" {
  name     = "token-signing-key"
  key_ring = google_kms_key_ring.verika_signing.id
  purpose  = "ASYMMETRIC_SIGN"

  version_template {
    algorithm        = "RSA_SIGN_PKCS1_2048_SHA256"
    protection_level = "HSM"
  }

  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "verika_api_signer" {
  crypto_key_id = google_kms_crypto_key.token_signing_key.id
  role          = "roles/cloudkms.signerVerifier"
  member        = "serviceAccount:${google_service_account.verika_api.email}"
}
