import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async getApptivoWorkOrders() {
      const now = new Date();
      const formatDate = (date: Date) => {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      };

      const startOfYear = new Date(now.getFullYear(), 0, 1);

      const searchParams = {
        reportedDateFrom: formatDate(startOfYear),
        reportedDateTo: formatDate(now),
      };
      const searchData = encodeURIComponent(JSON.stringify(searchParams));
      const numRecords = Number(process.env.APPTIVO_NUM_RECORDS) || 1000;
      const url = `${process.env.APPTIVO_API_RESOURCE!}&apiKey=${encodeURIComponent(String(process.env.APPTIVO_API_KEY))}&accessKey=${encodeURIComponent(String(process.env.APPTIVO_API_ACCESS_KEY))}&searchData=${searchData}&numRecords=${numRecords}`;

    let response;

    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
    } catch (error) {  
      throw new HttpException(
        'Network error while fetching Apptivo data',
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!response.ok) {
      throw new HttpException(
        'Failed to fetch Apptivo data',
        HttpStatus.BAD_GATEWAY,
      );
    }
      const parsed = await response.json();
      const projects = parsed?.data?.data || parsed?.data || parsed;

      if (!Array.isArray(projects)) {
        throw new HttpException(
          'Unexpected response structure',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      
      return projects.map((item) => ({
        apptivoId: String(item.id), 
        customerName: item.customerName || '',
        status: item.statusName || 'Unknown',
        total: !isNaN(Number(item.total)) ? Number(item.total) : 0,
        reportedDate: (() => {
        const d = item.reportedDate ? new Date(item.reportedDate) : null;
        return d && !isNaN(d.getTime()) ? d : null;
        })(),
      }));
    } 
  
  async syncApptivoProjectsToDB() {

      const projects = await this.getApptivoWorkOrders();
  
      await Promise.all(
      projects.map((project) =>
          this.prisma.project.upsert({
          where: {  apptivoId: project.apptivoId  },
          update: {
              customerName: project.customerName,
              status: project.status,
              total: project.total,
              reportedDate: project.reportedDate,
            },
          create: {
              apptivoId: project.apptivoId,
              customerName: project.customerName,
              status: project.status,
              total: project.total,
              reportedDate: project.reportedDate,
            },
          }),
        ),
      );
      return projects.length;
  }
}