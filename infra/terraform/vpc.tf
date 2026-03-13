# ─── VPC Network ─────────────────────────────────────────────────────────────

resource "google_compute_network" "verika_vpc" {
  name                    = "verika-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "verika_subnet" {
  name          = "verika-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.verika_vpc.id

  private_ip_google_access = true
}

# ─── VPC Peering: verika-vpc ↔ room404-vpc (for Redis) ─────────────────────

resource "google_compute_network_peering" "verika_to_room404" {
  name         = "verika-to-room404"
  network      = google_compute_network.verika_vpc.self_link
  peer_network = var.room404_vpc_network

  export_custom_routes = false
  import_custom_routes = false
}

# NOTE: The reverse peering (room404 → verika) must be created in the
# room404-prod project's Terraform configuration.

# ─── Cloud Run VPC Connector ────────────────────────────────────────────────

resource "google_vpc_access_connector" "verika_connector" {
  name          = "verika-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.verika_vpc.name

  min_instances = 2
  max_instances = 3

  machine_type = "e2-micro"
}
