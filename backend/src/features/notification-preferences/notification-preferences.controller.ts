import { Body, Controller, Get, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotificationPreferencesService, UpdatePreferencesInput } from './notification-preferences.service';

function userIdOf(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException();
  return id;
}

@ApiTags('notifications')
@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationPreferencesController {
  constructor(private readonly prefs: NotificationPreferencesService) {}

  @Get('preferences')
  getPreferences(@Req() req: Request) {
    return this.prefs.get(userIdOf(req));
  }

  @Put('preferences')
  updatePreferences(@Req() req: Request, @Body() body: UpdatePreferencesInput) {
    return this.prefs.update(userIdOf(req), body);
  }

  @Get('feed')
  feed(@Req() req: Request) {
    return this.prefs.feed(userIdOf(req));
  }
}
