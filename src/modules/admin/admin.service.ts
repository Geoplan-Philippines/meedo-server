import { Injectable } from '@nestjs/common';
import { auth } from '../../core/auth/auth';
import { OnboardMemberDTO } from './dto/onboard-member.dto';

@Injectable()
export class AdminService {
  async onboardMember(dto: OnboardMemberDTO, callerHeaders: Headers) {
    const { user } = await auth.api.signUpEmail({
      body: {
        name: dto.name,
        email: dto.email,
        password: dto.password,
      },
      returnHeaders: false,
    });

    const member = await auth.api.addMember({
      body: {
        userId: user.id,
        role: dto.role ?? 'member',
        organizationId: dto.organizationId,
        teamId: dto.teamId,
      },
      headers: callerHeaders,
    });

    return { user, member };
  }
}
