import type { Config } from 'drizzle-kit';

// Migrations run as DATABASE_OWNER_URL (owner role). The app uses DATABASE_URL
// (a NON-owner role) so RLS policies actually apply. See ADR-001.
export default {
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? 'postgres://owner_user:owner_pass@localhost:5433/consorciofix',
  },
  verbose: true,
  strict: true,
} satisfies Config;
