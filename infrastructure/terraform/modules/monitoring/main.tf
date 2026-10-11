# CloudOps Hub - Monitoring module
# CloudWatch alarms for the API instance plus an SNS topic (and optional
# email subscriptions) used for alert notifications.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

resource "aws_sns_topic" "alerts" {
  name = var.sns_topic_name

  tags = merge(var.tags, {
    Name        = var.sns_topic_name
    Environment = var.environment
  })
}

resource "aws_sns_topic_subscription" "email" {
  count = length(var.alert_emails)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_emails[count.index]
}

resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "${var.name}-high-cpu"
  alarm_description   = "EC2 CPU utilization above ${var.cpu_threshold}% for 5 minutes"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.cpu_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = var.instance_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.tags, {
    Name        = "${var.name}-high-cpu"
    Environment = var.environment
  })
}

resource "aws_cloudwatch_metric_alarm" "status_check_failed" {
  alarm_name          = "${var.name}-status-check-failed"
  alarm_description   = "EC2 instance status check failed"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = var.instance_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.tags, {
    Name        = "${var.name}-status-check"
    Environment = var.environment
  })
}

resource "aws_cloudwatch_metric_alarm" "disk_usage" {
  alarm_name          = "${var.name}-high-disk-usage"
  alarm_description   = "EC2 burstable balance or disk usage is low"
  namespace           = "CWAgent"
  metric_name         = "disk_used_percent"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.disk_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = var.instance_id
    MountPoint = "/"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = merge(var.tags, {
    Name        = "${var.name}-high-disk"
    Environment = var.environment
  })
}
