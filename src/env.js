import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.join(ROOT, '.env');
export const CONFIG_DIR = process.env.CONFIG_DIR ? path.resolve(process.env.CONFIG_DIR) : path.join(ROOT, 'config');

// ค่าที่ตั้งจาก environment จริง (เช่น systemd หรือเทส) มีสิทธิ์เหนือค่าในไฟล์ .env เสมอ
const fromProcess = new Set(Object.keys(process.env));

function loadFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  const values = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries(values)) if (!fromProcess.has(k)) process.env[k] = v;
}

const str = (k, d = '') => (process.env[k] ?? '').trim() || d;
const bool = (k, d) => {
  const v = str(k);
  return v ? /^(1|true|yes|on)$/i.test(v) : d;
};

function build() {
  return {
    aiProviders: str('AI_PROVIDERS', 'gemini,groq,openrouter').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    geminiKey: str('GEMINI_API_KEY'),
    geminiModel: str('GEMINI_MODEL', 'gemini-3.5-flash'),
    groqKey: str('GROQ_API_KEY'),
    groqModel: str('GROQ_MODEL', 'openai/gpt-oss-120b'),
    openrouterKey: str('OPENROUTER_API_KEY'),
    openrouterModel: str('OPENROUTER_MODEL', 'google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free'),

    // ภาพประกอบจาก AI: ลองตามลำดับ ใส่ off เพื่อปิด
    aiImageProviders: str('AI_IMAGE_PROVIDERS', 'gemini,pollinations').toLowerCase() === 'off' ? []
      : str('AI_IMAGE_PROVIDERS', 'gemini,pollinations').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    geminiImageModel: str('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image'),
    // ธีมโพสต์อัตโนมัติ: mix = ใช้ธีมเพจทุกๆ THEME_BRAND_EVERY โพสต์ ที่เหลือสุ่ม | random | brand
    themeMode: ['mix', 'random', 'brand'].includes(str('THEME_MODE')) ? str('THEME_MODE') : 'mix',
    themeBrandEvery: Math.min(10, Math.max(2, Number(str('THEME_BRAND_EVERY', '3')) || 3)),
    useNews: bool('USE_NEWS', true),

    fbPageId: str('FB_PAGE_ID'),
    fbPageToken: str('FB_PAGE_TOKEN'),
    fbGraphVersion: str('FB_GRAPH_VERSION', 'v23.0'),

    timezone: str('TIMEZONE', 'Asia/Bangkok'),
    requireApproval: bool('REQUIRE_APPROVAL', true),
    dataDir: path.resolve(ROOT, str('DATA_DIR', './data')),
    bgImageDir: str('BG_IMAGE_DIR') ? path.resolve(ROOT, str('BG_IMAGE_DIR')) : '',

    host: str('HOST', '0.0.0.0'),
    port: Number(str('PORT', '8787')),
    publicUrl: str('PUBLIC_URL', 'http://localhost:8787').replace(/\/$/, ''),
    dashboardPassword: str('DASHBOARD_PASSWORD'),
    sessionSecret: str('SESSION_SECRET', 'dev-secret'),

    telegramToken: str('TELEGRAM_BOT_TOKEN'),
    telegramChatId: str('TELEGRAM_CHAT_ID'),
  };
}

loadFile();
export const env = build();

/** อ่าน .env ใหม่หลังแก้จากหน้าเว็บ — อัปเดต object เดิม ทุกโมดูลที่ import env จึงเห็นค่าใหม่ทันที */
export function reloadEnv() {
  loadFile();
  Object.assign(env, build());
  return env;
}

export const mediaDir = () => path.join(env.dataDir, 'media');
