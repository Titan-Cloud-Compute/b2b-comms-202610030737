/**
 * Schema guard for Story: shared-channel — the models and migration 0006 exist,
 * and the auth tables are not touched.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PRISMA_DIR = join(__dirname, '..', '..', '..', 'prisma');
const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
const migrationDir = readdirSync(join(PRISMA_DIR, 'migrations')).find((d) => /^0006_/.test(d));
const sql = migrationDir ? readFileSync(join(PRISMA_DIR, 'migrations', migrationDir, 'migration.sql'), 'utf8') : '';

function modelBody(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : '';
}

describe('shared-channel schema', () => {
  it.each(['Customer', 'Channel', 'ChannelMember', 'Message'])('declares model %s', (name) => {
    expect(modelBody(name)).not.toBe('');
  });

  it('Channel records its creator; members and messages reference users by plain userId', () => {
    expect(modelBody('Channel')).toMatch(/createdByUserId\s+String/);
    expect(modelBody('ChannelMember')).toMatch(/channelId\s+String/);
    expect(modelBody('ChannelMember')).toMatch(/userId\s+String/);
    expect(modelBody('ChannelMember')).toMatch(/role\s+ChannelMemberRole/);
    expect(modelBody('ChannelMember')).toMatch(/@@unique\(\[channelId, userId\]\)/);
    expect(modelBody('Message')).toMatch(/authorUserId\s+String/);
    expect(modelBody('Message')).toMatch(/body\s+String/);
    expect(modelBody('Message')).toMatch(/createdAt\s+DateTime/);
  });

  it('does not add relations to the User auth model', () => {
    const user = modelBody('User');
    expect(user).not.toMatch(/Channel|Message|Customer/);
  });

  it('ships migration 0006 creating the four tables without altering auth tables', () => {
    expect(migrationDir).toBeDefined();
    for (const t of ['Customer', 'Channel', 'ChannelMember', 'Message']) {
      expect(sql).toContain(`CREATE TABLE "${t}"`);
    }
    expect(sql).not.toMatch(/ALTER TABLE "(User|Session|RegistrationToken|PasswordResetToken)"/);
  });
});
