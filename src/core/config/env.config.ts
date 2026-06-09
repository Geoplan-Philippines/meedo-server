import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_URL: z.string().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().startsWith('postgresql://').min(1),

  BETTER_AUTH_SECRET: z.string().min(32),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  FACE_RECOGNITION_API_URL: z.string().default('http://localhost:5000'),
  FACE_RECOGNITION_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  APPTIVO_API_RESOURCE: z.string().default('https://api.apptivo.com/v1/'),
  APPTIVO_API_KEY: z.string().min(1),
  APPTIVO_API_ACCESS_KEY: z.string().min(1),
  CLOUDINARY_API_KEY_SECRET: z.string().min(1),
  CLOUDINARY_API_KEY:z.string().min(1),
  CLOUD_NAME: z.string().min(1),
  PRESET_NAME: z.string().min(1),
  CLOUDINARY_BASE_URL: z.string().min(1)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
