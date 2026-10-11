# CloudOps Hub - EC2 module
# Provisions an EC2 instance (Amazon Linux 2023), an SSH key pair and installs
# Docker plus the Docker Compose plugin through user data.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_key_pair" "this" {
  key_name_prefix = "${var.name}-"
  public_key      = var.public_key

  tags = merge(var.tags, {
    Name        = "${var.name}-key"
    Environment = var.environment
  })
}

resource "aws_instance" "this" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = var.security_group_ids
  key_name                    = aws_key_pair.this.key_name
  iam_instance_profile        = var.iam_instance_profile_name != "" ? var.iam_instance_profile_name : null
  associate_public_ip_address = true
  user_data_replace_on_change = true

  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail

    dnf update -y
    dnf install -y docker docker-compose-plugin git

    systemctl enable --now docker
    usermod -aG docker ec2-user || true

    mkdir -p /opt/cloudops
    echo "CloudOps Hub node provisioned" > /opt/cloudops/.provisioned
  EOT

  root_block_device {
    volume_size           = var.root_volume_size_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  tags = merge(var.tags, {
    Name        = "${var.name}-api"
    Environment = var.environment
  })

  lifecycle {
    create_before_destroy = true
  }
}
