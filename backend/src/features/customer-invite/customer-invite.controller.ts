import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequireAdmin, RolesGuard } from '../../auth/roles.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { CustomerInviteService } from './customer-invite.service';

function userIdOf(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException();
  return id;
}

@ApiTags('customer-invites')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/customer-invites')
export class CustomerInviteController {
  constructor(private readonly invites: CustomerInviteService) {}

  @RequireAdmin()
  @Post()
  create(@Req() req: Request, @Body() body: { email?: unknown }) {
    return this.invites.invite(userIdOf(req), body?.email);
  }

  @RequireAdmin()
  @Get()
  list() {
    return this.invites.list();
  }

  @Public()
  @Get('token/:token')
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Public()
  @Post('activate')
  activate(@Body() body: { token?: unknown; password?: unknown; name?: unknown }) {
    return this.invites.activate(body);
  }
}
