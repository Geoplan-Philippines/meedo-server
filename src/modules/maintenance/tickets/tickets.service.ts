import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/core/database/prisma.service';

@Injectable()
export class ApptivoTicketsService {
  constructor(private prisma: PrismaService) {}

  // runs every 10 minutes
  @Cron('0 */10 * * * *')
  async handleCron() {
    const count = await this.syncApptivoTicketsToDB();
    console.log(`Auto-sync complete: ${count} tickets`);
  }

  async getApptivoWorkOrders() {
    try {
      const url = `${process.env.APPTIVO_API_RESOURCE}&apiKey=${process.env.APPTIVO_API_KEY}&accessKey=${process.env.APPTIVO_API_ACCESS_KEY}`;

      const response = await fetch(url);
      const text = await response.text();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new HttpException(
          {
            message: 'Invalid JSON response from Apptivo',
            raw: text,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const tickets = parsed?.data?.data || parsed?.data || parsed;

      if (!Array.isArray(tickets)) {
        throw new HttpException(
          'Unexpected response structure',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      
      return tickets.map((item) => ({
        id: Number(item.id), 
        customerName: item.customerName || '',
        status: item.statusName || 'Unknown',
        total: Number(item.total) || 0,
        reportedDate: item.reportedDate
          ? String(item.reportedDate)
          : '',
      }));
    } catch (error) {
      console.error('FULL ERROR:', error);
      throw error;
    }
  }

    async syncApptivoTicketsToDB() {
    try {
        const tickets = await this.getApptivoWorkOrders();
        console.log(`Fetched ${tickets.length} tickets from Apptivo`);

        await Promise.all(
        tickets.map((ticket) =>
            this.prisma.ticket.upsert({
            where: { id: BigInt(ticket.id) },
            update: {
                customerName: ticket.customerName || 'Unknown',
                status: ticket.status || 'Unknown',
                total: Number(ticket.total) || 0,
                reportedDate: ticket.reportedDate || new Date().toISOString(),
            },
            create: {
                id: BigInt(ticket.id),
                customerName: ticket.customerName || 'Unknown',
                status: ticket.status || 'Unknown',
                total: Number(ticket.total) || 0,
                reportedDate: ticket.reportedDate || new Date().toISOString(),
            },
            }),
        ),
        );

        console.log(`Sync complete: ${tickets.length} tickets`);
        return tickets.length;
    } catch (error) {
        console.error('Sync failed:', error);
        throw error;
    }
    }
}