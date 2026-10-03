import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  UploadedVendorFile,
  VendorOnboardingService,
  VendorProfileInput,
} from './vendor-onboarding.service';

function userIdOf(req: Request): string {
  const id = req.session?.userId;
  if (!id) throw new UnauthorizedException();
  return id;
}

@ApiTags('vendor')
@UseGuards(JwtAuthGuard)
@Controller('api/vendor')
export class VendorOnboardingController {
  constructor(private readonly vendor: VendorOnboardingService) {}

  @Get('profile')
  async getProfile(@Req() req: Request) {
    // `{ profile: null }` (not 404) so the web gate can tell "no profile yet" from an error.
    const profile = await this.vendor.getProfile(userIdOf(req));
    return { profile };
  }

  @Put('profile')
  putProfile(@Req() req: Request, @Body() body: VendorProfileInput) {
    return this.vendor.upsertProfile(userIdOf(req), body);
  }

  @Get('documents')
  listDocuments(@Req() req: Request) {
    return this.vendor.listDocuments(userIdOf(req));
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadDocument(
    @Req() req: Request,
    @UploadedFile() file: UploadedVendorFile | undefined,
    @Body('docType') docType?: string,
  ) {
    return this.vendor.uploadDocument(userIdOf(req), file, docType);
  }
}
