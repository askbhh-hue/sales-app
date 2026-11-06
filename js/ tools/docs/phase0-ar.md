# Phase 0 — دليل التحضير خطوة بخطوة

> اقرأ الدليل ده كامل قبل ما تبدأ. متبعتش أي مفتاح في الشات.  
> الوقت المتوقع: 45–60 دقيقة.

## 0) قبل ما تبدأ
- حساب Google.
- حساب GitHub.
- حساب Telegram.
- إيميل.
- مكان آمن تحفظ فيه المفاتيح (Password Manager أو ورقة في مكان مقفول).

## 1) النسخة الاحتياطية (أهم خطوة)
1. افتح التطبيق.
2. المزيد → الإعدادات والنسخ.
3. اضغط «💾 تنزيل نسخة احتياطية (ملف)».
4. هتشوف ملف `sales-backup-YYYY-MM-DD.json`.
5. اعمل 3 نسخ: الموبايل + Google Drive + واتساب لنفسك.
6. افتح `tools/verify-backup.html` من GitHub Pages.
7. اختار الملف.
8. هتشوف تقرير فيه الأعداد وإجمالي المديونيات و SHA-256.
9. قارن «إجمالي المديونيات» في التقرير مع شاشة المديونيات في التطبيق. لازم يتطابقوا لقرشين.
10. لو مختلفين: متكملش. ابعتلي التقرير مع إخفاء الأسماء.

## 2) مشروع Supabase
1. افتح https://supabase.com
2. Start your project → سجّل بحساب GitHub.
3. New project:
   - الاسم: sales-rep-prod
   - Database Password: Generate واحفظها.
   - Region: Middle East (Dubai) لو موجودة، وإلا EU Central (Frankfurt).
   - Plan: Free.
4. Create new project. استنى 2–3 دقائق.
5. Project Settings → API: انسخ Project URL و anon public. متنسخش service_role.
6. SQL Editor → `select 1;` → Run. لازم تشوف 1.
7. حط تذكير أسبوعي: المشروع المجاني بيتوقف بعد أسبوع خمول.

### لو ظهر خطأ
- Project limit reached: عندك مشروعين شغّالين. وقّف/امسح مشروع مش مستخدم.
- Paused: اضغط Restore project.

## 3) مفتاح Gemini
1. افتح https://aistudio.google.com/apikey
2. سجّل بحساب Google.
3. Create API key.
4. انسخ المفتاح واحفظه.
5. اقرأ تحذير الـ Free Tier: المحتوى ممكن يُستخدم لتحسين منتجات Google. متبعتش أسماء/تليفونات عملاء إلا و«إخفاء الأسماء» شغّال.
6. جرّب في AI Studio: اسأل سؤال بسيط. لازم تشوف رد.

### لو ظهر خطأ
- 403: فعّل Generative Language API من Google Cloud Console.
- API key not valid: امسح المسافات وأعد النسخ.

## 4) بوت Telegram
1. افتح Telegram → @BotFather.
2. Start → `/newbot`.
3. اسم ظاهر: مندوب بني سويف.
4. Username ينتهي بـ bot: bnisuef_sales_bot (لازم فريد).
5. هتشوف Token. احفظه.
6. افتح البوت → Start.
7. عشان Chat ID: @userinfobot → Start → هتشوف رقم ID. احفظه.
8. البوت مش هيرد دلوقتي. ده طبيعي.

### لو ظهر خطأ
- Username taken: اختار اسم تاني.
- Token ضاع: `/token` في BotFather.

## 5) هيكل GitHub
1. افتح الريبو.
2. Add file → Create new file.
3. أضف الملفات:
   - `js/flags.js`
   - `.gitignore`
   - `tools/verify-backup.html`
   - `docs/phase0-ar.md`
   - `docs/phase0-receipt-template.md`
   - `docs/decisions/0001-free-stack.md`
   - `docs/decisions/0002-strangler-fig.md`
   - `docs/security/secrets.md`
   - `supabase/README.md`
   - `README.md`
4. عدّل `index.html`:
   - دوّر على `<script>` اللي بعده `const K='fs_v1',CATS=`.
   - خليها:
     ```html
     <script src="js/flags.js"></script>
     <script>
     const K='fs_v1',CATS=
     ```
5. Commit.
6. استنى 1–2 دقيقة. افتح التطبيق. لازم يشتغل زي ما هو.

## 6) Feature flags
1. افتح Console في المتصفح.
2. اكتب `FS_FLAGS`.
3. لازم تشوف كل القيم false.
4. اكتب `FS_FLAG('useCloud')` → false.
5. لو ظهر `FS_FLAGS is not defined`: راجع مسار `js/flags.js` والـ script tag.

## 7) اختبار القبول
- التطبيق يفتح وكل التبويبات شغالة.
- `FS_FLAGS` كلها false.
- تقرير النسخة الاحتياطية يطابق شاشة المديونيات.
- Supabase project Active و SQL `select 1` شغال.
- مفتاح Gemini اتجرّب في AI Studio.
- بوت Telegram موجود وChat ID معاك.
- مفيش أي مفتاح في GitHub.

## 8) لو حصل خطأ
| الخطأ | الحل |
|---|---|
| Supabase paused | Dashboard → Restore project |
| Project limit | امسح/وقّف مشروع مش مستخدم |
| GitHub Pages 404 | استنى دقيقة، اتأكد من المسار والـ branch |
| FS_FLAGS undefined | راجع script tag ومسار الملف، Hard Refresh |
| Backup مش مقروء | استخدم ملف .json من زرار التنزيل، مش نسخة نصية |
| Gemini 403 | فعّل Generative Language API |
| Telegram bot مش بيرد | طبيعي، مفيش سيرفر لسه |
| crypto.subtle مش متاح | افتح verifier من GitHub Pages HTTPS |

## 9) إيه اللي جاي
Phase 1: migrations + RLS + RPCs + repo layer + importer + reconciliation.  
مش هنعمل أي migration قبل ما تقول «تمام» على Phase 0.
