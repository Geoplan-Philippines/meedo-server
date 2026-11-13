import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TicketCategory } from "@prisma/client";

import { PaginatedResponse } from "../../../../common/responses/paginated-api.response";
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from "../../../../common/utils/pagination.util";
import { GetTicketCategoriesQueryDTO } from "../dto/get-ticket-categories-query.dto";

import { PrismaService } from "../../../../core/database/prisma.service";
import { CreateTicketCategoryDTO } from "../dto/create-ticket-category.dto";
import { UpdateTicketCategoryDTO } from "../dto/update-ticket-category.dto";
import { resolveAdminActor } from "../../audit/maintenance-audit";

@Injectable()
export class TicketCategoriesService {
  constructor(private prisma: PrismaService) {}

  async createTicketCategory(
    createTicketCategoryDTO: CreateTicketCategoryDTO,
    organizationId: string,
    userId?: string,
  ): Promise<TicketCategory> {
    await resolveAdminActor(this.prisma, organizationId, userId);
    return this.prisma.ticketCategory.create({
      data: {
        name: createTicketCategoryDTO.name,
        description: createTicketCategoryDTO.description,
        organization: {
          connect: {
            id: organizationId,
          },
        },
      },
    });
  }

  async getAllTicketCategories(
    query: GetTicketCategoriesQueryDTO,
    organizationId: string,
  ): Promise<PaginatedResponse<TicketCategory>> {
    const where: Prisma.TicketCategoryWhereInput = {
      organizationId,
      ...termSearchWhere<Prisma.TicketCategoryWhereInput>(query.search, (term) => [
        { name: containsInsensitive(term) },
        { description: containsInsensitive(term) },
      ]),
    };
    const field = query.sortField ?? "name";
    const order = query.sortOrder ?? (field === "createdAt" ? "desc" : "asc");
    const [categories, total] = await Promise.all([
      this.prisma.ticketCategory.findMany({ where, orderBy: [{ [field]: order }, { id: "asc" }], ...pageArgs(query) }),
      this.prisma.ticketCategory.count({ where }),
    ]);
    return toPage(categories, total, query);
  }

  async updateTicketCategory(
    id: string,
    data: UpdateTicketCategoryDTO,
    organizationId: string,
    userId?: string,
  ): Promise<TicketCategory> {
    await resolveAdminActor(this.prisma, organizationId, userId);
    await this.ensureExists(id, organizationId);
    return this.prisma.ticketCategory.update({
      where: { id },
      data,
    });
  }

  async deleteTicketCategory(
    id: string,
    organizationId: string,
    userId?: string,
  ): Promise<TicketCategory> {
    await resolveAdminActor(this.prisma, organizationId, userId);
    await this.ensureExists(id, organizationId);
    return this.prisma.ticketCategory.delete({
      where: { id },
    });
  }

  private async ensureExists(
    id: string,
    organizationId: string,
  ): Promise<void> {
    const category = await this.prisma.ticketCategory.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException(
        "Ticket category not found in this organization.",
      );
    }
  }
}
