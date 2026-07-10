import { Injectable } from '@nestjs/common';
import { AttendancePolicy } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { UpdateAttendancePolicyDTO } from './dto/update-attendance-policy.dto';

@Injectable()
export class AttendancePolicyService {
  constructor(private prisma: PrismaService) {}

  /**
   * The org's single policy row, created with schema defaults on first access
   * (self-heal, like the system-statuses seed) so callers always get a policy.
   */
  async getPolicy(organizationId: string): Promise<AttendancePolicy> {
    return this.prisma.attendancePolicy.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
  }

  async updatePolicy(
    organizationId: string,
    data: UpdateAttendancePolicyDTO,
  ): Promise<AttendancePolicy> {
    // Upsert so an update before the first GET still works; `data` only carries
    // the whitelisted fields the caller actually sent.
    return this.prisma.attendancePolicy.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...data },
    });
  }
}
