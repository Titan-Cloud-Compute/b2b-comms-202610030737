import { BadRequestException, ConflictException } from '@nestjs/common';
import { VendorOnboardingService, validateProfile } from './vendor-onboarding.service';

function makeService(profile: { id: string } | null) {
  const prisma = {
    vendorProfile: {
      findUnique: jest.fn().mockResolvedValue(profile),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'p1', ...create })),
    },
    vendorDocument: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'd1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const minio = { putObject: jest.fn().mockResolvedValue({ etag: 'e', bucket: 'b', key: 'k' }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new VendorOnboardingService(prisma as any, minio as any);
  return { svc, prisma, minio };
}

describe('vendor onboarding', () => {
  it('rejects a profile without company or contact details', () => {
    expect(() => validateProfile({ companyName: 'Acme' })).toThrow(BadRequestException);
    expect(() =>
      validateProfile({ companyName: 'Acme', contactName: 'Jo', contactEmail: 'nope' }),
    ).toThrow(BadRequestException);
  });

  it('saves the profile for the signed-in user', async () => {
    const { svc, prisma } = makeService(null);
    const saved = await svc.upsertProfile('u1', {
      companyName: ' Acme ',
      contactName: 'Jo',
      contactEmail: 'jo@acme.test',
    });
    expect(prisma.vendorProfile.upsert).toHaveBeenCalled();
    expect(saved).toMatchObject({ userId: 'u1', companyName: 'Acme' });
  });

  it('refuses uploads until the profile exists', async () => {
    const { svc } = makeService(null);
    await expect(
      svc.uploadDocument('u1', { originalname: 'a.pdf', size: 1, buffer: Buffer.from('x') }, 'W9'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores the upload and saves it as PENDING_REVIEW', async () => {
    const { svc, minio } = makeService({ id: 'p1' });
    const doc = await svc.uploadDocument(
      'u1',
      { originalname: 'cert.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('abc') },
      'Insurance',
    );
    expect(minio.putObject).toHaveBeenCalled();
    expect(doc).toMatchObject({ profileId: 'p1', fileName: 'cert.pdf', status: 'PENDING_REVIEW' });
  });
});
