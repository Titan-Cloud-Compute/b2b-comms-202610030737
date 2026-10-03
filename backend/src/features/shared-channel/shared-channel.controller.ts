import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { from, switchMap } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateChannelInput, SharedChannelService } from './shared-channel.service';

function userIdOf(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException();
  return id;
}

@ApiTags('channels')
@UseGuards(JwtAuthGuard)
@Controller('api/channels')
export class SharedChannelController {
  constructor(private readonly channels: SharedChannelService) {}

  @Get()
  list(@Req() req: Request) {
    return this.channels.listChannels(userIdOf(req));
  }

  @Get('customers')
  customers(@Req() req: Request) {
    return this.channels.listCustomers(userIdOf(req));
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreateChannelInput) {
    return this.channels.createChannel(userIdOf(req), body);
  }

  @Post(':id/members')
  addMembers(@Req() req: Request, @Param('id') id: string, @Body('customerIds') customerIds: unknown) {
    return this.channels.addMembers(id, userIdOf(req), customerIds);
  }

  @Get(':id/messages')
  messages(@Req() req: Request, @Param('id') id: string) {
    return this.channels.listMessages(id, userIdOf(req));
  }

  @Post(':id/messages')
  post(@Req() req: Request, @Param('id') id: string, @Body('body') body: unknown) {
    return this.channels.postMessage(id, userIdOf(req), body);
  }

  /** Server-sent events: every new message in the channel, pushed to each connected member. */
  @Sse(':id/stream')
  stream(@Req() req: Request, @Param('id') id: string) {
    const userId = userIdOf(req);
    return from(this.channels.assertMember(id, userId)).pipe(switchMap(() => this.channels.stream(id)));
  }
}
