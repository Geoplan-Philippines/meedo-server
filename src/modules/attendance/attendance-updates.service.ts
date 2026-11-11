import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge } from 'rxjs';
import { PrismaService } from '../../core/database/prisma.service';
import { AttendanceUpdateTarget } from './biometrics/biometrics.constants';

export type AttendanceUpdateReason = 'biometric' | 'manual' | 'auto-clock-out';
export interface AttendanceUpdateScope {
  userId: string;
  organizationId: string;
  isManager: boolean;
}
interface ScopedTarget extends AttendanceUpdateTarget {
  organizationId: string | null;
  reason: AttendanceUpdateReason;
}

@Injectable()
export class AttendanceUpdatesService implements OnModuleDestroy {
  private readonly updates = new Subject<ScopedTarget[]>();
  private readonly pendingTargets = new Map<string, ScopedTarget>();
  private emitTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Sessionless writers resolve every membership; unknown scope is self-only. */
  async notifyEmployees(reason: AttendanceUpdateReason, targets: AttendanceUpdateTarget[]): Promise<void> {
    if (!targets.length) return;
    const members = await this.prisma.member.findMany({
      where: { userId: { in: [...new Set(targets.map((target) => target.employeeId))] } },
      select: { userId: true, organizationId: true },
    });
    for (const target of targets) {
      const organizations = members.filter((member) => member.userId === target.employeeId);
      this.notify(reason, organizations.length
        ? organizations.map((member) => ({ ...target, organizationId: member.organizationId }))
        : [{ ...target, organizationId: null }]);
    }
  }

  private notify(reason: AttendanceUpdateReason, targets: Omit<ScopedTarget, 'reason'>[]): void {
    for (const target of targets) {
      this.pendingTargets.set(`${target.organizationId}:${target.employeeId}:${target.date}:${reason}`, { ...target, reason });
    }
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => {
      const targets = [...this.pendingTargets.values()];
      this.pendingTargets.clear();
      this.emitTimer = null;
      this.updates.next(targets);
    }, 750);
  }

  stream(scope: AttendanceUpdateScope): Observable<MessageEvent> {
    // Membership/role is resolved once when opening; demotion applies on reconnect.
    const canDeliver = (target: ScopedTarget) => target.organizationId === null
      ? target.employeeId === scope.userId
      : target.organizationId === scope.organizationId && (scope.isManager || target.employeeId === scope.userId);
    const visible = this.updates.pipe(
      map((targets) => targets.filter(canDeliver)),
      filter((targets) => targets.length > 0),
      map((targets): MessageEvent => ({
        type: 'attendance.updated',
        data: {
          reasons: [...new Set(targets.map((target) => target.reason))],
          affected: [...new Map(targets.map(({ employeeId, date }) => [`${employeeId}:${date}`, { employeeId, date }])).values()],
          timestamp: new Date().toISOString(),
        },
      })),
    );
    const heartbeat = interval(15_000).pipe(map((): MessageEvent => ({
      type: 'heartbeat', data: { timestamp: new Date().toISOString() },
    })));
    // RxJS teardown removes the Subject observer and heartbeat timer on disconnect.
    return merge(visible, heartbeat);
  }

  onModuleDestroy(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.pendingTargets.clear();
    this.updates.complete();
  }
}
