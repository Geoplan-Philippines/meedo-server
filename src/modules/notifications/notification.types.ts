export const NOTIFICATION_TYPES = {
  projectMemberAdded: 'project_member_added',
  projectMemberRemoved: 'project_member_removed',
  ticketAssigned: 'ticket_assigned',
  ticketStatusChanged: 'ticket_status_changed',
  ticketComment: 'ticket_comment',
  projectArchived: 'project_archived',
  timesheetSubmitted: 'timesheet_submitted',
  timesheetApproved: 'timesheet_approved',
  timesheetRejected: 'timesheet_rejected',
  timesheetEditedByAdmin: 'timesheet_edited_by_admin',
} as const;
export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
export interface CreateNotification {
  organizationId: string;
  recipientUserId: string;
  actorUserId?: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  entityType: string;
  entityId: string;
}
