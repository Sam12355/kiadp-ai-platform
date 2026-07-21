import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o'),
  OPENAI_CHAT_MODEL_MINI: z.string().default('gpt-4o-mini'),

  // Gemini
  GEMINI_API_KEY: z.string().optional(),

  // Groq (optional — 3rd-tier chat fallback after Gemini)
  GROQ_API_KEY: z.string().optional(),

  // Cohere (optional — used for reranking when provided)
  COHERE_API_KEY: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().default(7),

  // File Storage
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(50),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // WhatsApp (Meta)
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  // Which institution WhatsApp questions are answered from. One WhatsApp number serves the
  // whole deployment and a sender is only ever identified by their phone number, so there
  // is nothing in an incoming message that says which school they belong to. Without this
  // set, WhatsApp questions are refused rather than answered from every school's documents.
  WHATSAPP_TENANT_ID: z.string().uuid().optional(),

  // Bootstrap
  ADMIN_BOOTSTRAP_SECRET: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  _env = result.data;
  return _env;
}
