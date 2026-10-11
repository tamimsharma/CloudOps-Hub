variable "name" {
  description = "Base name used for resource naming and tags"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "development"
}

variable "cidr_block" {
  description = "VPC CIDR block. Public subnets are carved out with /8 bits (e.g. 10.0.1.0/24, 10.0.2.0/24)."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for the public subnets (at least two)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach the security group on 22/80/443"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "tags" {
  description = "Additional tags applied to every resource"
  type        = map(string)
  default     = {}
}
