import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from '../../lib/integrations/minio.service';

export interface VendorProfileInput {
  companyName?: string;
  website?: string;
  address?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface UploadedVendorFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Validates and normalises a profile payload; throws 400 on missing required fields. */
export function validateProfile(input: VendorProfileInput) {
  const companyName = clean(input?.companyName);
  const contactName = clean(input?.contactName);
  const contactEmail = clean(input?.contactEmail);
  const errors: string[] = [];
  if (!companyName) errors.push('companyName is required');
  if (!contactName) errors.push('contactName is required');
  if (!contactEmail) errors.push('contactEmail is required');
  else if (!EMAIL_RE.test(contactEmail)) errors.push('contactEmail must be a valid email');
  if (errors.length) throw new BadRequestException(errors.join('; '));
  return {
    companyName,
    contactName,
    contactEmail,
    website: clean(input.website) || null,
    address: clean(input.address) || null,
    contactPhone: clean(input.contactPhone) || null,
  };
}

@Injectable()
export class VendorOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  getProfile(userId: string) {
    return this.prisma.vendorProfile.findUnique({ where: { userId } });
  }

  upsertProfile(userId: string, input: VendorProfileInput) {
    const data = validateProfile(input);
    return this.prisma.vendorProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async listDocuments(userId: string) {
    const profile = await this.getProfile(userId);
    if (!profile) return [];
    return this.prisma.vendorDocument.findMany({
      where: { profileId: profile.id },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async uploadDocument(userId: string, file: UploadedVendorFile | undefined, docType: string | undefined) {
    if (!file || !file.buffer) throw new BadRequestException('file is required');
    const profile = await this.getProfile(userId);
    if (!profile) {
      throw new ConflictException('Complete your vendor profile before uploading documents');
    }
    const safeName = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
    const key = `vendor/${profile.id}/${randomUUID()}-${safeName}`;
    await this.minio.putObject(key, file.buffer, file.size, file.mimetype);
    return this.prisma.vendorDocument.create({
      data: {
        profileId: profile.id,
        storageKey: key,
        fileName: file.originalname,
        docType: clean(docType) || 'COMPLIANCE',
        mimeType: file.mimetype ?? null,
        sizeBytes: file.size,
        status: 'PENDING_REVIEW',
      },
    });
  }
}
