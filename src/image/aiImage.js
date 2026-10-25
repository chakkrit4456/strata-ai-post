// ภาพประกอบจาก AI (ไม่มีตัวอักษร) ใช้เป็นพื้นหลัง/ภาพในการ์ด — ฟรีทั้งหมด ล้มเหลวก็โพสต์ต่อได้โดยไม่มีภาพ
// ลำดับเริ่มต้น: Gemini image (คมกว่า ใช้ได้เมื่อมีคีย์/โควตา) → Pollinations (ฟรี ไม่ต้องใช้คีย์)
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { env } from '../env.js';
import { getTheme } from './themes.js';

const NO_TEXT = 'no text, no letters, no words, no logo, no watermark, no signature';
const AVOID = 'not blurry, not low quality, no grain, no distortion, no extra fingers';
// แบนเนอร์เป็นแนวนอน 16:9 · โพสต์ทั่วไปแนวตั้ง 4:5 (ตรงกับขนาดใน render.js)
const FORMAT = { banner: { width: 1600, height: 900, ratio: '16:9' }, default: { width: 1080, height: 1350, ratio: '4:5' } };
const formatFor = (layout) => FORMAT[layout] ?? FORMAT.default;

export function imagePrompt(visual, themeId, layout) {
  const t = getTheme(themeId);
  const place = layout === 'banner'
    ? 'main subject on the right half, left side dark and empty for text'
    : 'main subject in the upper half, lower half dark and empty for text';
  return `Premium tech advertising key visual: ${String(visual || 'modern laptop and smartphone showing a clean business dashboard').slice(0, 300)}. `
    + `Photorealistic 3D product render, cinematic lighting, soft rim light in ${t.colors.accent}, subtle glow in ${t.colors.accent2}, `
    + `dark moody background, everything in crisp sharp focus, ultra detailed, 8k, professional commercial photography. `
    + `Mood: ${t.mood}. Composition: ${place}. ${NO_TEXT}, ${AVOID}`;
}

async function pollinations(prompt, seed, layout) {
  const { width, height } = formatFor(layout);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&enhance=true&model=flux&seed=${seed}`;
  let res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  // ฟรีได้ 1 ภาพ/45 วินาทีต่อ IP — โดนจำกัดก็รอแล้วลองใหม่ 1 ครั้ง
  if (res.status === 402 || res.status === 429) {
    await new Promise((r) => setTimeout(r, 46_000));
    res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error(`pollinations ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5_000) throw new Error('pollinations: ภาพเล็กผิดปกติ');
  return { buf, ext: type.includes('png') ? '.png' : '.jpg' };
}

async function gemini(prompt, _seed, layout) {
  if (!env.geminiKey) throw new Error('gemini: ไม่มีคีย์');
  const ai = new GoogleGenAI({ apiKey: env.geminiKey, httpOptions: { timeout: 90_000 } });
  const res = await ai.models.generateContent({
    model: env.geminiImageModel, contents: prompt,
    config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: formatFor(layout).ratio } },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('gemini: ไม่ได้ภาพ');
  return { buf: Buffer.from(part.inlineData.data, 'base64'), ext: part.inlineData.mimeType?.includes('jpeg') ? '.jpg' : '.png' };
}

const PROVIDERS = { pollinations, gemini };

/**
 * @param {{ visual: string, theme: string, layout?: string, outBase: string }} o  outBase = path ไม่มีนามสกุล
 * @returns {Promise<{ file: string|null, provider?: string, error?: string }>}
 */
export async function generateAiImage({ visual, theme, layout, outBase }) {
  if (!env.aiImageProviders.length) return { file: null };
  const prompt = imagePrompt(visual, theme, layout);
  const seed = Math.floor(Math.random() * 1e9);
  const errors = [];
  for (const name of env.aiImageProviders) {
    const fn = PROVIDERS[name];
    if (!fn) continue;
    try {
      const { buf, ext } = await fn(prompt, seed, layout);
      const file = `${outBase}${ext}`;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      return { file, provider: name };
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  console.warn(`  ↪ สร้างภาพ AI ไม่สำเร็จ (${errors.join(' | ')}) — ใช้ภาพแบบไม่มีภาพประกอบ`);
  return { file: null, error: errors.join(' | ') };
}
