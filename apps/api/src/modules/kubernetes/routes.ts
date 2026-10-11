// Kubernetes routes
import { Router } from 'express';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import {
  getClusters,
  getCluster,
  createCluster,
  updateCluster,
  deleteCluster,
  syncCluster,
  getWorkloads,
  getWorkloadList,
  getWorkload,
  scaleWorkload,
  restartWorkload,
  getWorkloadLogs,
  getWorkloadEvents,
  getKubernetesStats,
} from './controller';

export const kubernetesRoutes = Router();

// All routes require authentication
kubernetesRoutes.use(authMiddleware);

// Read routes - all authenticated users
kubernetesRoutes.get('/stats', asyncHandler(getKubernetesStats));
kubernetesRoutes.get('/clusters', asyncHandler(getClusters));
kubernetesRoutes.get('/clusters/:id', asyncHandler(getCluster));
kubernetesRoutes.get('/clusters/:id/workloads', asyncHandler(getWorkloads));
kubernetesRoutes.get('/workloads', asyncHandler(getWorkloadList));
kubernetesRoutes.get('/workloads/:id', asyncHandler(getWorkload));
kubernetesRoutes.get('/workloads/:id/logs', asyncHandler(getWorkloadLogs));
kubernetesRoutes.get('/workloads/:id/events', asyncHandler(getWorkloadEvents));

// Write routes - ENGINEER and ADMIN
kubernetesRoutes.post('/clusters', requireRole('ADMIN', 'ENGINEER'), asyncHandler(createCluster));
kubernetesRoutes.patch('/clusters/:id', requireRole('ADMIN', 'ENGINEER'), asyncHandler(updateCluster));
kubernetesRoutes.post('/clusters/:id/sync', requireRole('ADMIN', 'ENGINEER'), asyncHandler(syncCluster));
kubernetesRoutes.delete('/clusters/:id', requireRole('ADMIN'), asyncHandler(deleteCluster));
kubernetesRoutes.post('/workloads/:id/scale', requireRole('ADMIN', 'ENGINEER'), asyncHandler(scaleWorkload));
kubernetesRoutes.post('/workloads/:id/restart', requireRole('ADMIN', 'ENGINEER'), asyncHandler(restartWorkload));
