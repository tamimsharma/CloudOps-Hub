output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.this.id
}

output "instance_arn" {
  description = "ARN of the EC2 instance"
  value       = aws_instance.this.arn
}

output "public_ip" {
  description = "Public IPv4 address of the instance"
  value       = aws_instance.this.public_ip
}

output "private_ip" {
  description = "Private IPv4 address of the instance"
  value       = aws_instance.this.private_ip
}

output "key_pair_name" {
  description = "Name of the created key pair"
  value       = aws_key_pair.this.key_name
}

output "ami_id" {
  description = "AMI ID used for the instance"
  value       = data.aws_ami.amazon_linux.id
}
