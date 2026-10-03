import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { VendorOnboardingController } from './vendor-onboarding.controller';
import { VendorOnboardingService } from './vendor-onboarding.service';

@Module({
  imports: [AuthModule],
  controllers: [VendorOnboardingController],
  providers: [VendorOnboardingService],
})
export class VendorOnboardingModule {}
