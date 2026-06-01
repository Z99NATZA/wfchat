# Sync V1 Known Gaps

เอกสารนี้สรุปสิ่งที่ยังไม่สมบูรณ์ของระบบ sync ปัจจุบัน เพื่อใช้วางแผนรอบถัดไป

## 1) ขอบเขตที่ทำได้แล้ว
- guest -> account sync flow ทำงาน
- `POST /api/sync/preview`, `POST /api/sync/commit`, `GET /api/sync/changes` ใช้งานได้
- มี queue + retry + backoff ฝั่ง client
- มี delta sync สำหรับ `settings`, `memory`, `chat`
- มี tombstone delete สำหรับ `memory` และ `chat`

## 2) Known Gaps (ยังไม่สมบูรณ์)
1. Data source ยังไม่ single-source เต็มรูปแบบ  
   ตอนนี้บางส่วนยังอาศัย cache fallback เพื่อแสดงผลเมื่อ API fail

2. Conflict policy ยังเป็นระดับพื้นฐาน  
   ใช้ `updated_at` เป็นหลัก ยังไม่มี field-level merge และ merge preview ที่ละเอียด

3. Cursor/pull ยังไม่มี checkpoint/recovery แบบเข้ม  
   มี cursor แล้ว แต่ยังไม่มีกลไก recover ขั้นสูงเมื่อ apply ล้มเหลวบางส่วน

4. Auth profile persistence ยังไม่ครบ  
   หลัง reload อาจไม่ได้ `name/email` ถ้าไม่ persist profile ใน backend

5. Test coverage ยังไม่ครบ e2e  
   มี unit tests หลักแล้ว แต่ยังไม่ครบเส้นทาง integration/e2e ของ sync ทั้งก้อน

6. Observability ยังไม่ครบ production-grade  
   ยังไม่มี metrics/alerts ครบชุดสำหรับ success/fail/retry/conflict แบบติดตามได้ง่าย

## 3) ความเสี่ยงที่ต้องรู้
- ข้อมูลอาจดูไม่ตรงกันชั่วคราวระหว่าง local cache กับ API source ในบางสถานการณ์
- conflict edge cases อาจต้องแก้มือเมื่อมีการแก้ไขพร้อมกันหลายจุด
- ปัญหาที่เกิดเฉพาะ production load อาจยังมองไม่เห็นจนกว่าจะมี metric/alert ครบ

## 4) Next Steps (แนะนำลำดับ)
1. ทำ integration tests ฝั่ง API sync ให้ครบ (`preview/commit/changes/auth`)
2. ทำ e2e tests ฝั่ง web สำหรับ queue/retry/pull/tombstone
3. ทำ source-of-truth strategy ให้ชัด และลดการพึ่ง cache fallback
4. เพิ่ม observability (metrics + logs + alerts)
5. ปรับ conflict policy ให้ละเอียดขึ้นตาม use case จริง
