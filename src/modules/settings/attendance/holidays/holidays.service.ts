import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Holiday, HolidayType, Prisma } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { CreateHolidayDTO } from './dto/create-holiday.dto';
import { GenerateHolidaysDTO } from './dto/generate-holidays.dto';
import { UpdateHolidayDTO } from './dto/update-holiday.dto';
import { parseDateOnly } from '../shared/attendance-settings.util';

/** Shape of one entry from the Nager.Date public-holiday API. */
interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
}

/**
 * Preferred display names for Philippine holidays, keyed by "MM-DD" (fixed-date
 * ones). The distinctly Filipino holidays read better in Filipino; the rest keep
 * their common English names. Movable/religious holidays fall through to English.
 */
const PH_HOLIDAY_NAME_OVERRIDES: Record<string, string> = {
  '04-09': 'Araw ng Kagitingan',
  '06-12': 'Araw ng Kalayaan',
  '08-21': 'Ninoy Aquino Day',
  '11-30': 'Araw ni Bonifacio',
  '12-30': 'Araw ni Rizal',
};

@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name);

  constructor(private prisma: PrismaService) {}

  async getHolidays(organizationId: string, year?: number): Promise<Holiday[]> {
    const where: Prisma.HolidayWhereInput = {
      organizationId,
      ...(year !== undefined
        ? {
            date: {
              gte: new Date(Date.UTC(year, 0, 1)),
              lt: new Date(Date.UTC(year + 1, 0, 1)),
            },
          }
        : {}),
    };

    return this.prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
  }

  async createHoliday(data: CreateHolidayDTO, organizationId: string): Promise<Holiday> {
    return this.prisma.holiday.create({
      data: {
        name: data.name.trim(),
        date: parseDateOnly(data.date),
        type: data.type ?? HolidayType.REGULAR,
        isRecurring: data.isRecurring ?? false,
        organization: { connect: { id: organizationId } },
      },
    });
  }

  async updateHoliday(
    id: string,
    data: UpdateHolidayDTO,
    organizationId: string,
  ): Promise<Holiday> {
    await this.assertOwned(id, organizationId);
    return this.prisma.holiday.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.date !== undefined ? { date: parseDateOnly(data.date) } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.isRecurring !== undefined ? { isRecurring: data.isRecurring } : {}),
      },
    });
  }

  async deleteHoliday(id: string, organizationId: string): Promise<{ id: string }> {
    await this.assertOwned(id, organizationId);
    await this.prisma.holiday.delete({ where: { id } });
    return { id };
  }

  /** Delete every holiday dated within the given year for the organization. */
  async clearYear(organizationId: string, year: number): Promise<{ deleted: number }> {
    const result = await this.prisma.holiday.deleteMany({
      where: {
        organizationId,
        date: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        },
      },
    });
    return { deleted: result.count };
  }

  /**
   * Import a year's public holidays from the free Nager.Date API and store any
   * that are new. Idempotent via the (organizationId, date, name) unique index,
   * so re-running a year only reports the extras as skipped. Imported holidays
   * default to REGULAR; the admin can adjust each type afterward.
   */
  async generate(
    data: GenerateHolidaysDTO,
    organizationId: string,
  ): Promise<{ imported: number; skipped: number }> {
    const countryCode = (data.countryCode ?? 'PH').toUpperCase();
    const holidays = await this.fetchPublicHolidays(data.year, countryCode);

    if (holidays.length === 0) {
      return { imported: 0, skipped: 0 };
    }

    const result = await this.prisma.holiday.createMany({
      data: holidays.map((holiday) => ({
        organizationId,
        name: this.preferredHolidayName(holiday, countryCode),
        date: parseDateOnly(holiday.date),
        type: HolidayType.REGULAR,
      })),
      skipDuplicates: true,
    });

    return { imported: result.count, skipped: holidays.length - result.count };
  }

  /**
   * PH imports default to the English name (Nager's `name`), overriding the
   * distinctly Filipino holidays with their Filipino names. Other countries keep
   * the provider's local name, falling back to English.
   */
  private preferredHolidayName(holiday: NagerHoliday, countryCode: string): string {
    if (countryCode === 'PH') {
      const monthDay = holiday.date.slice(5, 10);
      return (PH_HOLIDAY_NAME_OVERRIDES[monthDay] ?? holiday.name).trim();
    }
    return (holiday.localName || holiday.name).trim();
  }

  private async fetchPublicHolidays(year: number, countryCode: string): Promise<NagerHoliday[]> {
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
    try {
      // Fail fast rather than hang if the external provider is slow or unreachable.
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new Error(`Holiday provider responded with ${response.status}`);
      }
      const payload = (await response.json()) as NagerHoliday[];
      return Array.isArray(payload) ? payload : [];
    } catch (error) {
      this.logger.error(
        `Failed to fetch holidays for ${countryCode} ${year}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        `Could not fetch public holidays for ${countryCode} ${year}. Please try again.`,
      );
    }
  }

  private async assertOwned(id: string, organizationId: string): Promise<void> {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!holiday) {
      throw new NotFoundException('Holiday not found in this organization.');
    }
  }
}
