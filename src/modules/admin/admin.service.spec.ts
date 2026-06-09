import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { auth } from '../../core/auth/auth';

jest.mock('../../core/auth/auth', () => ({
  auth: {
    api: {
      signUpEmail: jest.fn(),
      addMember: jest.fn(),
    },
  },
}));

const mockUser = {
  id: '111222333',
  name: 'Clark Dalisay',
  email: 'cdalisay@example.com',
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMember = {
  id: 'member-uuid-1',
  organizationId: 'org-uuid-1',
  userId: 'user-uuid-1',
  role: 'member',
  createdAt: new Date(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.resetAllMocks();
  });

  describe('onboardMember', () => {
    const dto = {
      name: 'Juan Dela Cruz',
      email: 'juan@geoplan.ph',
      password: 'password123',
    };

    it('creates a user and adds them to the organization', async () => {
      (auth.api.signUpEmail as jest.Mock).mockResolvedValue({ user: mockUser });
      (auth.api.addMember as jest.Mock).mockResolvedValue(mockMember);

      const result = await service.onboardMember(dto, 'org-uuid-1');

      expect(auth.api.signUpEmail).toHaveBeenCalledWith({
        body: {
          name: dto.name,
          email: dto.email,
          password: dto.password,
        },
        returnHeaders: false,
      });
      expect(auth.api.addMember).toHaveBeenCalledWith({
        body: {
          userId: mockUser.id,
          role: 'member',
          organizationId: 'org-uuid-1',
          teamId: undefined,
        },
      });
      expect(result).toEqual({ user: mockUser, member: mockMember });
    });

    it('uses provided role when specified', async () => {
      (auth.api.signUpEmail as jest.Mock).mockResolvedValue({ user: mockUser });
      (auth.api.addMember as jest.Mock).mockResolvedValue(mockMember);

      await service.onboardMember({ ...dto, role: 'admin' }, 'org-uuid-1');

      expect(auth.api.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ role: 'admin' }),
        }),
      );
    });

    it('defaults to member role when role is not provided', async () => {
      (auth.api.signUpEmail as jest.Mock).mockResolvedValue({ user: mockUser });
      (auth.api.addMember as jest.Mock).mockResolvedValue(mockMember);

      await service.onboardMember(dto, 'org-uuid-1');

      expect(auth.api.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ role: 'member' }),
        }),
      );
    });

    it('passes teamId when provided', async () => {
      (auth.api.signUpEmail as jest.Mock).mockResolvedValue({ user: mockUser });
      (auth.api.addMember as jest.Mock).mockResolvedValue(mockMember);

      await service.onboardMember({ ...dto, teamId: 'team-uuid-1' }, 'org-uuid-1');

      expect(auth.api.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ teamId: 'team-uuid-1' }),
        }),
      );
    });

    it('throws when signUpEmail fails', async () => {
      (auth.api.signUpEmail as jest.Mock).mockRejectedValue(new Error('Email already exists'));

      await expect(service.onboardMember(dto, 'org-uuid-1')).rejects.toThrow('Email already exists');
    });

    it('throws when addMember fails', async () => {
      (auth.api.signUpEmail as jest.Mock).mockResolvedValue({ user: mockUser });
      (auth.api.addMember as jest.Mock).mockRejectedValue(new Error('Failed to add member'));

      await expect(service.onboardMember(dto, 'org-uuid-1')).rejects.toThrow('Failed to add member');
    });
  });
});