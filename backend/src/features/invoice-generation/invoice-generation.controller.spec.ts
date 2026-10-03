import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { InvoiceGenerationController } from './invoice-generation.controller';
import { InvoiceGenerationModule } from './invoice-generation.module';
import { FEATURE_MODULES } from '../index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function route(name: string): { method: number; path: string } {
  const handler = (InvoiceGenerationController.prototype as Any)[name];
  return { method: Reflect.getMetadata(METHOD_METADATA, handler), path: Reflect.getMetadata(PATH_METADATA, handler) };
}

describe('InvoiceGenerationController HTTP contract', () => {
  it('is mounted at api/invoices', () => {
    expect(Reflect.getMetadata(PATH_METADATA, InvoiceGenerationController)).toBe('api/invoices');
  });

  it.each([
    ['generate', RequestMethod.POST, '/'],
    ['list', RequestMethod.GET, '/'],
    ['download', RequestMethod.GET, ':id/download'],
  ])('%s → %s %s', (name, method, path) => {
    const r = route(name as string);
    expect(r.method).toBe(method);
    expect(r.path).toBe(path);
  });

  it('streams the PDF as an attachment for the session user', async () => {
    const svc = {
      generate: jest.fn().mockResolvedValue({ id: 'i1' }),
      download: jest.fn().mockResolvedValue({ filename: 'INV-1.pdf', content: Buffer.from('%PDF-') }),
    };
    const ctrl = new InvoiceGenerationController(svc as Any);
    const req = { session: { userId: 'u1' } } as Any;
    await ctrl.generate(req, { orderId: 'o1' });
    expect(svc.generate).toHaveBeenCalledWith('u1', { orderId: 'o1' });
    const res = { setHeader: jest.fn(), send: jest.fn() } as Any;
    await ctrl.download(req, 'i1', res);
    expect(svc.download).toHaveBeenCalledWith('u1', 'i1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="INV-1.pdf"');
    expect(() => ctrl.list({ session: {} } as Any)).toThrow();
  });

  it('is registered in FEATURE_MODULES', () => {
    expect(FEATURE_MODULES).toContain(InvoiceGenerationModule);
  });
});
