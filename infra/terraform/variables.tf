variable "project_id" {
  description = "GCP project ID for Verika"
  type        = string
  default     = "verika-prod"
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-east1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "redis_host" {
  description = "Redis (Memorystore) host in room404-prod"
  type        = string
  default     = "10.0.1.3"
}

variable "redis_port" {
  description = "Redis port"
  type        = number
  default     = 6379
}

variable "room404_vpc_network" {
  description = "Room 404 VPC network self-link for peering"
  type        = string
  default     = "projects/room404-prod/global/networks/room404-vpc"
}

variable "github_repo" {
  description = "GitHub repository for Workload Identity Federation"
  type        = string
  default     = "your-org/verika"
}
