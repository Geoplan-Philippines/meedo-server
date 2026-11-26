import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldCollection, FieldDefinition, FieldType, Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { requireCrmMembership } from '../crm-membership';
import { CreateFieldDefinitionDTO } from './dto/create-field-definition.dto';
import { ReorderFieldDefinitionsDTO } from './dto/reorder-field-definitions.dto';
import { UpdateFieldDefinitionDTO } from './dto/update-field-definition.dto';

@Injectable()
export class FieldDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFieldDefinitions(
    query: { collection: FieldCollection },
    organizationId: string,
    userId: string,
  ): Promise<FieldDefinition[]> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    return this.prisma.fieldDefinition.findMany({
      where: { organizationId, collection: query.collection },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  async createFieldDefinition(
    body: CreateFieldDefinitionDTO,
    organizationId: string,
    userId: string,
  ): Promise<FieldDefinition> {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    this.assertOptions(body.type, body.options ?? []);
    const position = await this.nextPosition(organizationId, body.collection);
    try {
      return await this.prisma.fieldDefinition.create({
        data: {
          organizationId,
          collection: body.collection,
          key: body.key,
          label: body.label.trim(),
          type: body.type,
          options: body.type === 'select' ? body.options ?? [] : [],
          isRequired: body.isRequired ?? false,
          isReadOnly: false,
          isSystem: false,
          position,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A field with this key already exists.');
      }
      throw error;
    }
  }

  async updateFieldDefinition(
    id: string,
    body: UpdateFieldDefinitionDTO,
    organizationId: string,
    userId: string,
  ): Promise<FieldDefinition> {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    const field = await this.find(id, organizationId);
    if (field.isSystem) throw new BadRequestException('System fields cannot be edited.');
    if (body.options !== undefined) this.assertOptions(field.type, body.options);
    return this.prisma.fieldDefinition.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label.trim() } : {}),
        ...(body.isRequired !== undefined ? { isRequired: body.isRequired } : {}),
        ...(body.options !== undefined ? { options: field.type === 'select' ? body.options : [] } : {}),
      },
    });
  }

  async reorderFieldDefinitions(
    body: ReorderFieldDefinitionsDTO,
    organizationId: string,
    userId: string,
  ): Promise<FieldDefinition[]> {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    const existing = await this.prisma.fieldDefinition.findMany({
      where: { organizationId, collection: body.collection },
      select: { id: true },
    });
    const existingIds = existing.map((field) => field.id).sort();
    const orderedIds = [...body.orderedIds];
    if (existingIds.length !== orderedIds.length || existingIds.join() !== [...orderedIds].sort().join()) {
      throw new BadRequestException('orderedIds must include every field in this collection exactly once.');
    }
    await this.prisma.$transaction(
      orderedIds.map((id, position) => this.prisma.fieldDefinition.update({ where: { id }, data: { position } })),
    );
    return this.prisma.fieldDefinition.findMany({
      where: { organizationId, collection: body.collection },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  async deleteFieldDefinition(id: string, organizationId: string, userId: string): Promise<{ id: string }> {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    const field = await this.find(id, organizationId);
    if (field.isSystem) throw new BadRequestException('System fields cannot be deleted.');
    await this.prisma.$transaction(async (tx) => {
      if (field.collection === 'lead') {
        await tx.$executeRaw`
          UPDATE "leads"
          SET "values" = COALESCE("values", '{}'::jsonb) - ${field.key}
          WHERE "organization_id" = ${organizationId}
        `;
      }
      await tx.fieldDefinition.delete({ where: { id } });
    });
    return { id };
  }

  private async find(id: string, organizationId: string): Promise<FieldDefinition> {
    const field = await this.prisma.fieldDefinition.findFirst({ where: { id, organizationId } });
    if (!field) throw new NotFoundException('Field definition not found in this organization.');
    return field;
  }

  private async nextPosition(organizationId: string, collection: FieldCollection): Promise<number> {
    const last = await this.prisma.fieldDefinition.findFirst({
      where: { organizationId, collection },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? -1) + 1;
  }

  private assertOptions(type: FieldType, options: string[]): void {
    if (type === 'select' && options.length === 0) {
      throw new BadRequestException('Select fields require at least one option.');
    }
    if (type !== 'select' && options.length > 0) {
      throw new BadRequestException('Only select fields may have options.');
    }
  }
}
