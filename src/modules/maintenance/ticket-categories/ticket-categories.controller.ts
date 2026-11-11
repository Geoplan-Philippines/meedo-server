import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseUUIDPipe,
} from "@nestjs/common";

import { TicketCategory } from "@prisma/client";
import { AllowAnonymous, OrgRoles } from "@thallesp/nestjs-better-auth";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";

import { TicketCategoriesService } from "./services/ticket-categories.service";
import { CreateTicketCategoryDTO } from "./dto/create-ticket-category.dto";
import { UpdateTicketCategoryDTO } from "./dto/update-ticket-category.dto";
import { CurrentOrganizationId } from "../../../common/decorators/current-organization-id.decorator";

@Controller("maintenance/ticket-categories")
export class TicketCategoriesController {
  constructor(
    private readonly ticketCategoriesService: TicketCategoriesService,
  ) {}

  @AllowAnonymous()
  @Post()
  @OrgRoles(["owner", "admin"])
  async createTicketCategory(
    @Body() body: CreateTicketCategoryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser("id") userId: string,
  ): Promise<TicketCategory> {
    return this.ticketCategoriesService.createTicketCategory(
      body,
      organizationId,
      userId,
    );
  }

  @AllowAnonymous()
  @Get()
  async getAllTicketCategories(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TicketCategory[]> {
    return this.ticketCategoriesService.getAllTicketCategories(organizationId);
  }

  @AllowAnonymous()
  @Patch(":id")
  @OrgRoles(["owner", "admin"])
  async updateTicketCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateTicketCategoryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser("id") userId: string,
  ): Promise<TicketCategory> {
    return this.ticketCategoriesService.updateTicketCategory(
      id,
      body,
      organizationId,
      userId,
    );
  }

  @AllowAnonymous()
  @Delete(":id")
  @OrgRoles(["owner", "admin"])
  async deleteTicketCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser("id") userId: string,
  ): Promise<TicketCategory> {
    return this.ticketCategoriesService.deleteTicketCategory(
      id,
      organizationId,
      userId,
    );
  }
}
