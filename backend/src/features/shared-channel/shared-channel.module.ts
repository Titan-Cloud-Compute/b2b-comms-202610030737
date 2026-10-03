import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SharedChannelController } from './shared-channel.controller';
import { SharedChannelService } from './shared-channel.service';

@Module({
  imports: [AuthModule],
  controllers: [SharedChannelController],
  providers: [SharedChannelService],
})
export class SharedChannelModule {}
