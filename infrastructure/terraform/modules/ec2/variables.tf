variable "name" {
  description = "Base name used for resource naming and tags"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "development"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
}

variable "subnet_id" {
  description = "ID of the subnet the instance is launched into"
  type        = string
}

variable "security_group_ids" {
  description = "Security groups attached to the instance"
  type        = list(string)
}

variable "public_key" {
  description = "SSH public key (PEM/OpenSSH format) used for the key pair"
  type        = string
}

variable "iam_instance_profile_name" {
  description = "Name of the IAM instance profile to attach (optional)"
  type        = string
  default     = ""
}

variable "root_volume_size_gb" {
  description = "Size of the root EBS volume in GiB"
  type        = number
  default     = 20
}

variable "tags" {
  description = "Additional tags applied to every resource"
  type        = map(string)
  default     = {}
}
