import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, interval, map, merge } from 'rxjs';
import { AttendanceUpdateTarget } from './biometrics/biometrics.constants';

export type AttendanceUpdateReason = 'biometric' | 'manual' | 'auto-clock-out';

@Injectable()
export class AttendanceUpdatesService implements OnModuleDestroy {
  private readonly updates = new Subject<MessageEvent>();
  private readonly pendingReasons = new Set<AttendanceUpdateReason>();
  private readonly pendingTargets = new Map<string, AttendanceUpdateTarget>();
  private pendingGlobalUpdate = false;
  private emitTimer: NodeJS.Timeout | null = null;

  notify(reason: AttendanceUpdateReason, targets: AttendanceUpdateTarget[] = []): void {
    this.pendingReasons.add(reason);
    if (targets.length === 0) this.pendingGlobalUpdate = true;
    for (const target of targets) {
      this.pendingTargets.set(`${target.employeeId}:${target.date}`, target);
    }
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => {
      this.updates.next({
        type: 'attendance.updated',
        data: {
          reasons: [...this.pendingReasons],
          affected: this.pendingGlobalUpdate ? [] : [...this.pendingTargets.values()],
          timestamp: new Date().toISOString(),
        },
      });
      this.pendingReasons.clear();
      this.pendingTargets.clear();
      this.pendingGlobalUpdate = false;
      this.emitTimer = null;
    }, 750);
  }

  stream(): Observable<MessageEvent> {
    const heartbeat = interval(15_000).pipe(
      map((): MessageEvent => ({
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      })),
    );
    return merge(this.updates.asObservable(), heartbeat);
  }

  onModuleDestroy(): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.updates.complete();
  }
}
