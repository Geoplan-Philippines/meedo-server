import { Prisma } from '@prisma/client';

export interface WorkOrder {
  id: string | number;
  workOrderNumber?: string;
  customerName?: string;
  customerId?: string | number;
  statusName?: string;
  total?: string | number;
  reportedDate?: string;
}

export interface Customer {
  customerId: string | number;
  customerName?: string;
}

export type ProjectInput = Omit<Prisma.ProjectCreateInput, 'organization' | 'tickets' | 'client'>;

export type ClientInput = Omit<Prisma.ClientCreateInput, 'organization' | 'projects'>;

export type ApptivoResponse<T = unknown> = {
  data?: T[];
};
