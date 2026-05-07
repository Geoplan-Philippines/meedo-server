import { Test, TestingModule } from '@nestjs/testing';
import { TicketCategoriesController } from './ticket-categories.controller';
import { TicketCategoriesService } from './ticket-categories.service';

describe('TicketCategoriesController', () => {
  let controller: TicketCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketCategoriesController],
      providers: [TicketCategoriesService],
    }).compile();

    controller = module.get<TicketCategoriesController>(TicketCategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
