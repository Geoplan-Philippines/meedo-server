import { ApiProperty } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';

class ProjectClientDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Admin-set name; null means the Apptivo customer name is shown' })
  displayName!: string | null;

  @ApiProperty({ description: 'Shown name: displayName, else customerName' })
  name!: string;

  @ApiProperty()
  isArchived!: boolean;
}

export class ProjectResponseDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Shown name: displayName, else quoteSubject, else workOrderNumber' })
  name!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Admin-set name; never written by the Apptivo sync' })
  displayName!: string | null;

  @ApiProperty()
  workOrderNumber!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty({ nullable: true, type: String })
  reportedDate!: Date | null;

  @ApiProperty({ nullable: true, type: String, description: 'Subject of the Apptivo sales quote this work order was converted from' })
  quoteSubject!: string | null;

  @ApiProperty({ nullable: true, type: String, description: "Apptivo work order fromObjectRefId (the source quote's record id)" })
  apptivoQuoteRefId!: string | null;

  @ApiProperty()
  apptivoId!: string;

  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ nullable: true, type: String })
  clientId!: string | null;

  @ApiProperty({ description: 'true when an admin set the client by hand; the Apptivo sync then leaves it alone' })
  clientLocked!: boolean;

  @ApiProperty()
  isArchived!: boolean;

  @ApiProperty({ nullable: true, type: Date })
  archivedAt!: Date | null;

  @ApiProperty({ type: ProjectClientDTO, nullable: true })
  client!: ProjectClientDTO | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

class EffectiveSlaPolicyDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: TicketPriority })
  priority!: TicketPriority;

  @ApiProperty()
  firstResponseMinutes!: number;

  @ApiProperty()
  resolutionMinutes!: number;

  @ApiProperty({ nullable: true, type: String })
  projectId!: string | null;

  @ApiProperty({ enum: ['project', 'organization'], description: 'project = policy for this project; organization = org default' })
  scope!: 'project' | 'organization';
}

class ProjectHistoryActorDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: Object, description: '{ name, email } of the member' })
  user!: { name: string | null; email: string };
}

class ProjectHistoryEntryDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: Object, description: '{ field: { from, to } }' })
  changes!: Record<string, { from: unknown; to: unknown }>;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: ProjectHistoryActorDTO, nullable: true })
  actor!: ProjectHistoryActorDTO | null;
}

export class ProjectDetailDTO extends ProjectResponseDTO {
  @ApiProperty({ description: 'Non-archived tickets linked to the project' })
  ticketCount!: number;

  @ApiProperty({ description: 'Linked tickets that are not resolved yet' })
  openTicketCount!: number;

  @ApiProperty({ description: 'Hours across all timesheet entries on the project' })
  timesheetHours!: number;

  @ApiProperty({ description: 'Hours across approved timesheet entries' })
  approvedTimesheetHours!: number;

  @ApiProperty({ type: EffectiveSlaPolicyDTO, isArray: true, description: 'Policy each priority uses for this project' })
  slaPolicies!: EffectiveSlaPolicyDTO[];

  @ApiProperty({ type: ProjectHistoryEntryDTO, isArray: true, description: 'Latest admin edits, newest first' })
  history!: ProjectHistoryEntryDTO[];
}
