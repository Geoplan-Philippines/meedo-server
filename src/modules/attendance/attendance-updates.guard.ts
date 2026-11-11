import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceUpdateScope } from './attendance-updates.service';

export interface AttendanceUpdatesRequest {
  user?: { id?: string };
  session?: { session?: { activeOrganizationId?: string } };
  attendanceUpdateScope?: AttendanceUpdateScope;
}

/** Authorize before Nest flushes the SSE headers, so invalid scopes return 403. */
@Injectable()
export class AttendanceUpdatesGuard implements CanActivate {
  constructor(private readonly attendance: AttendanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AttendanceUpdatesRequest>();
    request.attendanceUpdateScope = await this.attendance.resolveUpdateScope(
      request.user?.id, request.session?.session?.activeOrganizationId,
    );
    return true;
  }
}
