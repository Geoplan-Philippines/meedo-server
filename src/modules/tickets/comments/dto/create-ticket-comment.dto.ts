import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { TICKET_COMMENT_MAX_LENGTH } from '../../constants/ticket.constants';

export class CreateTicketCommentDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TICKET_COMMENT_MAX_LENGTH)
  body!: string;

  /** When set, the new comment is a reply to this (top-level) comment. */
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
