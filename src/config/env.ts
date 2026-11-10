import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'), PORT:z.coerce.number().int().min(1).max(65535).default(5000),
 PUBLIC_API_URL:z.string().url(), FRONTEND_ORIGINS:z.string().min(1), DATABASE_URL:z.string().min(1),
 JWT_ACCESS_SECRET:z.string().min(32), JWT_ACCESS_TTL:z.string().default('15m'), JWT_REFRESH_SECRET:z.string().min(32), JWT_REFRESH_TTL_DAYS:z.coerce.number().int().min(1).max(90).default(30),
 COOKIE_SECURE:z.string().default('false').transform(v=>v==='true'), COOKIE_DOMAIN:z.string().optional().default(''), REDIS_URL:z.string().min(1),
 RAZORPAY_KEY_ID:z.string().min(1), RAZORPAY_KEY_SECRET:z.string().min(1), RAZORPAY_WEBHOOK_SECRET:z.string().min(1),
 CLOUDINARY_CLOUD_NAME:z.string().min(1), CLOUDINARY_API_KEY:z.string().min(1), CLOUDINARY_API_SECRET:z.string().min(1),
 UPLOAD_MAX_BYTES:z.coerce.number().int().positive().default(5242880), DAILY_KM_CAP:z.coerce.number().positive().default(300), LOCATION_RETENTION_DAYS:z.coerce.number().int().positive().default(90), LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),
 SEED_ADMIN_NAME:z.string().optional(), SEED_ADMIN_EMAIL:z.string().email().optional(), SEED_ADMIN_PHONE:z.string().optional(), SEED_ADMIN_PASSWORD:z.string().optional()
});
const parsed=schema.safeParse(process.env);
if(!parsed.success){console.error('Invalid environment configuration:',parsed.error.flatten().fieldErrors);throw new Error('Refusing to start: invalid environment configuration');}
export const env=parsed.data;
