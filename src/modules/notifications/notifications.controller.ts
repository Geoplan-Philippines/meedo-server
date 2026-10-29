import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListNotificationsDTO } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiCookieAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Page through your own notifications' })
  list(@CurrentUser('id') userId: string, @Query() query: ListNotificationsDTO) { return this.notifications.list(userId, query); }

  @Get('unread-count')
  @ApiOperation({ summary: 'Your unread notification count' })
  async count(@CurrentUser('id') userId: string) { return { count: await this.notifications.unreadCount(userId) }; }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all of your notifications read and update your other tabs' })
  readAll(@CurrentUser('id') userId: string) { return this.notifications.readAll(userId); }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of your notifications read and update your other tabs' })
  read(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) { return this.notifications.read(userId, id); }
}
