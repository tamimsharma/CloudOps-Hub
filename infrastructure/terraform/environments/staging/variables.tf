variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.1.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones used for the public subnets"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to reach the instance on 22/80/443"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "instance_type" {
  description = "EC2 instance type for the CloudOps node"
  type        = string
  default     = "t3.small"
}

variable "ssh_public_key" {
  description = "SSH public key used to access the instance"
  type        = string
}

variable "s3_bucket_name" {
  description = "Globally unique name of the CloudOps artifacts bucket"
  type        = string
}

variable "alert_emails" {
  description = "Email addresses subscribed to CloudWatch alarm notifications"
  type        = list(string)
  default     = []
}
