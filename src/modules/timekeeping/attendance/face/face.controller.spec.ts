import { Test, TestingModule } from '@nestjs/testing';
import { FaceController } from './face.controller';
import { FaceService } from './face.service';

describe('FaceController', () => {
  let controller: FaceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FaceController],
      providers: [FaceService],
    }).compile();

    controller = module.get<FaceController>(FaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
