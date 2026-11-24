# 📱 MCQ Master - પ્રશ્નપત્ર અને MCQ નિર્માતા

એક આધુનિક, ઝડપી અને મોબાઈલ-ફ્રેન્ડલી Next.js એપ્લિકેશન જ્યાં વિદ્યાર્થીઓ અને એડમિન સરળતાથી MCQ પ્રશ્નપત્રો બનાવી શકે, મોક ટેસ્ટ આપી શકે અને ટેલિગ્રામ ગ્રૂપમાં લાઈવ ક્વિઝ ચલાવી શકે.

---

## ✨ મુખ્ય વિશેષતાઓ

1. **📱 100% Mobile-First UI/UX** — મોબાઈલ માટે મોટા બટનો, સ્મૂથ કાર્ડ્સ, ટેબ્સ અને ગુજરાતી ફોન્ટ સપોર્ટ. PWA manifest + home-screen icons સાથે.
2. **⚡ પાસવર્ડલેસ લોગિન** — મોબાઈલ નંબર (10 અંક) અને નામથી ઇન્સ્ટન્ટ પ્રવેશ. જૂનાં પેપર્સ આપોઆપ લોડ થાય.
3. **📁 પેપર મેનેજમેન્ટ** — પેપર બનાવો, એડિટ કરો, ડુપ્લિકેટ કરો, ડિલીટ કરો અને પ્રોગ્રેસ (દા.ત. 25/50 પ્રશ્નો) જુઓ.
4. **✍️ સ્માર્ટ MCQ એડિટર** — મેન્યુઅલ ટાઈપિંગ + WhatsApp/Telegram/PDF માંથી સ્માર્ટ બલ્ક પેસ્ટ. પ્રશ્નો reorder/duplicate/edit કરી શકાય.
5. **📥 JSON ઈમ્પોર્ટ + GSRTC નમૂનો** — અગાઉ એક્સપોર્ટ કરેલી JSON ફાઈલ ઈમ્પોર્ટ કરો, અથવા એક ક્લિકમાં 25 પ્રશ્નોનો GSRTC નમૂનો લાઈબ્રેરીમાં ઉમેરો.
6. **🛡️ ઝીરો ડેટા લોસ** — દર અક્ષરે લોકલ ડ્રાફ્ટ ઓટો-સેવ; બ્રાઉઝર બંધ થાય તો પણ ડ્રાફ્ટ રિકવર થાય.
7. **👑 સર્વર-સાઇડ એડમિન પેનલ** — HttpOnly signed session cookie, યુઝર્સ/પેપર્સની લાઈવ યાદી, સર્વર સ્ટેટ્સ, બોટ સેટિંગ્સ, webhook નિયંત્રણ અને ડેઇલી ટેસ્ટ શેડ્યુલર.
8. **🎯 મોક ટેસ્ટ સિમ્યુલેટર** — સ્થિર ટાઈમર (auto-submit), સ્કોર કાર્ડ, વિગતવાર ઉત્તરાવલી અને સાચા સહભાગીઓ આધારિત લીડરબોર્ડ.
9. **🏆 રિયલ લીડરબોર્ડ** — બ્રાઉઝર + સર્વરના એટેમ્પ્ટ્સ મર્જ થાય; કોઈ નકલી peer data નહીં.
10. **🤖 ટેલિગ્રામ લાઈવ ક્વિઝ બોટ** — ગ્રૂપમાં `/quiz CODE` થી Telegram native polls શરૂ થાય, `poll_answer` updates પરથી રિયલ સ્કોરિંગ થાય અને અંતે લીડરબોર્ડ મોકલાય.
11. **📅 ડેઇલી ટેસ્ટ શેડ્યુલર** — દરેક દિવસ નિશ્ચિત સમયે (IST) સર્વર પરથી આપોઆપ ક્વિઝ બનીને ગ્રૂપમાં મોકલાય. એડમિન પેનલ ખુલ્લી હોવી જરૂરી નથી.
12. **📤 એક્સપોર્ટ અને પ્રિન્ટ** — WhatsApp ફોર્મેટ, A4 પ્રિન્ટ/PDF, CSV અને JSON બેકઅપ.

---

## 🚀 લોકલ રન

```bash
npm install
npm run dev
```

બ્રાઉઝરમાં ખોલો: `http://localhost:3000`
એડમિન પેનલ: `http://localhost:3000/admin-portal`

વૈકલ્પિક ચેક:

```bash
npm run typecheck
npm run build
```

---

## ⚙️ Environment Variables

`.env.example` ની કોપી બનાવીને `.env.local` બનાવો. લોકલ મોડમાં ન્યૂનતમ કંઈપણ સેટ કરવાની જરૂર નથી, પરંતુ production માં નીચેનું ફરજિયાત છે.

| Variable | વર્ણન |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | એપનું public HTTPS URL (Telegram Mini App + webhook માટે) |
| `ADMIN_PIN` | એડમિન લોગિન PIN. Production માં **ચોક્કસ બદલો**. |
| `ADMIN_SESSION_SECRET` | લાંબો random string — admin cookie sign કરવા માટે |
| `ADMIN_API_TOKEN` | વૈકલ્પિક server-to-server admin bearer token |
| `TELEGRAM_BOT_TOKEN` | @BotFather તરફથી મળેલો bot token (server-side જ) |
| `TELEGRAM_BOT_USERNAME` | બોટનું username (`@` વગર) |
| `TELEGRAM_ADMIN_ID` | એડમિનનો numeric Telegram ID |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook secret header માટે |
| `TELEGRAM_POLL_SECRET` | `/api/telegram/poll` માટે daemon secret |
| `TELEGRAM_MAX_QUESTIONS` | એક ટેસ્ટમાં વધુમાં વધુ પ્રશ્નો. `0` = બધા પ્રશ્નો |
| `CRON_SECRET` | `/api/cron/tick` માટે secret (Vercel Cron / external cron) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash/Vercel KV REST (recommended on Vercel) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash ના વૈકલ્પિક variable names |
| `NEXT_PUBLIC_FIREBASE_*` | વૈકલ્પિક browser-side Firebase sync |

> ⚠️ `data/` ફોલ્ડરમાં runtime quiz, sessions, schedules અને bot config સેવ થાય છે. તે `.gitignore` માં છે — ક્યારેય commit કરશો નહીં. જો bot token કોઈને ખબર પડે તો @BotFather માં `/revoke` કરીને નવો token લો.

---

## 🗄️ સ્ટોરેજ મોડ

| મોડ | ક્યારે વપરાય | ટીપ |
| --- | --- | --- |
| **Upstash / Vercel KV** | `KV_REST_API_URL` + token સેટ હોય | Vercel/serverless માટે ભલામણ કરેલ |
| **Local JSON** | `data/` ફોલ્ડર writable હોય | લોકલ dev / VPS |
| **Memory** | ફાઈલ લખી શકાય નહીં | ફક્ત ટેમ્પરરી fallback; server restart પર ડેટા જાય |

Admin Panel → Settings માં Firebase config પણ સેટ કરી શકાય (વૈકલ્પિક browser sync).

---

## 🤖 ટેલિગ્રામ બોટ સેટઅપ

### 1. બોટ બનાવો
1. Telegram માં **@BotFather** ને `/newbot` મોકલો.
2. નામ અને username આપો, token કોપી કરો.
3. બોટને ગ્રૂપમાં ઉમેરો અને **admin** બનાવો (polls મોકલવા અને answers વાંચવા માટે).
4. ગ્રૂપ ID મેળવો (દા.ત. `-100...`). Public ગ્રૂપ માટે `@group_username` પણ ચાલશે.

### 2. એડમિન પેનલમાં સેટ કરો
`/admin-portal` → **Bot Config** ટૅબ → Bot Token, Group ID, Admin Telegram ID, Web App URL ભરો → સેવ કરો.
Token સર્વર પર જ રહે છે; browser માં ક્યારેય સેવ થતો નથી.

### 3. Webhook અથવા Polling પસંદ કરો (બંને એકસાથે નહીં)

**Webhook (production માટે ભલામણ):**
```bash
curl -X POST https://your-app.vercel.app/api/telegram/setup \
  -H "Content-Type: application/json" \
  -H "Cookie: mcq_admin_session=<session-cookie>" \
  -d '{"action":"set"}'
```
અથવા એડમિન પેનલના **Webhook** વિભાગમાંથી «Webhook સેટ કરો» દબાવો. URL `https://<domain>/api/telegram/webhook` હશે.

**Polling (લોકલ development):**
```bash
# .env.local માં TELEGRAM_POLL_SECRET સેટ કરો, પછી:
npm run bot
```
Daemon દર 1 સેકન્ડે updates ખેંચે છે, દર મિનિટે scheduler/finalization ચલાવે છે અને દર સેકન્ડે ચેક કરે છે કે આગલા પ્રશ્નનો સમય થયો છે કે નહીં.

### 4. ગ્રૂપમાં વપરાતા કમાન્ડ
| કમાન્ડ | કામ |
| --- | --- |
| `/quiz GSRTC-1234` | ટેસ્ટ શરૂ કરો — પહેલા ફક્ત પ્રથમ પ્રશ્ન આવશે |
| `/results GSRTC-1234` | લાઈવ લીડરબોર્ડ |
| `/stop GSRTC-1234` | ટેસ્ટ બંધ કરી અંતિમ લીડરબોર્ડ મોકલો |
| `/stats` | એડમિન માટે સર્વર આંકડા |

> ⏱ **એક સમયે એક જ પ્રશ્ન:** દરેક પ્રશ્ન `timePerQuestion` સેકન્ડ સુધી ખુલ્લો રહે છે. તેનો સમય પૂરો થયા પછી જ આગલો પ્રશ્ન આવે છે. છેલ્લા પ્રશ્ન પછી લીડરબોર્ડ આપોઆપ મોકલાય છે.

---

## 📅 ડેઇલી ટેસ્ટ શેડ્યુલર

એડમિન પેનલ → **Scheduler** ટૅબમાંથી શેડ્યુલ બનાવો (સમય IST માં). શેડ્યુલ સર્વર પર સેવ થાય છે.

Scheduler ને ચલાવવા માટે `/api/cron/tick` ને નિયમિત call કરો:

```bash
curl "https://your-app.vercel.app/api/cron/tick?secret=$CRON_SECRET"
```

વિકલ્પો:
- **Vercel Cron** — `vercel.json` માં daily safety-net ટિક છે. Vercel Hobby પ્લાનમાં વારંવારના cron મર્યાદિત હોય છે; minute-level માટે Pro અથવા external cron વાપરો.
- **External cron** — [cron-job.org](https://cron-job.org) કે UptimeRobot થી ઉપરની URL ping કરો. Sequential quiz માટે દર **15–30 સેકન્ડે** (અથવા ઓછામાં ઓછું દર મિનિટે) ping કરો, નહીં તો આગલો પ્રશ્ન મોડો આવશે.
- **Local daemon** — `npm run bot` (દર 1 સેકન્ડે poll + advance, દર મિનિટે cron tick). Sequential quiz માટે આ સૌથી સચોટ છે.

Tick `advanceQuizSessions()` અને `finalizeDueSessions()` બંને ચલાવે છે — એટલે સમય થતાં જ આગલો પ્રશ્ન અને છેલ્લા પ્રશ્ન પછી લીડરબોર્ડ Telegram માં જાય.

---

## 📥 JSON ઈમ્પોર્ટ ફોર્મેટ

Paper List માં «JSON ઈમ્પોર્ટ» થી single object અથવા array ઈમ્પોર્ટ કરી શકાય:

```json
{
  "title": "GSRTC મોક ટેસ્ટ",
  "subject": "મોટર વ્હીકલ એક્ટ",
  "category": "GSRTC",
  "timeLimitMinutes": 60,
  "questions": [
    {
      "questionText": "GSRTC નું પૂરું નામ શું છે?",
      "options": ["Gujarat State Road Transport Corporation", "બીજો વિકલ્પ", "ત્રીજો વિકલ્પ", "ચોથો વિકલ્પ"],
      "correctAnswer": 0,
      "explanation": "GSRTC = Gujarat State Road Transport Corporation"
    }
  ]
}
```

`correctAnswer` એ 0-based index છે (0 = પહેલો વિકલ્પ). ખાલી પ્રશ્નો/વિકલ્પો આપોઆપ skip થાય છે.

---

## ☁️ Vercel પર ડિપ્લોય

1. રિપો કરો GitHub પર push કરો.
2. [vercel.com](https://vercel.com) → **Add New Project** → રિપો select કરો.
3. Environment Variables માં ઓછામાં ઓછું આ સેટ કરો:
   - `ADMIN_PIN`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_POLL_SECRET`
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN`
   - `NEXT_PUBLIC_APP_URL=https://<your-domain>`
4. Deploy કરો.
5. પ્રથમ વાર એડમિન પેનલમાં લોગિન કરીને Bot Config સેવ કરો.
6. Webhook સેટ કરો (એડમિન પેનલ અથવા `/api/telegram/setup`).
7. External cron દ્વારા `/api/cron/tick?secret=...` દર 5 મિનિટે call કરો.

> Vercel ના serverless filesystem પર `data/` ટકતું નથી — KV સેટ ન કરો તો restart પર ડેટા ગુમાવાશે.

---

## 🔐 સુરક્ષા નોંધ

- Admin PIN સર્વર પર verify થાય છે અને 8 કલાક માટે HMAC-signed HttpOnly cookie બને છે.
- Bot token/webhook secret browser ને પરત મળતા નથી; UI ફક્ત «configured» સ્થિતિ બતાવે છે.
- Telegram webhook `X-Telegram-Bot-Api-Secret-Token` verify કરે છે; secret કન્ફિગર ન હોય તો production માં POST requests reject થાય છે. Duplicate updates ignore થાય છે (poll answers સિવાય).
- `/api/telegram/poll` અને `/api/cron/tick` માટે secret ફરજિયાત છે (local dev સિવાય).
- Test attempts API PII (phone) public response માંથી કાઢી નાખે છે.
- `.env`, `.env.local` અને `data/` commit ન થાય તેની ખાતરી રાખો. લીક થયેલો bot token @BotFather થી revoke કરો.

---

## 🧩 પ્રોજેક્ટ સ્ટ્રક્ચર

```
src/
  app/
    api/
      admin/          # login, logout, session, stats
      attempts/       # public leaderboard attempts
      cron/tick/      # scheduler + finalization tick
      scheduler/      # CRUD + manual dispatch
      telegram/       # webhook, poll, config, setup, quiz
    admin-portal/     # hidden admin page
  components/         # UI (AdminPanel, ExamModal, PaperList, ...)
  lib/
    adminAuth.ts      # HMAC session cookie
    kvStore.ts        # Upstash / local JSON / memory
    serverStorage.ts  # server data access
    scheduler.ts      # IST schedule runner
    telegramBotEngine.ts # bot, polls, scoring, leaderboards
  data/samplePaper.ts # 25-question GSRTC sample paper
scripts/
  telegram_daemon.js  # polling + cron daemon
data/                 # local runtime data (gitignored)
```

---

## 📜 Scripts

| Command | કામ |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run typecheck` | TypeScript check |
| `npm run bot` | Telegram polling + scheduler daemon |
