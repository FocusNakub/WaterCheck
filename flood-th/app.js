// ตัวช่วยกลาง: ดึง API สด, ตกลงมาใช้ข้อมูลตัวอย่างเมื่อดึงไม่ได้
const BASE='https://api-v3.thaiwater.net/api/v1/thaiwater30/';
const LV={1:'ปกติ',2:'เฝ้าระวัง',3:'เตือนภัย',4:'วิกฤต',5:'น้ำล้นตลิ่ง'};
const $=s=>document.querySelector(s);
const tx=v=>v==null?'':(typeof v==='object'?(v.th??v.en??''):String(v));
const num=(v,d=2)=>{const n=parseFloat(v);return isFinite(n)?n.toLocaleString('th-TH',{maximumFractionDigits:d}):'-'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ดึงข้อมูล: คืน {data, live}; ถ้าล้มเหลวคืน fallback
async function fx(proxy,direct,opts){
  const errs=[];
  for(const u of [proxy,direct]){const h=u.startsWith('/')?'ตัวกลาง':new URL(u).host;
    try{const r=await fetch(u,opts);if(r.ok)return r;errs.push(h+' '+r.status+' '+(await r.text()).slice(0,100))}
    catch(e){errs.push(h+' '+(e.message||'ผิดพลาด'))}}
  throw new Error(errs.join(' | '));
}
async function load(path,fallback){
  try{
    const r=await fx('/api/tw/'+path,BASE+path,{headers:{Accept:'application/json'}});
    return {data:await r.json(),live:true,at:new Date()};
  }catch(e){return {data:fallback,live:false,at:null,error:String(e)}}
}
function status(el,res,extra=''){
  el.innerHTML=res.live
   ?`<span class="badge live">ข้อมูลล่าสุด</span><span>ดึงมาเมื่อ ${res.at.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น. <span class="ago" data-t="${res.at.getTime()}"></span> · หน้านี้อัปเดตเองทุก 5 นาที</span>`
   :`<span class="badge snap">ยังดึงข้อมูลล่าสุดไม่ได้</span><span>ตัวเลขด้านล่างอาจไม่ใช่ค่าปัจจุบัน ลองกดรีเฟรชอีกครั้งในอีกสักครู่</span><details style="width:100%;font-size:.85rem;color:var(--mut)"><summary>รายละเอียดสำหรับผู้ดูแลเว็บ</summary>${esc(res.error||'')}</details>`;
  el.insertAdjacentHTML('beforeend',extra);tickAgo();
}
// "x นาทีที่แล้ว" อัปเดตทุก 30 วินาที
function tickAgo(){document.querySelectorAll('.ago[data-t]').forEach(e=>{const m=Math.floor((Date.now()+0-e.dataset.t)/60000);e.textContent=m<1?'(เมื่อสักครู่)':`(${m} นาทีที่แล้ว)`})}
setInterval(tickAgo,30000);
const thDate=d=>{if(!d)return '-';const x=new Date(String(d).trim().replace(' ','T')+(String(d).length<=10?'T00:00:00+07:00':'+07:00'));return isNaN(x)?String(d):x.toLocaleDateString('th-TH',{day:'numeric',month:'short'})+(String(d).length>10?' '+x.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})+' น.':'')};
// หาอาร์เรย์ของออบเจ็กต์ตัวแรกในผลลัพธ์ (รองรับโครงสร้างที่ต่างกัน)
function findRows(o){
  if(Array.isArray(o))return o;
  if(o&&typeof o==='object')for(const k in o){const r=findRows(o[k]);if(r&&r.length)return r}
  return null;
}
// รายการเขื่อน/อ่างจากโครงสร้างใดก็ได้ + คำนวณ % เองเมื่อต้นทางส่ง 0
function damList(j){
  const out=[];(function walk(o){if(Array.isArray(o))return o.forEach(walk);if(o&&typeof o==='object'){if('dam_storage' in o||'percent_storage' in o){out.push(o);return}for(const k in o)walk(o[k])}})(j);
  const seen=new Set();
  return out.map(r=>{const d=r.dam||{},cap=parseFloat(d.normal_storage),s=parseFloat(r.dam_storage??r.volume);let p=parseFloat(r.dam_storage_percent??r.percent_storage);
    if(!(p>0)&&cap>0&&isFinite(s))p=s/cap*100;const ok=isFinite(s)&&isFinite(p)&&(p>0||s>0);
    return{n:tx(d.dam_name)||tx(d.smalldam_name)||tx(r.dam_name),s:isFinite(s)?s:null,cap,p:ok?p:null,i:r.dam_inflow,o:r.dam_released,reg:tx(r.geocode?.area_name),prov:tx(r.geocode?.province_name),d:r.dam_date||r.smalldam_datetime}})
   .filter(r=>r.n&&!seen.has(r.n)&&seen.add(r.n));
}
// ตรวจคุณภาพข้อมูลสถานีวัดน้ำ
// noBank: สถานีไม่มีค่าตลิ่งในระบบ ทำให้ "สูงกว่าตลิ่ง" เท่ากับระดับน้ำพอดี (เช่น 331.7 ม.) ไม่ใช่น้ำล้นจริง
// stale: เวลาของข้อมูลเก่ากว่า WL_MAX_H ชั่วโมง
const WL_MAX_H=24;
function wlTime(r){
  let v=r.waterlevel_datetime||r.waterlevel_date||r.datetime;
  if(!v){for(const k in r){if(/datetime/i.test(k)&&r[k]&&typeof r[k]!=='object'){v=r[k];break}}}
  if(!v&&r.station&&typeof r.station==='object'){for(const k in r.station){if(/waterlevel.*(datetime|date)/i.test(k)&&r.station[k]){v=r.station[k];break}}}
  if(!v)return null;
  let t=String(v).trim().replace(' ','T');
  if(!/[zZ]|[+-]\d\d:?\d\d$/.test(t))t+='+07:00';
  const d=new Date(t);return isNaN(d)?null:d;
}
function wlInfo(r){
  const m=parseFloat(r.waterlevel_msl),d=parseFloat(r.diff_wl_bank);
  const noBank=isFinite(d)&&isFinite(m)&&Math.abs(d-m)<0.015;
  const t=wlTime(r),age=t?(Date.now()-t.getTime())/36e5:null;
  return{noBank,t,age,stale:age!=null&&age>WL_MAX_H,noTime:!t};
}
const wlOk=r=>{const i=wlInfo(r);return !i.noBank&&!i.stale};
function levelOf(r){
  if(wlInfo(r).noBank)return 0;
  if((r.diff_wl_bank_text||'').startsWith('ล้นตลิ่ง'))return 5;
  return parseInt(r.situation_level)||1;
}
function lvHtml(n){return n===0?'<span class="lv l1"><i></i>ไม่มีค่าตลิ่ง</span>':`<span class="lv l${n}"><i></i>${LV[n]||'-'}</span>`}
function nav(page){
  const items=[['index.html','หน้าแรก'],['bma.html','ถนนน้ำท่วม กทม.'],['districts.html','น้ำท่วมรายเขต กทม.'],['levels.html','ระดับน้ำในแม่น้ำ'],['dams.html','เขื่อน'],['reservoirs.html','อ่างเก็บน้ำ'],['rain.html','ฝนที่ตกแล้ว'],['forecast.html','พยากรณ์ฝน/เรดาร์'],['tide.html','น้ำทะเลหนุน'],['warning.html','เตือนภัยน้ำป่า'],['help.html','เบอร์ฉุกเฉิน']];
  const h=document.querySelector('header.top');
  h.insertAdjacentHTML('beforebegin',`<div class="sos"><div class="wrap"><span>เหตุฉุกเฉิน</span><a href="tel:1784"><b>1784</b>ปภ.</a><a href="tel:1669"><b>1669</b>เจ็บป่วย</a><a href="tel:191"><b>191</b>ตำรวจ</a><a href="tel:1555"><b>1555</b>กทม.</a></div></div>`);
  const curName=(items.find(i=>i[0]===page)||items[0])[1];
  // ส่วนหัว: โลโก้ + ปรับขนาดตัวอักษร + เมนูแท็บ (มือถือย่อเป็นปุ่ม)
  h.innerHTML=`<div class="wrap"><div class="headrow"><a class="brand" href="index.html"><img src="icons/icon-192.png" alt="">น้ำวันนี้<small>สถานการณ์น้ำทั่วไทย สด</small></a><div class="sizer" role="group" aria-label="ขนาดตัวอักษร"><span>ขนาดตัวอักษร</span><button type="button" data-z="-1" aria-label="ตัวเล็กลง">ก-</button><button type="button" data-z="1" aria-label="ตัวใหญ่ขึ้น">ก+</button></div></div><button type="button" class="menubtn" aria-expanded="false" aria-controls="mainmenu"><span>☰ เมนู</span><b>${curName}</b></button><nav class="menu" id="mainmenu" aria-label="เมนูหลัก">${items.map(([u,t])=>`<a href="${u}"${u===page?' aria-current="page"':''}>${t}</a>`).join('')}</nav></div>`;
  document.querySelector('footer').innerHTML=`<div class="wrap">ข้อมูลน้ำ ฝน เขื่อน อ่างเก็บน้ำ: สถาบันสารสนเทศทรัพยากรน้ำ (สสน. / thaiwater.net) · ถนนน้ำท่วม กทม.: <a href="https://floodboard.org" target="_blank" rel="noopener">Floodboard</a> (CC BY 4.0) · สถานีเตือนภัย: กรมทรัพยากรน้ำ · พยากรณ์ฝน: Open-Meteo · เรดาร์: RainViewer<br>เว็บนี้ช่วยดูสถานการณ์เท่านั้น ถ้าหน่วยงานรัฐประกาศให้อพยพ ให้ทำตามประกาศทันที</div>`;
  const ac=h.querySelector('nav.menu a[aria-current]');if(ac)ac.scrollIntoView({block:'nearest',inline:'center'});const mb=h.querySelector('.menubtn');mb.onclick=()=>{const o=mb.getAttribute('aria-expanded')!=='true';mb.setAttribute('aria-expanded',o)};
  // ขนาดตัวอักษร (จำไว้ในเครื่อง)
  const S=[15,17,19,21,24];let z=1;try{z=+(localStorage.getItem('fz')??1)}catch(e){}
  const apply=()=>{document.documentElement.style.setProperty('--fs',S[z]+'px');try{localStorage.setItem('fz',z)}catch(e){}};apply();
  h.querySelectorAll('.sizer button').forEach(b=>b.onclick=()=>{z=Math.max(0,Math.min(S.length-1,z+ +b.dataset.z));apply()});
  // อัปเดตข้อมูลเองทุก 5 นาที (ไม่รีเฟรชถ้ากำลังพิมพ์ค้นหาอยู่)
  // อัปเดตข้อมูลเองทุก 5 นาที โดยจำตัวกรอง แท็บ และตำแหน่งที่เลื่อนไว้
  const KEY='st:'+page;
  if(!window.NO_AUTO_RELOAD)setInterval(()=>{const a=document.activeElement;if(document.hidden||(a&&a.tagName==='INPUT'&&a.type==='search'&&a===document.activeElement&&a.value&&Date.now()-(window.__typed||0)<20000))return;
    const vals={};document.querySelectorAll('main input[id],main select[id]').forEach(e=>vals[e.id]=e.type==='checkbox'?e.checked:e.value);
    const tab=document.querySelector('#tabs button[aria-pressed=true]');
    try{sessionStorage.setItem(KEY,JSON.stringify({vals,tab:tab&&tab.dataset.k,y:scrollY}))}catch(e){}
    location.reload()},300000);
  document.addEventListener('input',()=>window.__typed=Date.now());
  let st=null;try{st=JSON.parse(sessionStorage.getItem(KEY));sessionStorage.removeItem(KEY)}catch(e){}
  if(st)setTimeout(()=>{
    if(st.tab){const b=document.querySelector(`#tabs button[data-k="${st.tab}"]`);if(b&&b.getAttribute('aria-pressed')!=='true')b.click()}
    for(const id in st.vals){const e=document.getElementById(id);if(!e)continue;if(e.type==='checkbox')e.checked=st.vals[id];else e.value=st.vals[id];e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'))}
    scrollTo(0,st.y||0)},800);
}
// ---------- ข้อมูลสำรอง (ตัวอย่างเพื่อแสดงรูปแบบ ไม่ใช่ค่าปัจจุบัน) ----------
const FB_WL={waterlevel_data:{data:[
 {station:{tele_station_name:{th:'C.2 นครสวรรค์'}},geocode:{province_name:{th:'นครสวรรค์'}},waterlevel_msl:'23.1',diff_wl_bank:'0.40',diff_wl_bank_text:'ล้นตลิ่ง (ม.)',situation_level:5},
 {station:{tele_station_name:{th:'C.29A ชัยนาท'}},geocode:{province_name:{th:'ชัยนาท'}},waterlevel_msl:'16.9',diff_wl_bank:'0.80',diff_wl_bank_text:'ต่ำกว่าตลิ่ง (ม.)',situation_level:3},
 {station:{tele_station_name:{th:'สะพานพระราม 6'}},geocode:{province_name:{th:'กรุงเทพฯ'}},waterlevel_msl:'2.1',diff_wl_bank:'0.30',diff_wl_bank_text:'ต่ำกว่าตลิ่ง (ม.)',situation_level:2}]}};
const FB_DAM={dam_hourly:[
 {dam_name:{th:'เขื่อนภูมิพล'},dam_storage:'10,900',dam_storage_percent:'81',dam_inflow:'120',dam_released:'60'},
 {dam_name:{th:'เขื่อนสิริกิติ์'},dam_storage:'7,200',dam_storage_percent:'76',dam_inflow:'150',dam_released:'100'},
 {dam_name:{th:'เขื่อนศรีนครินทร์'},dam_storage:'16,500',dam_storage_percent:'92',dam_inflow:'300',dam_released:'200'}]};
const FB_RAIN={data:[
 {station:{tele_station_name:{th:'ตัวอย่าง สถานี ก'}},geocode:{province_name:{th:'กรุงเทพฯ'}},rain_24h:'42.0'},
 {station:{tele_station_name:{th:'ตัวอย่าง สถานี ข'}},geocode:{province_name:{th:'ฉะเชิงเทรา'}},rain_24h:'37.0'}]};

const fmtT=t=>new Date(t).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});
async function local(p){const r=await fetch(p);if(!r.ok)throw new Error(r.status);return r.json()}

const LEAF_OK=()=>typeof L!=='undefined';
function csv(t){
  t=t.replace(/^\uFEFF/,'');const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"')q=true;else if(c===','){row.push(cur.trim());cur=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cur.trim());cur='';if(row.some(x=>x))rows.push(row);row=[]}
    else cur+=c}
  row.push(cur.trim());if(row.some(x=>x))rows.push(row);
  const h=rows[0]||[];return rows.slice(1).map(r=>{const o={};h.forEach((k,i)=>o[k]=r[i]);return o});
}

// ลงทะเบียน service worker ให้ติดตั้งเป็นแอปได้ (ต้องเปิดผ่าน https หรือ localhost)
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
