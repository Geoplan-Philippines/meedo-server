import { PartialType } from '@nestjs/mapped-types';

import { CreateProjectDTO } from './create-project.dto';

/**
 * Every field on create is editable afterwards, including `key` — renaming it
 * changes how existing tickets render, but their numbers are untouched.
 */
export class UpdateProjectDTO extends PartialType(CreateProjectDTO) {}
