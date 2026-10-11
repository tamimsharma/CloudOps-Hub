// Pagination utilities
import { PaginationParams } from './validation';

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function paginate<T>(
  data: T[],
  params: PaginationParams
): PaginatedResponse<T> {
  const { page = 1, limit = 20 } = params;
  const total = data.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    data: data.slice(start, end),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

export function createPaginationMeta(params: PaginationParams, total: number) {
  const { page = 1, limit = 20 } = params;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function applySorting<T>(
  data: T[],
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
): T[] {
  if (!sortBy) return data;

  return [...data].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sortBy];
    const bVal = (b as Record<string, unknown>)[sortBy];

    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal < bVal ? -1 : 1;
    return sortOrder === 'desc' ? -comparison : comparison;
  });
}

export function applyFilters<T>(
  data: T[],
  filters: Record<string, unknown>,
  filterFn: (item: T, filters: Record<string, unknown>) => boolean
): T[] {
  return data.filter((item) => filterFn(item, filters));
}