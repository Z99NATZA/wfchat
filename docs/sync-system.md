# Sync System (Guest -> Account) - Current Implementation Guide

## 1) เป้าหมายของระบบ
ระบบ sync นี้ถูกออกแบบมาเพื่อ:
- ให้ผู้ใช้ใช้งานได้เลยแบบ `guest` โดยไม่ต้อง login
- เมื่อผู้ใช้ login ภายหลัง สามารถ sync ข้อมูลที่ทำไว้ขึ้น backend ได้
- รักษา UX ให้ลื่น โดยไม่บังคับ popup หนักและไม่บังคับ login ตั้งแต่ต้น

สถานะตอนนี้:
- มี `guest session` จริงที่ backend
- มี `in-app auth UI` แบบ mock (Google/Email mock สำหรับ flow)
- มี sync จริงสำหรับ `settings` (theme/font/locale)
- มี `sync queue + retry` ฝั่ง frontend

---

## 2) คำศัพท์หลัก
`Guest`:
- ผู้ใช้ที่ยังไม่ login
- ใช้งานได้ทันที

`Session`:
- ตัวระบุผู้ใช้ชั่วคราวในระบบ backend (`session_id`)
- frontend ส่งผ่าน header `X-WFChat-Session`

`Sync Item`:
- หน่วยข้อมูลที่ส่ง sync
- ตอนนี้ใช้กับ setting รายตัว เช่น `settings.theme`

`Preview`:
- ตรวจสอบก่อน commit ว่าจะ create/update/conflict เท่าไร

`Commit`:
- บันทึก sync item ลง backend จริง

---

## 3) สถาปัตยกรรมภาพรวม
ฝั่ง Frontend:
- เก็บค่าจริงใน local storage (`wfchat-theme`, `wfchat-font`, `wfchat.locale`)
- เก็บ metadata เวลาแก้ไขของแต่ละ key ใน `wfchat-sync-meta`
- เมื่อกด `Sync now` จะยิง `preview -> commit`

ฝั่ง Backend:
- รับ session จาก header
- คำนวณ preview โดยเทียบ `item_id` และ `updated_at` กับข้อมูลที่มี
- commit แบบ upsert ลงตาราง `sync_entities`
- บันทึกประวัติ commit ลง `sync_commits` ด้วย `operation_id`

---

## 4) Data Model ฝั่ง Frontend
Local keys ที่เกี่ยวข้อง:
- `wfchat-auth-state`
- `wfchat.sessionId`
- `wfchat-theme`
- `wfchat-font`
- `wfchat.locale`
- `wfchat-sync-meta`
- `wfchat-sync-queue`

ตัวอย่าง `wfchat-sync-meta`:
```json
{
  "settings.theme": 1780325400,
  "settings.font": 1780325410,
  "settings.locale": 1780325420
}
```

หมายเหตุ:
- `updatedAt` ของ sync item จะอ่านจาก key นี้
- ถ้าไม่มี metadata จะ fallback เป็นเวลา current time ตอน sync

---

## 5) Data Model ฝั่ง Backend
### 5.1 ตาราง `sync_entities`
เก็บ state ล่าสุดของ item ต่อ session
- `session_id` (uuid)
- `item_id` (text) เช่น `settings.theme`
- `item_type` (text) เช่น `setting`
- `updated_at` (timestamptz)
- `deleted_at` (timestamptz, nullable)
- `payload` (jsonb)

Primary key:
- `(session_id, item_id)`

### 5.2 ตาราง `sync_commits`
เก็บประวัติการ commit ต่อ operation
- `operation_id` (text)
- `session_id` (uuid)
- `user_id` (uuid)
- `merged_count` (integer)
- `conflict_count` (integer)
- `committed_at` (timestamptz)

Primary key:
- `(operation_id, session_id)`

---

## 6) API Contract ที่ใช้อยู่ตอนนี้
### 6.1 `POST /api/sync/preview`
Request:
```json
{
  "items": [
    {
      "item_id": "settings.theme",
      "item_type": "setting",
      "updated_at": 1780325400,
      "deleted_at": null,
      "payload": { "key": "theme", "value": "dark" }
    }
  ]
}
```

Response:
```json
{
  "to_create": 1,
  "to_update": 0,
  "conflicts": 0
}
```

### 6.2 `POST /api/sync/commit`
Request:
```json
{
  "operation_id": "sync-1780325400-abc123",
  "items": [
    {
      "item_id": "settings.theme",
      "item_type": "setting",
      "updated_at": 1780325400,
      "deleted_at": null,
      "payload": { "key": "theme", "value": "dark" }
    }
  ]
}
```

Response:
```json
{
  "operation_id": "sync-1780325400-abc123",
  "merged_count": 1,
  "conflict_count": 0,
  "committed_at": 1780325401
}
```

---

## 7) Merge Rule ที่ใช้อยู่ตอนนี้
`Preview`:
- ถ้า `item_id` ยังไม่เคยมีใน session => `to_create`
- ถ้ามีแล้ว และ `incoming.updated_at >= existing.updated_at` => `to_update`
- ถ้า `incoming.updated_at < existing.updated_at` => `conflict`

`Commit`:
- upsert ตาม `(session_id, item_id)`
- update เฉพาะกรณี `existing.updated_at <= incoming.updated_at`

ผลลัพธ์:
- ข้อมูลเก่ากว่าไม่ทับข้อมูลใหม่กว่า
- รองรับการยิงซ้ำโดยใช้ `operation_id` ใน commit log

---

## 8) End-to-End Flow จริงของผู้ใช้
1. ผู้ใช้เปิดเว็บแบบ guest
2. ผู้ใช้เปลี่ยน theme/font/locale
3. ฝั่ง frontend persist ค่าจริง + touch `wfchat-sync-meta`
4. ผู้ใช้เปิด Profile modal แล้ว login (mock)
5. ระบบแสดง pending sync
6. ผู้ใช้กด `Sync now`
7. frontend `enqueue` รายการลง `wfchat-sync-queue`
8. frontend `flush` คิวโดยยิง `preview -> commit`
9. ถ้าสำเร็จ ระบบเอารายการออกจากคิว
10. ถ้าคิวว่าง ระบบ mark pending sync = false

---

## 9) Sync Queue + Retry (ใหม่)
Queue shape:
```json
[
  {
    "operation_id": "sync-1780327000-abc123",
    "attempt": 1,
    "next_retry_at": 1780327008,
    "items": []
  }
]
```

พฤติกรรม:
- ทุกครั้งที่กด `Sync now` จะ enqueue ก่อน
- flush จะส่งเฉพาะรายการคิวตัวแรก
- ถ้าสำเร็จ: ลบหัวคิว
- ถ้าล้มเหลว: เพิ่ม `attempt` และคำนวณ `next_retry_at` ด้วย exponential backoff + jitter
- ระบบจะพยายาม flush อีกครั้งเมื่อ:
  - ผู้ใช้กด sync ใหม่
  - เปิดแอปในสถานะ login อยู่
  - browser กลับมา online

---

## 10) วิธีทดสอบปัจจุบัน
1. รัน backend และ frontend
2. เปลี่ยน theme/font/locale อย่างน้อย 1 อย่าง
3. เปิด DevTools -> Application -> Local Storage
4. ตรวจว่ามี `wfchat-sync-meta` และค่าถูกอัปเดต
5. login จาก Profile (mock)
6. กด `Sync now`
7. ดู Network ต้องมี:
- `POST /api/sync/preview`
- `POST /api/sync/commit`
8. ตรวจ response ว่า `merged_count` > 0

---

## 11) ขอบเขตที่ยังไม่ทำ (สำคัญ)
ยังไม่มีของต่อไปนี้:
- auth จริง (Google OAuth/Email auth production)
- `GET /sync/changes` สำหรับ cloud -> local
- conflict resolution ระดับ field แบบละเอียด
- sync ข้อมูล chat/memory เต็มรูปแบบเป็น delta

---

## 12) แผนลำดับงานถัดไป (แนะนำ)
1. เพิ่ม `GET /sync/changes` + cursor
2. ทำ two-way sync v1
3. ต่อ auth จริง (Google/Email)
4. เพิ่ม observability metrics และ alert

---

## 13) ไฟล์ที่เกี่ยวข้อง (Reference)
Backend:
- `apps/api/src/sync.rs`
- `apps/api/src/store.rs`
- `apps/api/src/app.rs`

Frontend:
- `apps/web/src/services/syncService.ts`
- `apps/web/src/stores/syncStateStore.ts`
- `apps/web/src/stores/themeStore.ts`
- `apps/web/src/stores/fontStore.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/components/auth/AuthProfileDialog.tsx`
- `apps/web/src/pages/ChatPage.tsx`
