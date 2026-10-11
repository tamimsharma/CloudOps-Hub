variable "name" {
  description = "Base name used for alarms and topics"
  type        = string
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "development"
}

variable "instance_id" {
  description = "EC2 instance ID monitored by the alarms"
  type        = string
}

variable "sns_topic_name" {
  description = "Name of the SNS topic receiving alarm notifications"
  type        = string
  default     = "cloudops-alerts"
}

variable "alert_emails" {
  description = "Email addresses subscribed to the alarm topic"
  type        = list(string)
  default     = []
}

variable "cpu_threshold" {
  description = "CPU utilization percentage that triggers the alarm"
  type        = number
  default     = 80
}

variable "disk_threshold" {
  description = "Disk usage percentage that triggers the alarm"
  type        = number
  default     = 85
}

variable "tags" {
  description = "Additional tags applied to every resource"
  type        = map(string)
  default     = {}
}
