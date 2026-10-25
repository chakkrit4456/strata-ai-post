// หน้า "สร้างและโพสต์ทันที": เลือกหมวด/หัวข้อ/กลุ่มจริง แล้วให้ระบบทำจนจบ (หรือหยุดให้ดูร่างก่อน)
import { loadGroups, loadPillars, groupProblem } from '../../config.js';
import { startCreateNow, jobState } from '../../jobs.js';
import { esc, badge, layout, field, select, csrfInput } from '../ui.js';
import { PROMO, DAY_LABEL, redirect } from './shared.js';
import { jobBanner } from './queue.js';
import { env } from '../../env.js';
import * as db from '../../db.js';
import { themePicker, toneOptions, PICKER_CSS } from '../picker.js';
import { FORMATS } from '../../content/prompts.js';

function styleSection(values) {
  const news = env.useNews ? db.freshNews({ days: 3, limit: 40 }) : [];
  const picked = values.news ?? '';
  const newsOpts = [['', news.length ? 'ให้ AI เลือกข่าวที่เข้ากับหัวข้อเอง (ถ้ามี)' : 'ยังไม่มีข่าว — ดึงข่าวได้ที่หน้า "ข่าว/เทรนด์"'], ['none', 'ไม่ใช้ข่าว'],
    ...news.map((n) => [n.url, `[${n.source}] ${n.title.slice(0, 90)}`])];
  return `${PICKER_CSS}<section class="card"><h2 style="margin-top:0">หน้าตาและสไตล์</h2>
    <div class="field"><span>ธีมภาพ (ชุดสี ฟอนต์ ลวดลาย)</span>${themePicker('theme', values.theme ?? '')}</div>
    ${select('รูปแบบเนื้อหา', 'format', values.format ?? 'normal', FORMATS.map((x) => [x.id, `${x.name} (${x.range[0]}–${x.range[1]} ตัวอักษร)`]), { hint: 'บทความยาว = ให้ความรู้แบบละเอียด · โพสต์โฆษณา = ขายบริการ ชวนทัก Inbox' })}
    ${select('สไตล์คำบรรยาย', 'tone', values.tone ?? '', toneOptions())}
    ${select('ข่าว/เทรนด์ที่จะใช้', 'news', picked, newsOpts, { hint: 'เลือกหมวด "ข่าว/เทรนด์ล่าสุด" ถ้าอยากให้ทั้งโพสต์เล่าเรื่องข่าว' })}
    <label class="check"><input type="checkbox" name="aiImage" value="1"${values.aiImage === false ? '' : ' checked'}> สร้างภาพประกอบด้วย AI (ฟรี ใช้เวลาเพิ่ม ~10–30 วินาที)</label>
  </section>`;
}

function page(ctx, { error, values = {} } = {}) {
  const j = jobState();
  let pillars = [];
  try { pillars = loadPillars().pillars; } catch { /* แสดงหน้าได้แม้ config เสีย */ }
  const groups = loadGroups();
  const picked = new Set([].concat(values.groups ?? []));
  const rows = groups.map((g) => {
    const problem = groupProblem(g);
    const promo = g.promo === 'days' ? `${PROMO.days}: ${g.promoDays.map((d) => DAY_LABEL[d]).join(' ')}` : PROMO[g.promo];
    return `<label class="item${problem ? ' disabled' : ''}" style="display:flex;gap:12px;align-items:flex-start;margin-bottom:8px;cursor:${problem ? 'not-allowed' : 'pointer'}">
      <input type="checkbox" name="groups" value="${esc(g.id)}" class="grp"${problem ? ' disabled' : ''}${picked.has(g.id) ? ' checked' : ''} style="margin-top:5px">
      <span style="flex:1"><strong>${esc(g.name)}</strong> ${badge([promo, 'info'])}
        <div class="muted">${problem ? `<span class="bad">${esc(problem)}</span>` : esc(g.url)}</div></span></label>`;
  }).join('');
  const realCount = groups.filter((g) => !groupProblem(g)).length;

  return {
    status: error ? 400 : 200,
    html: layout({
      title: 'สร้างและโพสต์ทันที', active: 'now', flash: error ? { err: error } : ctx.flash, refresh: j.running ? 8 : 0,
      body: `${jobBanner()}<h1>⚡ สร้างและโพสต์ทันที</h1>
      <p class="muted">ระบบจะให้ AI คิดและเขียนโพสต์ ทำภาพ ตรวจเนื้อหา แล้วโพสต์ลงเพจให้จนเสร็จ
        ส่วนกลุ่มที่เลือก ระบบเตรียมข้อความแยกให้แต่ละกลุ่ม แล้วคุณกด "คัดลอก + เปิดกลุ่ม" เพื่อวางโพสต์เอง (Facebook ไม่อนุญาตให้โปรแกรมโพสต์ลงกลุ่ม)</p>
      <form method="post" action="/now">${csrfInput(ctx.csrf)}
        <section class="card"><h2 style="margin-top:0">เนื้อหา</h2>
          ${select('หมวด', 'pillar', values.pillar ?? '', [['', 'ให้ระบบเลือกให้'], ...pillars.map((p) => [p.id, `${p.label}${p.kind === 'promo' ? ' (โปรโมท)' : ''}`])])}
          ${field('หัวข้อที่อยากให้เขียน (ไม่บังคับ)', 'topic', values.topic ?? '', { hint: 'เช่น "ระบบจองห้องพักสำหรับรีสอร์ตเล็ก" — เว้นว่างให้ AI คิดเอง', attrs: 'maxlength="300"' })}
        </section>
        ${styleSection(values)}
        <section class="card"><div class="head"><h2 style="margin:0 auto 0 0">ส่งไปกลุ่มไหนบ้าง</h2>
          ${realCount ? `<label class="check"><input type="checkbox" id="all" onchange="document.querySelectorAll('.grp:not(:disabled)').forEach(c=>c.checked=this.checked)"> เลือกทั้งหมด (${realCount})</label>` : ''}</div>
          ${realCount ? '' : '<div class="flash warn">ยังไม่มีกลุ่ม Facebook จริงที่ใช้ได้ — เพิ่มลิงก์กลุ่มจริงที่หน้า <a href="/groups">กลุ่ม</a> ก่อน (โพสต์เพจอย่างเดียวได้)</div>'}
          ${rows || '<p class="muted">ยังไม่มีกลุ่ม</p>'}
          <p class="muted">ไม่เลือกกลุ่มเลย = โพสต์ลงเพจอย่างเดียว</p></section>
        <section class="card">
          <label class="check"><input type="checkbox" name="preview" value="1"${values.preview === false ? '' : ' checked'}> ดูร่างก่อนโพสต์ (เอาออก = โพสต์ลงเพจทันทีจนเสร็จ)</label>
          <div class="actions"><button class="primary"${j.running ? ' disabled' : ''}>${j.running ? 'มีงานกำลังทำอยู่…' : 'เริ่มเลย'}</button></div>
        </section>
      </form>`,
    }),
  };
}

export const routes = [
  // /now?news=<url> มาจากปุ่ม "สร้างโพสต์จากข่าวนี้" ในหน้าข่าว
  ['GET', /^\/now$/, (ctx) => page(ctx, { values: ctx.query.get('news') ? { news: ctx.query.get('news'), pillar: 'trend' } : {} })],
  ['POST', /^\/now$/, (ctx) => {
    const f = ctx.form;
    const values = {
      pillar: f.pillar ?? '', topic: f.topic ?? '', groups: [].concat(f.groups ?? []), preview: f.preview === '1',
      theme: f.theme ?? '', tone: f.tone ?? '', format: f.format ?? 'normal', news: f.news ?? '', aiImage: f.aiImage === '1',
    };
    try {
      startCreateNow({
        pillarId: values.pillar, topicHint: values.topic, groupIds: values.groups, preview: values.preview,
        theme: values.theme, tone: values.tone, format: values.format, newsUrl: values.news, aiImage: values.aiImage,
      });
    } catch (e) {
      return page(ctx, { error: e.message, values });
    }
    return redirect('/now');
  }],
];
