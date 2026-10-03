/**
 * HTTP-level integration spec that pins per-role guard behaviour.
 *
 * Proves:
 *   - No cookie → 401 on all protected routes
 *   - USER  → 403 on @RequireAdmin and @RequireManager, 200 on @RequireUser
 *   - MANAGER → 403 on @RequireAdmin, 200 on @RequireManager and @RequireUser
 *   - ADMIN → 200 on all three routes
 *
 * No database, no Redis — pure DI with a test-only controller.
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';

import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard, RequireAdmin, RequireManager, RequireUser } from './roles.guard';

const TEST_SECRET = 'test-secret';

// ---------------------------------------------------------------------------
// Minimal test-only controller
// ---------------------------------------------------------------------------
@Controller('test')
class TestController {
  @RequireAdmin()
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }

  @RequireManager()
  @Get('manager-up')
  managerUp() {
    return { ok: true };
  }

  @RequireUser()
  @Get('user-up')
  userUp() {
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function signSession(
  jwtService: JwtService,
  role: 'USER' | 'MANAGER' | 'ADMIN',
): string {
  return jwtService.sign({ userId: 'u-1', role, firmId: null });
}

function cookieHeader(token: string): string {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'session';
  return `${cookieName}=${token}`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('Role guards — HTTP-level foundation spec', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [TestController],
      providers: [
        Reflector,
        JwtAuthGuard,
        RolesGuard,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // No cookie → 401 everywhere
  // -------------------------------------------------------------------------
  describe('no session cookie', () => {
    it('GET /test/admin-only → 401', () =>
      request(app.getHttpServer()).get('/test/admin-only').expect(401));

    it('GET /test/manager-up → 401', () =>
      request(app.getHttpServer()).get('/test/manager-up').expect(401));

    it('GET /test/user-up → 401', () =>
      request(app.getHttpServer()).get('/test/user-up').expect(401));
  });

  // -------------------------------------------------------------------------
  // USER role
  // -------------------------------------------------------------------------
  describe('USER role', () => {
    let cookie: string;
    beforeAll(() => {
      cookie = cookieHeader(signSession(jwtService, 'USER'));
    });

    it('GET /test/admin-only → 403', () =>
      request(app.getHttpServer())
        .get('/test/admin-only')
        .set('Cookie', cookie)
        .expect(403));

    it('GET /test/manager-up → 403', () =>
      request(app.getHttpServer())
        .get('/test/manager-up')
        .set('Cookie', cookie)
        .expect(403));

    it('GET /test/user-up → 200', () =>
      request(app.getHttpServer())
        .get('/test/user-up')
        .set('Cookie', cookie)
        .expect(200));
  });

  // -------------------------------------------------------------------------
  // MANAGER role
  // -------------------------------------------------------------------------
  describe('MANAGER role', () => {
    let cookie: string;
    beforeAll(() => {
      cookie = cookieHeader(signSession(jwtService, 'MANAGER'));
    });

    it('GET /test/admin-only → 403', () =>
      request(app.getHttpServer())
        .get('/test/admin-only')
        .set('Cookie', cookie)
        .expect(403));

    it('GET /test/manager-up → 200', () =>
      request(app.getHttpServer())
        .get('/test/manager-up')
        .set('Cookie', cookie)
        .expect(200));

    it('GET /test/user-up → 200', () =>
      request(app.getHttpServer())
        .get('/test/user-up')
        .set('Cookie', cookie)
        .expect(200));
  });

  // -------------------------------------------------------------------------
  // ADMIN role
  // -------------------------------------------------------------------------
  describe('ADMIN role', () => {
    let cookie: string;
    beforeAll(() => {
      cookie = cookieHeader(signSession(jwtService, 'ADMIN'));
    });

    it('GET /test/admin-only → 200', () =>
      request(app.getHttpServer())
        .get('/test/admin-only')
        .set('Cookie', cookie)
        .expect(200));

    it('GET /test/manager-up → 200', () =>
      request(app.getHttpServer())
        .get('/test/manager-up')
        .set('Cookie', cookie)
        .expect(200));

    it('GET /test/user-up → 200', () =>
      request(app.getHttpServer())
        .get('/test/user-up')
        .set('Cookie', cookie)
        .expect(200));
  });
});
