// AWS integration helpers.
// Uses the AWS CLI when it is installed and credentials are configured,
// otherwise it serves a realistic demo inventory so the platform stays usable.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig } from '@cloudops-hub/config';

const execFileAsync = promisify(execFile);
const config = getConfig();

export interface AwsIdentity {
  account: string;
  arn: string;
  userId: string;
}

export interface AwsInstance {
  instanceId: string;
  name: string;
  state: string;
  instanceType: string;
  publicIp?: string;
  privateIp?: string;
  launchTime?: string;
  availabilityZone?: string;
}

export interface AwsBucket {
  name: string;
  region: string;
  creationDate?: string;
  sizeGb?: number;
}

export interface AwsInventory {
  source: 'aws-cli' | 'demo';
  region: string;
  identity?: AwsIdentity;
  instances: AwsInstance[];
  buckets: AwsBucket[];
  collectedAt: string;
}

let cliAvailable: boolean | null = null;

async function runAws(args: string[], timeoutMs = 15000): Promise<unknown | null> {
  if (!config.enableAwsIntegration) return null;
  try {
    const { stdout } = await execFileAsync('aws', args, {
      timeout: timeoutMs,
      windowsHide: true,
      env: {
        ...process.env,
        AWS_REGION: config.awsRegion,
        AWS_ACCESS_KEY_ID: config.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
        AWS_SECRET_ACCESS_KEY: config.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export async function isAwsCliAvailable(): Promise<boolean> {
  if (cliAvailable !== null) return cliAvailable;
  try {
    await execFileAsync('aws', ['--version'], { timeout: 5000, windowsHide: true });
    cliAvailable = true;
  } catch {
    cliAvailable = false;
  }
  return cliAvailable;
}

export async function getAwsIdentity(): Promise<AwsIdentity | null> {
  const data = (await runAws(['sts', 'get-caller-identity', '--output', 'json'])) as
    | { Account?: string; Arn?: string; UserId?: string }
    | null;
  if (!data?.Account) return null;
  return { account: data.Account, arn: data.Arn ?? '', userId: data.UserId ?? '' };
}

function demoInventory(): AwsInventory {
  const now = Date.now();
  return {
    source: 'demo',
    region: config.awsRegion,
    instances: [
      {
        instanceId: 'i-0a1b2c3d4e5f67890',
        name: 'cloudops-web-01',
        state: 'running',
        instanceType: 't3.medium',
        publicIp: '54.210.14.87',
        privateIp: '10.0.1.12',
        launchTime: new Date(now - 86400000 * 12).toISOString(),
        availabilityZone: `${config.awsRegion}a`,
      },
      {
        instanceId: 'i-0f9e8d7c6b5a43210',
        name: 'cloudops-api-01',
        state: 'running',
        instanceType: 't3.large',
        publicIp: '3.92.14.201',
        privateIp: '10.0.1.34',
        launchTime: new Date(now - 86400000 * 30).toISOString(),
        availabilityZone: `${config.awsRegion}b`,
      },
      {
        instanceId: 'i-0123456789abcdef0',
        name: 'cloudops-worker-01',
        state: 'stopped',
        instanceType: 'c6i.xlarge',
        privateIp: '10.0.2.7',
        launchTime: new Date(now - 86400000 * 5).toISOString(),
        availabilityZone: `${config.awsRegion}a`,
      },
    ],
    buckets: [
      { name: 'cloudops-hub-artifacts', region: config.awsRegion, creationDate: new Date(now - 86400000 * 60).toISOString(), sizeGb: 42.7 },
      { name: 'cloudops-hub-backups', region: config.awsRegion, creationDate: new Date(now - 86400000 * 90).toISOString(), sizeGb: 128.4 },
      { name: 'cloudops-hub-terraform-state', region: config.awsRegion, creationDate: new Date(now - 86400000 * 120).toISOString(), sizeGb: 0.4 },
    ],
    collectedAt: new Date().toISOString(),
  };
}

export async function getAwsInventory(): Promise<AwsInventory> {
  const available = await isAwsCliAvailable();
  const identity = await getAwsIdentity();

  if (!available || !identity) {
    return demoInventory();
  }

  const [instancesRes, bucketsRes] = await Promise.all([
    runAws([
      'ec2',
      'describe-instances',
      '--output',
      'json',
      '--query',
      'Reservations[].Instances[].[InstanceId,State.Name,InstanceType,PublicIpAddress,PrivateIpAddress,LaunchTime,Placement.AvailabilityZone]',
    ]),
    runAws(['s3api', 'list-buckets', '--output', 'json', '--query', 'Buckets[].[Name,CreationDate]']),
  ]);

  const instances: AwsInstance[] = Array.isArray(instancesRes)
    ? (instancesRes as unknown[][]).map((row) => ({
        instanceId: String(row[0]),
        name: String(row[0]),
        state: String(row[1]),
        instanceType: String(row[2]),
        publicIp: row[3] ? String(row[3]) : undefined,
        privateIp: row[4] ? String(row[4]) : undefined,
        launchTime: row[5] ? String(row[5]) : undefined,
        availabilityZone: row[6] ? String(row[6]) : undefined,
      }))
    : [];

  const buckets: AwsBucket[] = Array.isArray(bucketsRes)
    ? (bucketsRes as unknown[][]).map((row) => ({
        name: String(row[0]),
        region: config.awsRegion,
        creationDate: row[1] ? String(row[1]) : undefined,
      }))
    : [];

  if (instances.length === 0 && buckets.length === 0) {
    return { ...demoInventory(), identity };
  }

  return {
    source: 'aws-cli',
    region: config.awsRegion,
    identity,
    instances,
    buckets,
    collectedAt: new Date().toISOString(),
  };
}

export async function getAwsHealth(): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const started = Date.now();
  if (!config.enableAwsIntegration) {
    return { ok: false, latencyMs: 0, message: 'AWS integration disabled' };
  }
  const identity = await getAwsIdentity();
  return {
    ok: Boolean(identity),
    latencyMs: Date.now() - started,
    message: identity
      ? `Authenticated as account ${identity.account}`
      : 'AWS CLI or credentials not available - demo data in use',
  };
}
