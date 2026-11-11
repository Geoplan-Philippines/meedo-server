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

jest.mock('../../core/database/prisma.client', () => ({
  prisma: {
    user: {
      delete: jest.fn().mockResolvedValue(undefined),
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
    jest.clearAllMocks();
  });

  describe('onboardMember', () => {
    const dto = {
      name: 'Juan Dela Cruz',
      email: 'juan@geoplan.ph',
      password: 'password123',
    };

    it('creates a user and adds them to the organization', async () => {
      jest.mocked(auth.api.signUpEmail).mockResolvedValue({ token: 'example-token', user: mockUser });
      jest.mocked(auth.api.addMember).mockResolvedValue(mockMember);

      const result = await service.onboardMember(dto, 'org-uuid-1');

      expect(auth.api.signUpEmail).toHaveBeenCalledWith({
        body: {
          name: dto.name,
          email: dto.email,
          password: dto.password,
        },
      });
      expect(auth.api.addMember).toHaveBeenCalledWith({
        body: {
          userId: mockUser.id,
          role: 'member',
          organizationId: 'org-uuid-1',
          teamId: undefined,
        },
      });
      expect(result).toEqual({
        user: { ...mockUser, employeeCode: null, biometricsId: null },
        member: mockMember,
      });
    });

    it('uses provided role when specified', async () => {
      jest.mocked(auth.api.signUpEmail).mockResolvedValue({ token: 'example-token', user: mockUser });
      jest.mocked(auth.api.addMember).mockResolvedValue(mockMember);

      await service.onboardMember({ ...dto, role: 'admin' }, 'org-uuid-1');

      expect(jest.mocked(auth.api.addMember).mock.calls[0][0]).toMatchObject({ body: { role: 'admin' } });
    });

    it('defaults to member role when role is not provided', async () => {
      jest.mocked(auth.api.signUpEmail).mockResolvedValue({ token: 'example-token', user: mockUser });
      jest.mocked(auth.api.addMember).mockResolvedValue(mockMember);

      await service.onboardMember(dto, 'org-uuid-1');

      expect(jest.mocked(auth.api.addMember).mock.calls[0][0]).toMatchObject({ body: { role: 'member' } });
    });

    it('passes teamId when provided', async () => {
      jest.mocked(auth.api.signUpEmail).mockResolvedValue({ token: 'example-token', user: mockUser });
      jest.mocked(auth.api.addMember).mockResolvedValue(mockMember);

      await service.onboardMember({ ...dto, teamId: 'team-uuid-1' }, 'org-uuid-1');

      expect(jest.mocked(auth.api.addMember).mock.calls[0][0]).toMatchObject({ body: { teamId: 'team-uuid-1' } });
    });

    it('throws when signUpEmail fails', async () => {
      jest.mocked(auth.api.signUpEmail).mockRejectedValue(new Error('Email already exists'));

      await expect(service.onboardMember(dto, 'org-uuid-1')).rejects.toThrow('Email already exists');
    });

    it('throws when addMember fails', async () => {
      jest.mocked(auth.api.signUpEmail).mockResolvedValue({ token: 'example-token', user: mockUser });
      jest.mocked(auth.api.addMember).mockRejectedValue(new Error('Failed to add member'));

      await expect(service.onboardMember(dto, 'org-uuid-1')).rejects.toThrow('Failed to add member');
    });
  });
});
