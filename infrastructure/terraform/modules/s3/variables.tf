variable "bucket_name" {
  description = "Globally unique S3 bucket name"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "development"
}

variable "force_destroy" {
  description = "Allow Terraform to delete the bucket even if it still contains objects"
  type        = bool
  default     = false
}

variable "versioning_enabled" {
  description = "Enable object versioning"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "KMS key ARN for SSE-KMS. Leave empty to use SSE-S3 (AES256)."
  type        = string
  default     = ""
}

variable "expiration_days" {
  description = "Days after which current objects expire"
  type        = number
  default     = 90
}

variable "noncurrent_expiration_days" {
  description = "Days after which noncurrent object versions expire"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags applied to every resource"
  type        = map(string)
  default     = {}
}
