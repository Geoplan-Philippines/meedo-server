import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async getApptivoWorkOrders() {
      const searchParams = {
        reportedDateFrom: '01/01/2024',
        reportedDateTo: '31/12/2025',
      };
      const searchData = encodeURIComponent(JSON.stringify(searchParams));
      const url = `${process.env.APPTIVO_API_RESOURCE!}&apiKey=${encodeURIComponent(String(process.env.APPTIVO_API_KEY))}&accessKey=${encodeURIComponent(String(process.env.APPTIVO_API_ACCESS_KEY))}&searchData=${searchData}&numRecords=1000`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new HttpException('Failed to fetch Apptivo data', HttpStatus.BAD_GATEWAY);
      }

    // const contentType = response.headers.get('content-type');

    // if (!contentType?.includes('application/json')) {
    //   const text = await response.text();
    //   throw new HttpException(
    //     {
    //       message: 'Apptivo returned non-JSON (likely auth issue)',
    //       raw: text.slice(0, 200),
    //     },
    //     HttpStatus.BAD_GATEWAY,
    //   );
    // }

      const parsed = await response.json();
      //tempppp
      // console.log('PARSED:', parsed);

      const projects = parsed?.data

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
        total: Number(item.total) || 0,
        reportedDate: item.reportedDate ? String(item.reportedDate) : null,
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