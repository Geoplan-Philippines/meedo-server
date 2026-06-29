import { Test, TestingModule } from '@nestjs/testing';
import { TicketCategoriesController } from './ticket-categories.controller';
import { TicketCategoriesService } from './services/ticket-categories.service';

describe('TicketCategoriesController', () => {
  let controller: TicketCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketCategoriesController],
      providers: [{ provide: TicketCategoriesService, useValue: {} }],
    }).compile();

    controller = module.get<TicketCategoriesController>(TicketCategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
