// Kubernetes controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema, createPaginationMeta } from '@cloudops-hub/shared';
import { kubernetesService } from './service';
import {
  createClusterSchema,
  updateClusterSchema,
  clusterFilterSchema,
  scaleWorkloadSchema,
} from './types';

export const getClusters = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(clusterFilterSchema, req.query);
  const { clusters, total } = await kubernetesService.findClusters(params);

  res.json({
    success: true,
    data: clusters,
    pagination: createPaginationMeta(params, total),
  });
});

export const getCluster = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const cluster = await kubernetesService.findClusterById(req.params.id);
  res.json({ success: true, data: cluster });
});

export const createCluster = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createClusterSchema, req.body);
  const cluster = await kubernetesService.createCluster(input);

  res.status(201).json({ success: true, data: cluster, message: 'Cluster registered successfully' });
});

export const updateCluster = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(updateClusterSchema, req.body);
  const cluster = await kubernetesService.updateCluster(req.params.id, input);

  res.json({ success: true, data: cluster, message: 'Cluster updated successfully' });
});

export const deleteCluster = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await kubernetesService.deleteCluster(req.params.id);
  res.json({ success: true, message: 'Cluster removed successfully' });
});

export const syncCluster = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await kubernetesService.syncCluster(req.params.id);
  res.json({ ...result, success: true });
});

export const getWorkloads = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const namespace = req.query.namespace as string | undefined;
  const workloads = await kubernetesService.findWorkloads(req.params.id, namespace);
  res.json({ success: true, data: workloads });
});

export const getWorkloadList = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const clusterId = req.query.clusterId as string | undefined;
  const namespace = req.query.namespace as string | undefined;
  const status = req.query.status as string | undefined;
  const workloads = await kubernetesService.findAllWorkloads(clusterId, namespace, status);
  res.json({ success: true, data: workloads });
});

export const getWorkload = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const workload = await kubernetesService.findWorkloadById(req.params.id);
  res.json({ success: true, data: workload });
});

export const scaleWorkload = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(scaleWorkloadSchema, req.body);
  const result = await kubernetesService.scaleWorkload(req.params.id, input);
  res.json({ ...result, success: true });
});

export const restartWorkload = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await kubernetesService.restartWorkload(req.params.id);
  res.json({ ...result, success: true });
});

export const getWorkloadLogs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const lines = parseInt(String(req.query.lines), 10) || 100;
  const logs = await kubernetesService.getWorkloadLogs(req.params.id, lines);
  res.setHeader('Content-Type', 'text/plain');
  res.send(logs);
});

export const getWorkloadEvents = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const events = await kubernetesService.getWorkloadEvents(req.params.id);
  res.json({ success: true, data: events });
});

export const getKubernetesStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stats = await kubernetesService.getClusterStats();
  res.json({ success: true, data: stats });
});
