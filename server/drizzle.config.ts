import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/**/*.schema.ts', '!./src/common/**/*.schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
