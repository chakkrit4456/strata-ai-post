// ตรวจเนื้อหาก่อนใช้งาน: ราคาต้องตรงกับ brand.yaml, ห้ามแต่งรีวิว/ตัวเลขลูกค้า,
// ไม่ซ้ำของเก่า, ข้อความแต่ละกลุ่มต้องไม่ก็อปกัน, กลุ่มที่ห้ามขายต้องไม่มีการขาย
import { maxSimilarity, similarity } from './similarity.js';

const BANNED = [
  'รับประกันรวย', 'รวยเร็ว', 'การันตียอดขาย', 'ถูกที่สุดในประเทศ', 'อันดับ 1', 'ดีที่สุดในไทย',
  'คลิกเลย!!!', 'ด่วนที่สุด', 'แชร์ด่วน',
];
const FABRICATION = [
  /ลูกค้า\s*(กว่า|มากกว่า|เกิน)?\s*\d[\d,]*\s*(ราย|คน|เจ้า|ร้าน)/,
  /\d[\d,]*\+?\s*(โปรเจกต์|โปรเจค|โปรเจ็กต์|งาน)\s*(ที่ส่งมอบ|สำเร็จ|แล้ว)/,
  /รีวิว\s*\d|\d(\.\d)?\s*ดาว|★{3,}/,
  /ลูกค้า(ชม|บอกว่า|รีวิว)/,
];
const SELLING = /(รับทำ|รับพัฒนา|รับจ้าง|ทักแชท|ทัก\s*inbox|inbox\s*มา|สนใจติดต่อ|สอบถามราคา|ราคาเริ่มต้น|ประเมินราคาฟรี|จ้างได้)/i;
const PRICE = /(?:฿\s*([\d,]+)|([\d,]{3,})\s*(?:บาท|฿|\.-))/g;

export const LIMITS = {
  caption: [150, 1500],
  variant: [100, 1500],
  headline: 70,
  bullets: 5,
  bullet: 90,
  hashtags: 3,
};

export function allowedPrices(brand) {
  return new Set(brand.packages.map((p) => Number(p.price)));
}

export function findPrices(text) {
  const out = [];
  for (const m of String(text).matchAll(PRICE)) out.push(Number((m[1] ?? m[2]).replace(/,/g, '')));
  return out.filter((n) => Number.isFinite(n) && n > 0);
}

const countHashtags = (s) => (String(s).match(/#[^\s#]+/g) ?? []).length;

function checkText(label, text, { brand, mode, range }) {
  const issues = [];
  const t = String(text ?? '');
  if (t.length < range[0] || t.length > range[1]) issues.push(`${label}: ความยาว ${t.length} ตัวอักษร (ต้อง ${range[0]}–${range[1]})`);
  for (const w of BANNED) if (t.includes(w)) issues.push(`${label}: มีคำโฆษณาเกินจริง "${w}"`);
  for (const re of FABRICATION) if (re.test(t)) issues.push(`${label}: อ้างจำนวนลูกค้า/ผลงาน/รีวิวที่ไม่มีในข้อมูล`);
  if (countHashtags(t) > LIMITS.hashtags) issues.push(`${label}: แฮชแท็กเกิน ${LIMITS.hashtags}`);
  const prices = findPrices(t);
  if (mode === 'promo') {
    const ok = allowedPrices(brand);
    for (const p of prices) if (!ok.has(p)) issues.push(`${label}: ราคา ${p} ไม่ตรงกับแพ็กเกจจริง`);
  } else {
    if (prices.length) issues.push(`${label}: โพสต์แบบไม่ขายห้ามมีราคา`);
    const m = t.match(SELLING);
    if (m) issues.push(`${label}: โพสต์แบบไม่ขายห้ามมีคำชวนซื้อ/จ้าง ("${m[0]}")`);
  }
  return issues;
}

function checkImage(label, img) {
  const issues = [];
  if (!img?.headline?.trim()) issues.push(`${label}: ไม่มี headline`);
  if ((img?.headline ?? '').length > LIMITS.headline) issues.push(`${label}: headline ยาวเกิน ${LIMITS.headline}`);
  if ((img?.bullets ?? []).length > LIMITS.bullets) issues.push(`${label}: bullets เกิน ${LIMITS.bullets} ข้อ`);
  for (const b of img?.bullets ?? []) if (b.length > LIMITS.bullet) issues.push(`${label}: bullet ยาวเกิน ${LIMITS.bullet}`);
  if ((img?.code ?? '').split('\n').length > 8) issues.push(`${label}: code เกิน 8 บรรทัด`);
  return issues;
}

/**
 * @param {object} content   ผลลัพธ์จาก writer
 * @param {object} slotPlan  { isPromo, groups: [{groupId, mode}] }
 * @param {object} ctx       { brand, history: { topics: string[], captions: string[] } }
 */
export function checkSlot(content, slotPlan, { brand, history = { topics: [], captions: [] }, news = null, requireNews = false, captionRange = LIMITS.caption }) {
  const issues = [];
  const pageMode = slotPlan.isPromo ? 'promo' : 'value';
  issues.push(...checkText('แคปชันเพจ', content.caption, { brand, mode: pageMode, range: captionRange }));
  issues.push(...checkImage('ภาพหลัก', content.image));
  if (slotPlan.groups.some((g) => g.mode === 'soft')) {
    issues.push(...checkImage('ภาพแบบไม่ขาย', content.softImage));
    const softText = [content.softImage?.headline, content.softImage?.subhead, ...(content.softImage?.bullets ?? []), content.softImage?.cta].join(' ');
    if (findPrices(softText).length || SELLING.test(softText)) issues.push('ภาพแบบไม่ขาย: ห้ามมีราคา/คำชวนจ้าง');
  }
  if (!slotPlan.isPromo) {
    const imgText = [content.image?.headline, content.image?.subhead, ...(content.image?.bullets ?? []), content.image?.cta].join(' ');
    if (findPrices(imgText).length) issues.push('ภาพหลัก: โพสต์แบบไม่ขายห้ามมีราคาในภาพ');
  }

  const topicDup = maxSimilarity(content.topic, history.topics);
  if (topicDup.score > 0.6) issues.push(`หัวข้อซ้ำกับของเก่า: "${history.topics[topicDup.index]}"`);
  const capDup = maxSimilarity(content.caption, history.captions);
  if (capDup.score > 0.45) issues.push(`แคปชันคล้ายโพสต์เก่าเกินไป (${capDup.score.toFixed(2)})`);

  const byGroup = new Map((content.variants ?? []).map((v) => [v.groupId, v.text]));
  const texts = [];
  for (const g of slotPlan.groups) {
    const text = byGroup.get(g.groupId);
    if (!text) { issues.push(`ไม่มีข้อความของกลุ่ม ${g.groupId}`); continue; }
    issues.push(...checkText(`กลุ่ม ${g.groupId}`, text, { brand, mode: g.mode, range: LIMITS.variant }));
    if (similarity(text, content.caption) > 0.8) issues.push(`กลุ่ม ${g.groupId}: เหมือนแคปชันเพจเกินไป ต้องเขียนใหม่`);
    const dup = maxSimilarity(text, texts.map((x) => x.text));
    if (dup.score > 0.75) issues.push(`กลุ่ม ${g.groupId}: เหมือนข้อความของกลุ่ม ${texts[dup.index].groupId} เกินไป`);
    texts.push({ groupId: g.groupId, text });
  }
  for (const id of byGroup.keys()) {
    if (!slotPlan.groups.some((g) => g.groupId === id)) issues.push(`มีข้อความของกลุ่ม ${id} ที่ไม่ได้อยู่ในแผน`);
  }

  // ข่าว: ต้องเป็นข่าวจากรายการที่ให้เท่านั้น (กันแต่งข่าว) และต้องบอกที่มาในแคปชัน
  if (news) {
    const url = String(content.newsUrl ?? '').trim();
    const item = url ? news.find((n) => n.url === url) : null;
    if (url && !item) issues.push('newsUrl ไม่ตรงกับลิงก์ในรายการข่าวที่ให้ (ห้ามแต่งข่าว)');
    if (requireNews && !url) issues.push('หมวดข่าว/เทรนด์ต้องเลือกข่าว 1 ข่าวจากรายการ และใส่ newsUrl');
    if (item && !content.caption.toLowerCase().includes(item.source.toLowerCase().slice(0, 12))) {
      issues.push(`แคปชันต้องบอกที่มาของข่าว (เช่น "ที่มา: ${item.source}")`);
    }
  }
  return { ok: issues.length === 0, issues };
}
