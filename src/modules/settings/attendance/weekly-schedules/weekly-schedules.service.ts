import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { CreateWeeklyScheduleDTO } from './dto/create-weekly-schedule.dto';
import { SetScheduleDaysDTO } from './dto/set-schedule-days.dto';
import { UpdateWeeklyScheduleDTO } from './dto/update-weekly-schedule.dto';
import { WeeklyScheduleDayDTO } from './dto/weekly-schedule-day.dto';

const SCHEDULE_INCLUDE = {
  days: {
    include: { shift: true },
    orderBy: { dayOfWeek: 'asc' },
  },
  // Assignment counts let the client show "in use" and block deletion.
  _count: { select: { teamAssignments: true, employeeAssignments: true } },
} satisfies Prisma.WeeklyScheduleInclude;

type WeeklyScheduleWithDays = Prisma.WeeklyScheduleGetPayload<{ include: typeof SCHEDULE_INCLUDE }>;

@Injectable()
export class WeeklySchedulesService {
  constructor(private prisma: PrismaService) {}

  /** Default schedule first, then alphabetical. */
  async getSchedules(organizationId: string): Promise<WeeklyScheduleWithDays[]> {
    return this.prisma.weeklySchedule.findMany({
      where: { organizationId },
      include: SCHEDULE_INCLUDE,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getSchedule(id: string, organizationId: string): Promise<WeeklyScheduleWithDays> {
    const schedule = await this.prisma.weeklySchedule.findFirst({
      where: { id, organizationId },
      include: SCHEDULE_INCLUDE,
    });
    if (!schedule) {
      throw new NotFoundException('Weekly schedule not found in this organization.');
    }
    return schedule;
  }

  async createSchedule(
    data: CreateWeeklyScheduleDTO,
    organizationId: string,
  ): Promise<WeeklyScheduleWithDays> {
    const name = data.name.trim();
    await this.assertNameAvailable(organizationId, name);
    if (data.days) {
      await this.validateDays(organizationId, data.days);
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.weeklySchedule.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.weeklySchedule.create({
        data: {
          name,
          isDefault: data.isDefault ?? false,
          organization: { connect: { id: organizationId } },
          ...(data.days ? { days: { create: data.days.map(toDayCreate) } } : {}),
        },
        include: SCHEDULE_INCLUDE,
      });
    });
  }

  async updateSchedule(
    id: string,
    data: UpdateWeeklyScheduleDTO,
    organizationId: string,
  ): Promise<WeeklyScheduleWithDays> {
    await this.assertOwned(id, organizationId);

    const name = data.name?.trim();
    if (name) {
      await this.assertNameAvailable(organizationId, name, id);
    }

    return this.prisma.weeklySchedule.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: SCHEDULE_INCLUDE,
    });
  }

  /** Replace the schedule's entire week atomically. */
  async setDays(
    id: string,
    data: SetScheduleDaysDTO,
    organizationId: string,
  ): Promise<WeeklyScheduleWithDays> {
    await this.assertOwned(id, organizationId);
    await this.validateDays(organizationId, data.days);

    return this.prisma.$transaction(async (tx) => {
      await tx.weeklyScheduleDay.deleteMany({ where: { weeklyScheduleId: id } });
      if (data.days.length > 0) {
        await tx.weeklyScheduleDay.createMany({
          data: data.days.map((day) => ({ weeklyScheduleId: id, ...toDayCreate(day) })),
        });
      }
      return tx.weeklySchedule.findUniqueOrThrow({ where: { id }, include: SCHEDULE_INCLUDE });
    });
  }

  /** Promote a schedule to the org default, demoting any current default. */
  async setDefault(id: string, organizationId: string): Promise<WeeklyScheduleWithDays> {
    await this.assertOwned(id, organizationId);

    return this.prisma.$transaction(async (tx) => {
      await tx.weeklySchedule.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return tx.weeklySchedule.update({
        where: { id },
        data: { isDefault: true },
        include: SCHEDULE_INCLUDE,
      });
    });
  }

  /** Delete a schedule only when nothing references it (its days cascade away). */
  async deleteSchedule(id: string, organizationId: string): Promise<{ id: string }> {
    await this.assertOwned(id, organizationId);

    const [teamCount, employeeCount] = await Promise.all([
      this.prisma.teamScheduleAssignment.count({ where: { weeklyScheduleId: id } }),
      this.prisma.employeeScheduleAssignment.count({ where: { weeklyScheduleId: id } }),
    ]);

    if (teamCount + employeeCount > 0) {
      const parts: string[] = [];
      if (teamCount > 0) parts.push(`${teamCount} team${teamCount === 1 ? '' : 's'}`);
      if (employeeCount > 0) {
        parts.push(`${employeeCount} employee${employeeCount === 1 ? '' : 's'}`);
      }
      throw new BadRequestException(
        `This schedule is still assigned to ${parts.join(' and ')}. Reassign them before deleting it.`,
      );
    }

    await this.prisma.weeklySchedule.delete({ where: { id } });
    return { id };
  }

  private async assertOwned(id: string, organizationId: string): Promise<void> {
    const schedule = await this.prisma.weeklySchedule.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!schedule) {
      throw new NotFoundException('Weekly schedule not found in this organization.');
    }
  }

  private async assertNameAvailable(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.weeklySchedule.findFirst({
      where: { organizationId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`A schedule named "${name}" already exists.`);
    }
  }

  /**
   * Enforce the day-shape rules: one entry per weekday, a working day needs a
   * shift, a rest day must not carry one, and every referenced shift belongs to
   * the organization.
   */
  private async validateDays(
    organizationId: string,
    days: WeeklyScheduleDayDTO[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (const day of days) {
      if (seen.has(day.dayOfWeek)) {
        throw new BadRequestException(`Duplicate entry for ${day.dayOfWeek}.`);
      }
      seen.add(day.dayOfWeek);

      if (day.isWorkingDay && !day.shiftId) {
        throw new BadRequestException(`${day.dayOfWeek} is a working day and requires a shift.`);
      }
      if (!day.isWorkingDay && day.shiftId) {
        throw new BadRequestException(`${day.dayOfWeek} is a rest day and cannot have a shift.`);
      }
    }

    const shiftIds = [...new Set(days.flatMap((day) => (day.shiftId ? [day.shiftId] : [])))];
    if (shiftIds.length > 0) {
      const count = await this.prisma.shift.count({
        where: { id: { in: shiftIds }, organizationId },
      });
      if (count !== shiftIds.length) {
        throw new BadRequestException('One or more shifts do not belong to this organization.');
      }
    }
  }
}

function toDayCreate(day: WeeklyScheduleDayDTO) {
  return {
    dayOfWeek: day.dayOfWeek,
    isWorkingDay: day.isWorkingDay,
    expectedSource: day.expectedSource ?? null,
    shiftId: day.shiftId ?? null,
    trackLateness: day.trackLateness ?? true,
  };
}
