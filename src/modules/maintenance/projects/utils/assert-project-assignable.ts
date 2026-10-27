import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const ARCHIVED_PROJECT_MESSAGE =
  'This project is archived because it no longer exists in Apptivo. Choose an active project.';

/**
 * Checks a project before a ticket, timesheet entry or SLA policy is pointed at it.
 * 404 when it is not in the organization; 400 when it is archived, unless the record
 * already uses this project (`currentProjectId`), so saving without changing the
 * project keeps working after the sync archives it.
 */
export async function assertProjectAssignable(
  db: Pick<Prisma.TransactionClient, 'project'>,
  projectId: string,
  organizationId: string,
  currentProjectId?: string | null,
): Promise<void> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, isArchived: true },
  });

  if (!project) {
    throw new NotFoundException('Project not found in this organization.');
  }

  if (project.isArchived && projectId !== currentProjectId) {
    throw new BadRequestException(ARCHIVED_PROJECT_MESSAGE);
  }
}
