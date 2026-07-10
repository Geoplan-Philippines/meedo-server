import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { auth } from '../../core/auth/auth';
import { prisma } from '../../core/database/prisma.client';
import { OnboardMemberDTO } from './dto/onboard-member.dto';
import { UpdateMemberDTO } from './dto/update-member.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  async onboardMember(dto: OnboardMemberDTO, organizationId: string) {
    // Validate the schedule up front so a bad id fails before any user is created.
    if (dto.weeklyScheduleId) {
      await this.assertScheduleInOrganization(dto.weeklyScheduleId, organizationId);
    }

    const { user } = await auth.api.signUpEmail({
      body: {
        name: dto.name,
        email: dto.email,
        password: dto.password,
      },
    });

    try {
      // better-auth's sign-up only accepts name/email/password, so persist the
      // employee code and biometrics ID separately. A unique-constraint clash
      // here rolls back the freshly created user via the catch below.
      if (dto.employeeCode || dto.biometricsId) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(dto.employeeCode ? { employeeCode: dto.employeeCode } : {}),
            ...(dto.biometricsId ? { biometricsId: dto.biometricsId } : {}),
          },
        });
      }

      const member = await auth.api.addMember({
        body: {
          userId: user.id,
          role: dto.role ?? 'member',
          organizationId,
          teamId: dto.teamId,
        },
      });

      if (dto.weeklyScheduleId) {
        await prisma.employeeScheduleAssignment.create({
          data: {
            organizationId,
            userId: user.id,
            weeklyScheduleId: dto.weeklyScheduleId,
          },
        });
      }

      return {
        user: {
          ...user,
          employeeCode: dto.employeeCode ?? null,
          biometricsId: dto.biometricsId ?? null,
        },
        member,
      };
    } catch (error) {
      // Roll back the orphaned user, but never let a cleanup failure mask the
      // original addMember error the caller actually needs to see.
      await prisma.user.delete({ where: { id: user.id } }).catch((cleanupError) => {
        this.logger.error(
          `Failed to roll back user ${user.id} after addMember failed`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        );
      });
      throw error;
    }
  }

  async getMember(memberId: string, organizationId: string) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeCode: true,
            biometricsId: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Organization member not found');
    }

    const [teamMember, scheduleAssignment] = await Promise.all([
      prisma.teamMember.findFirst({
        where: {
          userId: member.userId,
          team: { organizationId },
        },
        orderBy: { createdAt: 'asc' },
        select: { teamId: true },
      }),
      prisma.employeeScheduleAssignment.findUnique({
        where: { organizationId_userId: { organizationId, userId: member.userId } },
        select: { weeklyScheduleId: true },
      }),
    ]);

    return {
      ...member,
      teamId: teamMember?.teamId ?? null,
      weeklyScheduleId: scheduleAssignment?.weeklyScheduleId ?? null,
    };
  }

  async updateMember(
    memberId: string,
    dto: UpdateMemberDTO,
    organizationId: string,
  ) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId },
      select: {
        id: true,
        userId: true,
        role: true,
        user: { select: { email: true } },
      },
    });

    if (!member) {
      throw new NotFoundException('Organization member not found');
    }

    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('Name cannot be empty');
    }

    if (dto.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: dto.teamId, organizationId },
        select: { id: true },
      });
      if (!team) {
        throw new BadRequestException('Team does not belong to the active organization');
      }
    }

    if (dto.weeklyScheduleId) {
      await this.assertScheduleInOrganization(dto.weeklyScheduleId, organizationId);
    }

    const userData: Prisma.UserUpdateInput = {
      ...(dto.name !== undefined ? { name } : {}),
      ...(dto.email !== undefined
        ? {
            email: dto.email.trim().toLowerCase(),
            ...(dto.email.trim().toLowerCase() !== member.user.email.toLowerCase()
              ? { emailVerified: false }
              : {}),
          }
        : {}),
      ...(dto.employeeCode !== undefined
        ? { employeeCode: this.normalizeOptionalValue(dto.employeeCode) }
        : {}),
      ...(dto.biometricsId !== undefined
        ? { biometricsId: this.normalizeOptionalValue(dto.biometricsId) }
        : {}),
    };

    await prisma.$transaction(async (transaction) => {
      if (Object.keys(userData).length > 0) {
        await transaction.user.update({
          where: { id: member.userId },
          data: userData,
        });
      }

      if (dto.teamId !== undefined) {
        await transaction.teamMember.deleteMany({
          where: {
            userId: member.userId,
            team: { organizationId },
          },
        });

        if (dto.teamId) {
          await transaction.teamMember.create({
            data: {
              userId: member.userId,
              teamId: dto.teamId,
            },
          });
        }
      }

      if (dto.weeklyScheduleId !== undefined) {
        if (dto.weeklyScheduleId === null) {
          await transaction.employeeScheduleAssignment.deleteMany({
            where: { organizationId, userId: member.userId },
          });
        } else {
          await transaction.employeeScheduleAssignment.upsert({
            where: { organizationId_userId: { organizationId, userId: member.userId } },
            create: {
              organizationId,
              userId: member.userId,
              weeklyScheduleId: dto.weeklyScheduleId,
            },
            update: { weeklyScheduleId: dto.weeklyScheduleId },
          });
        }
      }
    });

    return this.getMember(memberId, organizationId);
  }

  private async assertScheduleInOrganization(
    weeklyScheduleId: string,
    organizationId: string,
  ): Promise<void> {
    const schedule = await prisma.weeklySchedule.findFirst({
      where: { id: weeklyScheduleId, organizationId },
      select: { id: true },
    });
    if (!schedule) {
      throw new BadRequestException('Weekly schedule does not belong to the active organization');
    }
  }

  private normalizeOptionalValue(value: string | null): string | null {
    return value?.trim() || null;
  }
}
