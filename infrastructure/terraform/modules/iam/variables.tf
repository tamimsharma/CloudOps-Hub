variable "name" {
  description = "Base name used for the role, policy and instance profile"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "development"
}

variable "region" {
  description = "AWS region, used to build log group and secret ARNs"
  type        = string
  default     = "us-east-1"
}

variable "s3_bucket_arns" {
  description = "ARNs of the S3 buckets the role may access. Empty list falls back to all buckets."
  type        = list(string)
  default     = []
}

variable "create_instance_profile" {
  description = "Create an instance profile for the role"
  type        = bool
  default     = true
}

variable "additional_policy_statements" {
  description = "Extra IAM policy statements merged into the role policy"
  type        = any
  default     = []
}

variable "tags" {
  description = "Additional tags applied to every resource"
  type        = map(string)
  default     = {}
}
