import { Test, TestingModule } from '@nestjs/testing';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersController', () => {
  let controller: WorkOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkOrdersController],
      providers: [{ provide: WorkOrdersService, useValue: {} }],
    }).compile();

    controller = module.get<WorkOrdersController>(WorkOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
