/**
 * Feature module registry.
 *
 * Each story appends its NestJS module to this array.
 * AppModule spreads FEATURE_MODULES so new features are picked up automatically.
 */
import { VendorOnboardingModule } from './vendor-onboarding/vendor-onboarding.module';
import { SharedChannelModule } from './shared-channel/shared-channel.module';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FEATURE_MODULES: any[] = [VendorOnboardingModule, SharedChannelModule];
