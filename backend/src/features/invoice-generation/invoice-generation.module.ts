import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { InvoiceGenerationController } from './invoice-generation.controller';
import { InvoiceGenerationService } from './invoice-generation.service';

@Module({
  imports: [AuthModule],
  controllers: [InvoiceGenerationController],
  providers: [InvoiceGenerationService],
})
export class InvoiceGenerationModule {}
