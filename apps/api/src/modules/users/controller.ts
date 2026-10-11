// Users controller
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { AuthenticatedRequest } from '../../middleware/auth';
import { validateSchema } from '@cloudops-hub/shared';
import { userService } from './service';
import { createUserSchema, updateUserSchema, userFilterSchema } from './types';

export const getUsers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const params = validateSchema(userFilterSchema, req.query);
  const { users, total } = await userService.findAll(params);

  const { createPaginationMeta } = await import('@cloudops-hub/shared');
  const pagination = createPaginationMeta(params, total);

  res.json({
    success: true,
    data: users,
    pagination,
  });
});

export const getUserStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const stats = await userService.getStats();
  res.json({ success: true, data: stats });
});

export const getUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await userService.findById(req.params.id);
  res.json({ success: true, data: user });
});

export const createUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(createUserSchema, req.body);
  const user = await userService.create(input, req.user!.id);

  res.status(201).json({
    success: true,
    data: user,
    message: 'User created successfully',
  });
});

export const updateUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = validateSchema(updateUserSchema, req.body);
  const user = await userService.update(req.params.id, input, req.user!.id);

  res.json({
    success: true,
    data: user,
    message: 'User updated successfully',
  });
});

export const deleteUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await userService.delete(req.params.id, req.user!.id);
  res.json({ success: true, message: 'User deleted successfully' });
});