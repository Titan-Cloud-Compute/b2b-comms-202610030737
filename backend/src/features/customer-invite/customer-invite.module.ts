import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CustomerInviteController } from './customer-invite.controller';
import { CustomerInviteService } from './customer-invite.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomerInviteController],
  providers: [CustomerInviteService],
  exports: [CustomerInviteService],
})
export class CustomerInviteModule {}
