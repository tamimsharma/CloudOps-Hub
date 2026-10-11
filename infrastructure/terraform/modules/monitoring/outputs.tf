output "sns_topic_arn" {
  description = "ARN of the alarm SNS topic"
  value       = aws_sns_topic.alerts.arn
}

output "high_cpu_alarm_arn" {
  description = "ARN of the high CPU CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.high_cpu.arn
}

output "status_check_alarm_arn" {
  description = "ARN of the status check CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.status_check_failed.arn
}

output "disk_usage_alarm_arn" {
  description = "ARN of the disk usage CloudWatch alarm"
  value       = aws_cloudwatch_metric_alarm.disk_usage.arn
}

output "alarm_names" {
  description = "Names of all CloudWatch alarms created by this module"
  value = [
    aws_cloudwatch_metric_alarm.high_cpu.alarm_name,
    aws_cloudwatch_metric_alarm.status_check_failed.alarm_name,
    aws_cloudwatch_metric_alarm.disk_usage.alarm_name,
  ]
}
