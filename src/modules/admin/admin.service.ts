import { Injectable, Logger } from '@nestjs/common';
import { auth } from '../../core/auth/auth';
import { prisma } from '../../core/database/prisma.client';
import { OnboardMemberDTO } from './dto/onboard-member.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  async onboardMember(dto: OnboardMemberDTO, organizationId: string) {
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
}
