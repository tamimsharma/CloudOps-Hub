output "role_name" {
  description = "Name of the IAM role"
  value       = aws_iam_role.this.name
}

output "role_arn" {
  description = "ARN of the IAM role"
  value       = aws_iam_role.this.arn
}

output "policy_arn" {
  description = "ARN of the inline customer managed policy"
  value       = aws_iam_policy.this.arn
}

output "instance_profile_name" {
  description = "Name of the instance profile (null when create_instance_profile is false)"
  value       = try(aws_iam_instance_profile.this[0].name, null)
}

output "instance_profile_arn" {
  description = "ARN of the instance profile (null when create_instance_profile is false)"
  value       = try(aws_iam_instance_profile.this[0].arn, null)
}
