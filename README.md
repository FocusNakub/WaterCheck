# น้ำวันนี้
เว็บสถิตย์ + Cloudflare Pages Functions (โฟลเดอร์ functions/) ที่ดึงข้อมูลสดและแคชให้ ไม่ต้อง build

## Deploy (ต้องใช้ Functions จึงอัปโหลดผ่านหน้าเว็บไม่ได้)
วิธี A: เชื่อม GitHub repo → Pages → Build command ว่าง, output directory `/`
วิธี B: `npx wrangler pages deploy . --project-name flood-th`

หลัง deploy ข้อมูลอัปเดตเองตามรอบแคช (ไม่ต้อง push ใหม่): ระดับน้ำ/ฝน/เขื่อน 5 นาที, ถนน กทม. 5 นาที, น้ำทะเล 30 นาที, เตือนภัยน้ำป่า 15 นาที
ข้อมูลถนน กทม. จาก Floodboard (CC BY 4.0)

## ติดตั้งเป็นแอป (PWA)
เปิดเว็บผ่าน https (Cloudflare Pages) แล้วกด "ติดตั้ง/เพิ่มไปยังหน้าจอโฮม" ได้เลย (iPhone: Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม)
ไฟล์ที่เกี่ยวข้อง: manifest.webmanifest, sw.js, icons/ — ถ้าเพิ่มหน้าใหม่ ให้เพิ่มชื่อไฟล์ใน SHELL ของ sw.js และเปลี่ยนเลข V เมื่อแก้ไฟล์หลัก
