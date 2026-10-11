// AWS module types
import { z } from 'zod';
import type { ResourceType } from '@prisma/client';

export const awsSyncSchema = z.object({});

export type AwsSyncInput = z.infer<typeof awsSyncSchema>;

export interface AwsSyncResult {
  created: number;
  updated: number;
  source: 'aws-cli' | 'demo';
}

export interface AwsServiceDefinition {
  service: string;
  label: string;
  description: string;
  /** Prisma resource types that evidence usage of this service. */
  resourceTypes: ResourceType[];
}

export const AWS_SERVICE_CATALOGUE: readonly AwsServiceDefinition[] = [
  {
    service: 'EC2',
    label: 'Elastic Compute Cloud',
    description: 'Virtual machines running application workloads',
    resourceTypes: ['EC2_INSTANCE'],
  },
  {
    service: 'S3',
    label: 'Simple Storage Service',
    description: 'Object storage for artifacts, backups and terraform state',
    resourceTypes: ['S3_BUCKET'],
  },
  {
    service: 'IAM',
    label: 'Identity and Access Management',
    description: 'Users, roles and policies governing access to the AWS account',
    resourceTypes: [],
  },
  {
    service: 'RDS',
    label: 'Relational Database Service',
    description: 'Managed relational databases backing platform services',
    resourceTypes: ['DATABASE'],
  },
  {
    service: 'EKS',
    label: 'Elastic Kubernetes Service',
    description: 'Managed Kubernetes clusters hosting containerised workloads',
    resourceTypes: ['KUBERNETES_CLUSTER'],
  },
  {
    service: 'CloudWatch',
    label: 'CloudWatch',
    description: 'Metrics, alarms and observability data for AWS resources',
    resourceTypes: [],
  },
  {
    service: 'VPC',
    label: 'Virtual Private Cloud',
    description: 'Network isolation, subnets and security groups',
    resourceTypes: [],
  },
  {
    service: 'ELB',
    label: 'Elastic Load Balancing',
    description: 'Application and network load balancers distributing traffic',
    resourceTypes: ['LOAD_BALANCER'],
  },
];
