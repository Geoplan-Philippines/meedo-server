import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Shift } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { CreateShiftDTO } from './dto/create-shift.dto';
import { UpdateShiftDTO } from './dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

  /** Active shifts first, then archived; ordered by start time then name. */
  async getShifts(organizationId: string): Promise<Shift[]> {
    return this.prisma.shift.findMany({
      where: { organizationId },
      orderBy: [{ isArchived: 'asc' }, { startTime: 'asc' }, { name: 'asc' }],
    });
  }

  async createShift(data: CreateShiftDTO, organizationId: string): Promise<Shift> {
    const name = data.name.trim();
    await this.assertNameAvailable(organizationId, name);

    return this.prisma.shift.create({
      data: {
        name,
        startTime: data.startTime,
        endTime: data.endTime,
        breakMinutes: data.breakMinutes ?? 60,
        graceMinutes: data.graceMinutes ?? null,
        crossesMidnight: data.crossesMidnight ?? false,
        isFlexible: data.isFlexible ?? false,
        ...(data.color !== undefined ? { color: data.color } : {}),
        organization: { connect: { id: organizationId } },
      },
    });
  }

  async updateShift(id: string, data: UpdateShiftDTO, organizationId: string): Promise<Shift> {
    await this.getOwnedShift(id, organizationId);

    const name = data.name?.trim();
    if (name) {
      await this.assertNameAvailable(organizationId, name, id);
    }

    return this.prisma.shift.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
        ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
        ...(data.breakMinutes !== undefined ? { breakMinutes: data.breakMinutes } : {}),
        ...(data.graceMinutes !== undefined ? { graceMinutes: data.graceMinutes } : {}),
        ...(data.crossesMidnight !== undefined ? { crossesMidnight: data.crossesMidnight } : {}),
        ...(data.isFlexible !== undefined ? { isFlexible: data.isFlexible } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
    });
  }

  /** Archived shifts are hidden from pickers but preserved so schedules keep their reference. */
  async archiveShift(id: string, organizationId: string): Promise<Shift> {
    await this.getOwnedShift(id, organizationId);
    return this.prisma.shift.update({
      where: { id },
      data: { isArchived: true, isActive: false },
    });
  }

  async restoreShift(id: string, organizationId: string): Promise<Shift> {
    await this.getOwnedShift(id, organizationId);
    return this.prisma.shift.update({
      where: { id },
      data: { isArchived: false, isActive: true },
    });
  }

  private async getOwnedShift(id: string, organizationId: string): Promise<Shift> {
    const shift = await this.prisma.shift.findFirst({ where: { id, organizationId } });
    if (!shift) {
      throw new NotFoundException('Shift not found in this organization.');
    }
    return shift;
  }

  private async assertNameAvailable(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.shift.findFirst({
      where: { organizationId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`A shift named "${name}" already exists.`);
    }
  }
}
