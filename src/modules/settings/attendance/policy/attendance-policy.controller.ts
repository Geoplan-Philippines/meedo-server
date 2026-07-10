import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { AttendancePolicyService } from './attendance-policy.service';
import { UpdateAttendancePolicyDTO } from './dto/update-attendance-policy.dto';

@Controller('settings/attendance/policy')
export class AttendancePolicyController {
  constructor(private readonly policyService: AttendancePolicyService) {}

  @AllowAnonymous()
  @Get()
  getPolicy(@CurrentOrganizationId() organizationId: string) {
    return this.policyService.getPolicy(organizationId);
  }

  @AllowAnonymous()
  @Patch()
  updatePolicy(
    @Body() body: UpdateAttendancePolicyDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.policyService.updatePolicy(organizationId, body);
  }
}
