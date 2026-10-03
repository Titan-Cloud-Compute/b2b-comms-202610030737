/**
 * Hermetic spec for Story: vendor-onboarding.
 * All /api/** calls are intercepted with an in-memory vendor backend.
 */
import { test, expect, type Page } from '@playwright/test';

async function mockVendorApi(page: Page): Promise<void> {
  const user = { id: 'v1', email: 'vendor@example.com', role: 'USER' };
  let profile: Record<string, unknown> | null = null;
  const documents: Record<string, unknown>[] = [];

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname.replace(/^.*\/api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') return json(user);
    if (method === 'GET' && apiPath === 'users/me') return json(user);
    if (method === 'GET' && apiPath === 'vendor/profile') return json({ profile });
    if (method === 'PUT' && apiPath === 'vendor/profile') {
      profile = { id: 'p1', ...(req.postDataJSON() as Record<string, unknown>) };
      return json(profile);
    }
    if (method === 'GET' && apiPath === 'vendor/documents') return json(documents);
    if (method === 'POST' && apiPath === 'vendor/documents') {
      if (!profile) return json({ message: 'Complete your vendor profile first' }, 409);
      const doc = {
        id: `d${documents.length + 1}`,
        fileName: 'insurance.pdf',
        docType: 'Insurance certificate',
        status: 'PENDING_REVIEW',
        uploadedAt: new Date().toISOString(),
      };
      documents.unshift(doc);
      return json(doc, 201);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

test.use({ serviceWorkers: 'block' });

test('vendor submits profile, then uploads a document that shows Pending review', async ({ page }) => {
  await mockVendorApi(page);
  await page.goto('/#/login');
  await page.locator('#email').fill('vendor@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.hash.includes('/login'), { timeout: 10_000 });

  // Before the profile exists, upload is gated.
  await page.goto('/#/vendor');
  await expect(page.getByTestId('vendor-dashboard')).toBeVisible();
  await expect(page.getByTestId('vendor-profile-required')).toBeVisible();
  await expect(page.locator('#vd-file')).toBeDisabled();

  await page.goto('/#/vendor/profile');
  await page.locator('#vp-company').fill('Acme Supplies');
  await page.locator('#vp-contact-name').fill('Jo Vendor');
  await page.locator('#vp-contact-email').fill('jo@acme.test');
  await page.getByTestId('vendor-profile-submit').click();

  await expect(page).toHaveURL(/#\/vendor$/, { timeout: 10_000 });
  await expect(page.getByTestId('vendor-dashboard')).toBeVisible();
  await expect(page.locator('[data-placeholder]')).toHaveCount(0);
  await expect(page.getByTestId('vendor-doc-library')).toBeVisible();

  await page.locator('#vd-type').selectOption('Insurance certificate');
  await page.locator('#vd-file').setInputFiles({
    name: 'insurance.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4'),
  });
  await page.getByTestId('vendor-doc-submit').click();

  const status = page.getByTestId('vendor-doc-library').getByTestId('vendor-doc-status');
  await expect(status).toHaveCount(1);
  await expect(status.first()).toHaveText('Pending review');
  await expect(page.getByTestId('vendor-doc-library')).toContainText('insurance.pdf');
});
