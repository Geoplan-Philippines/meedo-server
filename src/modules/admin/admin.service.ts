import { Injectable } from '@nestjs/common';
import { auth } from '../../core/auth/auth';
import { prisma } from '../../core/database/prisma.client';
import { OnboardMemberDTO } from './dto/onboard-member.dto';

@Injectable()
export class AdminService {
  async onboardMember(dto: OnboardMemberDTO, organizationId: string) {
    const { user } = await auth.api.signUpEmail({
      body: {
        name: dto.name,
        email: dto.email,
        password: dto.password,
      },
    });

    try {
      const member = await auth.api.addMember({
        body: {
          userId: user.id,
          role: dto.role ?? 'member',
          organizationId,
          teamId: dto.teamId,
        },
      });

      return { user, member };
    } catch (error) {
      await prisma.user.delete({ where: { id: user.id } });
      throw error;
    }
  }
}
