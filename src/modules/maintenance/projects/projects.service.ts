import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  // runs every 10 minutes
  @Cron('0 */10 * * * *')
  async handleCron() {
    await this.syncApptivoTicketsToDB();
    
  }

  async getApptivoWorkOrders() {
    try {
      const url = process.env.APPTIVO_API_RESOURCE!;
      const response = await fetch(url, {
      headers: {
          'x-api-key': String(process.env.APPTIVO_API_KEY),
          'x-access-key': String(process.env.APPTIVO_API_ACCESS_KEY),
      },
      });

      
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
        apptivoId: String(item.id), 
        customerName: item.customerName || '',
        status: item.statusName || 'Unknown',
        total: Number(item.total) || 0,
        reportedDate: item.reportedDate ? String(item.reportedDate) : null,
      }));
    } catch (error) {
     
      throw error;
    }
  }

    async syncApptivoTicketsToDB() {
    try {
        const tickets = await this.getApptivoWorkOrders();
        

        await Promise.all(
        tickets.map((ticket) =>
            this.prisma.ticket.upsert({
            where: {  apptivoId: ticket.apptivoId  },
            update: {
                customerName: ticket.customerName,
                status: ticket.status,
                total: ticket.total,
                reportedDate: ticket.reportedDate,
            },
            create: {
                apptivoId: ticket.apptivoId,
                customerName: ticket.customerName,
                status: ticket.status,
                total: ticket.total,
                reportedDate: ticket.reportedDate,
            },
            }),
        ),
        );

        
        return tickets.length;
    } catch (error) {
        
        throw error;
    }
  }
}
