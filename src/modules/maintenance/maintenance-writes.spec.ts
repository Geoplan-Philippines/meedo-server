import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PrismaService } from "../../core/database/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ClientsController } from "./clients/clients.controller";
import { ClientsService } from "./clients/clients.service";
import { ProjectsController } from "./projects/projects.controller";
import { ProjectsService } from "./projects/projects.service";
import { TicketCategoriesController } from "./ticket-categories/ticket-categories.controller";
import { TicketCategoriesService } from "./ticket-categories/services/ticket-categories.service";

const id = "11111111-1111-4111-8111-111111111111";
const org = "example-org";
const row = {
  id,
  organizationId: org,
  displayName: "Example",
  customerName: null,
  clientId: id,
  client: null,
  isArchived: false,
  _count: { projects: 0 },
};
const writes = [
  ["post", "/projects", { name: "Example", clientId: id }],
  ["patch", `/projects/${id}`, { displayName: "Renamed" }],
  ["post", `/projects/${id}/members`, { userId: id }],
  ["delete", `/projects/${id}/members/${id}`, undefined],
  ["patch", `/projects/${id}/closed`, { isClosed: true }],
  ["patch", `/projects/${id}/archive`, { isArchived: true }],
  ["post", "/projects/sync", {}],
  ["post", "/clients", { name: "Example" }],
  ["patch", `/clients/${id}`, { displayName: "Renamed" }],
  ["post", "/clients/sync", {}],
  ["post", "/ticket-categories", { name: "Example" }],
  ["patch", `/ticket-categories/${id}`, { name: "Renamed" }],
  ["delete", `/ticket-categories/${id}`, undefined],
] as const;

describe("Every maintenance write checks the acting organization role", () => {
  let app: INestApplication;
  let role = "member";
  let syncProjects: jest.SpyInstance;
  let syncClients: jest.SpyInstance;
  const delegate = () => ({
    findFirst: jest.fn().mockResolvedValue(row),
    create: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue(row),
    delete: jest.fn().mockResolvedValue(row),
    findUniqueOrThrow: jest.fn().mockResolvedValue(row),
    groupBy: jest.fn().mockResolvedValue([]),
  });
  const db = {
    member: { findUnique: jest.fn(async () => ({ id: "actor-member", role })) },
    project: delegate(),
    client: delegate(),
    ticketCategory: delegate(),
    projectMember: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    maintenanceAuditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  beforeAll(async () => {
    db.$transaction.mockImplementation((run) => run(db));
    const module = await Test.createTestingModule({
      controllers: [
        ProjectsController,
        ClientsController,
        TicketCategoriesController,
      ],
      providers: [
        ProjectsService,
        ClientsService,
        TicketCategoriesService,
        { provide: PrismaService, useValue: db },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn(), createMany: jest.fn() },
        },
      ],
    }).compile();
    // Exercise real HTTP routing and real role checks; stub only external Apptivo work.
    syncProjects = jest
      .spyOn(module.get(ProjectsService), "syncWorkOrdersFromApptivo")
      .mockResolvedValue({} as never);
    syncClients = jest
      .spyOn(module.get(ClientsService), "syncClientsFromApptivo")
      .mockResolvedValue({} as never);
    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.user = { id: "actor-user" };
      req.session = { user: req.user, session: { activeOrganizationId: org } };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  for (const [method, path, body] of writes) {
    it.each(["member", "admin", "owner"])(
      `${method.toUpperCase()} ${path} for %s`,
      async (actorRole) => {
        role = actorRole;
        const response = await request(app.getHttpServer())
          [method]("/maintenance" + path)
          .send(body);
        expect(response.status).toBe(
          role === "member" ? 403 : method === "post" ? 201 : 200,
        );
        expect(db.member.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId_userId: {
                organizationId: org,
                userId: "actor-user",
              },
            },
          }),
        );
        if (role === "member") {
          for (const entity of [db.project, db.client, db.ticketCategory]) {
            expect(entity.create).not.toHaveBeenCalled();
            expect(entity.update).not.toHaveBeenCalled();
            expect(entity.delete).not.toHaveBeenCalled();
          }
          expect(db.projectMember.createMany).not.toHaveBeenCalled();
          expect(db.projectMember.deleteMany).not.toHaveBeenCalled();
          expect(syncProjects).not.toHaveBeenCalled();
          expect(syncClients).not.toHaveBeenCalled();
        }
      },
    );
  }
});
