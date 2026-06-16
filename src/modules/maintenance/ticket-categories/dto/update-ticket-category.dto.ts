import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketCategoryDTO } from './create-ticket-category.dto';

export class UpdateTicketCategoryDTO extends PartialType(CreateTicketCategoryDTO) {}
