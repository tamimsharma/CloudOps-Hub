// Main API routes
import { Router } from 'express';
import { authRoutes } from '../modules/auth/routes';
import { userRoutes } from '../modules/users/routes';
import { resourceRoutes } from '../modules/resources/routes';
import { deploymentRoutes } from '../modules/deployments/routes';
import { containerRoutes } from '../modules/containers/routes';
import { kubernetesRoutes } from '../modules/kubernetes/routes';
import { metricsRoutes } from '../modules/metrics/routes';
import { logsRoutes } from '../modules/logs/routes';
import { alertRoutes } from '../modules/alerts/routes';
import { incidentRoutes } from '../modules/incidents/routes';
import { costRoutes } from '../modules/costs/routes';
import { reportRoutes } from '../modules/reports/routes';
import { cicdRoutes } from '../modules/cicd/routes';
import { awsRoutes } from '../modules/aws/routes';
import { healthRoutes } from '../modules/health/routes';
import { dashboardRoutes } from '../modules/dashboard/routes';

export const routes = Router();

// Public routes
routes.use('/auth', authRoutes);

// Protected routes
routes.use('/users', userRoutes);
routes.use('/resources', resourceRoutes);
routes.use('/deployments', deploymentRoutes);
routes.use('/containers', containerRoutes);
routes.use('/kubernetes', kubernetesRoutes);
routes.use('/metrics', metricsRoutes);
routes.use('/logs', logsRoutes);
routes.use('/alerts', alertRoutes);
routes.use('/incidents', incidentRoutes);
routes.use('/costs', costRoutes);
routes.use('/reports', reportRoutes);
routes.use('/cicd', cicdRoutes);
routes.use('/aws', awsRoutes);
routes.use('/health', healthRoutes);
routes.use('/dashboard', dashboardRoutes);

// API info
routes.get('/', (req, res) => {
  res.json({
    name: 'CloudOps Hub API',
    version: '1.0.0',
    description: 'Intelligent Cloud Operations Platform',
    documentation: '/api/docs',
  });
});