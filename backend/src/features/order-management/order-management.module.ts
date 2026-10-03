import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { OrderManagementController } from './order-management.controller';
import { OrderManagementService } from './order-management.service';

@Module({
  imports: [AuthModule],
  controllers: [OrderManagementController],
  providers: [OrderManagementService],
})
export class OrderManagementModule {}
