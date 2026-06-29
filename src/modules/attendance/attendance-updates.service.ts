import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, interval, map, merge } from 'rxjs';

export type AttendanceUpdateReason = 'biometric' | 'manual' | 'auto-clock-out';

@Injectable()
export class AttendanceUpdatesService implements OnModuleDestroy {
  private readonly updates = new Subject<MessageEvent>();
  private readonly pendingReasons = new Set<AttendanceUpdateReason>();
  private emitTimer: NodeJS.Timeout | null = null;

  notify(reason: AttendanceUpdateReason): void {
    this.pendingReasons.add(reason);
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => {
      this.updates.next({
        type: 'attendance.updated',
        data: {
          reasons: [...this.pendingReasons],
          timestamp: new Date().toISOString(),
        },
      });
      this.pendingReasons.clear();
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
