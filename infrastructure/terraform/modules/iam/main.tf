# CloudOps Hub - IAM module
# EC2 instance role granting access to the CloudOps S3 bucket and CloudWatch,
# plus an instance profile that can be attached to the EC2 module.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "this" {
  name_prefix = "${var.name}-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "${var.name}-role"
    Environment = var.environment
  })
}

resource "aws_iam_policy" "this" {
  name_prefix = "${var.name}-"
  description = "CloudOps Hub EC2 policy: S3 access and CloudWatch metrics/logs"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid    = "ListBucket"
          Effect = "Allow"
          Action = [
            "s3:ListBucket",
            "s3:GetBucketLocation",
            "s3:ListBucketVersions"
          ]
          Resource = length(var.s3_bucket_arns) > 0 ? var.s3_bucket_arns : ["arn:aws:s3:::*"]
        },
        {
          Sid    = "ObjectAccess"
          Effect = "Allow"
          Action = [
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:RestoreObject"
          ]
          Resource = length(var.s3_bucket_arns) > 0 ? [for arn in var.s3_bucket_arns : "${arn}/*"] : ["arn:aws:s3:::*/*"]
        },
        {
          Sid    = "CloudWatchMetrics"
          Effect = "Allow"
          Action = [
            "cloudwatch:PutMetricData",
            "cloudwatch:GetMetricStatistics",
            "cloudwatch:ListMetrics",
            "cloudwatch:PutMetricStream"
          ]
          Resource = "*"
        },
        {
          Sid    = "CloudWatchLogs"
          Effect = "Allow"
          Action = [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
            "logs:DescribeLogStreams"
          ]
          Resource = "arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/cloudops/*"
        },
        {
          Sid    = "SecretsRead"
          Effect = "Allow"
          Action = [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret"
          ]
          Resource = "arn:aws:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:cloudops/*"
        }
      ],
      var.additional_policy_statements
    )
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "this" {
  role       = aws_iam_role.this.name
  policy_arn = aws_iam_policy.this.arn
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "this" {
  count = var.create_instance_profile ? 1 : 0

  name_prefix = "${var.name}-"
  role        = aws_iam_role.this.name

  tags = var.tags
}
