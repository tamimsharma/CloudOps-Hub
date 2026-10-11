# CloudOps Hub - production environment
# Wires together the vpc, ec2, s3, iam and monitoring modules.
#
# This is the environment deployed by .github/workflows/deploy.yml.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }

  # Remote state. Create the state bucket/dynamodb table first (see
  # docs/deployment.md), uncomment this block, then run `terraform init -reconfigure`.
  # The deploy workflow runs `terraform init -backend-config` style initialization
  # when these values are provided as GitHub variables.
  # backend "s3" {
  #   bucket         = "cloudops-terraform-state"
  #   key            = "cloudops/production/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "cloudops-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "CloudOpsHub"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name = "cloudops-${var.environment}"
  tags = {
    Environment = var.environment
  }
}

module "vpc" {
  source = "../../modules/vpc"

  name                = local.name
  environment         = var.environment
  cidr_block          = var.vpc_cidr
  availability_zones  = var.availability_zones
  allowed_cidr_blocks = var.allowed_cidr_blocks
  tags                = local.tags
}

module "s3" {
  source = "../../modules/s3"

  bucket_name                = var.s3_bucket_name
  environment                = var.environment
  force_destroy              = false
  versioning_enabled         = true
  expiration_days            = 90
  noncurrent_expiration_days = 30
  tags                       = local.tags
}

module "iam" {
  source = "../../modules/iam"

  name                    = local.name
  environment             = var.environment
  region                  = var.aws_region
  s3_bucket_arns          = [module.s3.bucket_arn]
  create_instance_profile = true
  tags                    = local.tags
}

module "ec2" {
  source = "../../modules/ec2"

  name                      = local.name
  environment               = var.environment
  instance_type             = var.instance_type
  subnet_id                 = module.vpc.public_subnet_ids[0]
  security_group_ids        = [module.vpc.security_group_id]
  public_key                = var.ssh_public_key
  iam_instance_profile_name = coalesce(module.iam.instance_profile_name, "")
  root_volume_size_gb       = 50
  tags                      = local.tags
}

module "monitoring" {
  source = "../../modules/monitoring"

  name           = local.name
  environment    = var.environment
  instance_id    = module.ec2.instance_id
  sns_topic_name = "cloudops-${var.environment}-alerts"
  alert_emails   = var.alert_emails
  cpu_threshold  = 75
  disk_threshold = 80
  tags           = local.tags
}
