# ساخت APK اندروید — Battle City 3D

این پروژه با React/Vite ساخته شده و تنظیمات اولیهٔ Capacitor برای بسته‌بندی اندروید به آن اضافه شده است.

## پیش‌نیازها
- Node.js نسخهٔ LTS
- Android Studio به‌همراه Android SDK و ابزارهای Build Tools
- اتصال اینترنت برای دریافت وابستگی‌های npm و Gradle

## ساخت پروژهٔ اندروید
در پوشهٔ پروژه اجرا کنید:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

در Android Studio صبر کنید Gradle Sync کامل شود. سپس از منوی **Build > Build Bundle(s) / APK(s) > Build APK(s)** فایل APK آزمایشی را بسازید.

مسیر معمول APK دیباگ:

`android/app/build/outputs/apk/debug/app-debug.apk`

## ساخت نسخهٔ انتشار
در Android Studio از **Build > Generate Signed Bundle / APK** گزینهٔ APK را انتخاب و یک keystore ایجاد/انتخاب کنید. فایل keystore و رمزهای آن را امن نگه دارید؛ برای به‌روزرسانی نسخه‌های بعدی لازم‌اند.

## نکته
تنظیمات Capacitor اضافه شده، اما پوشهٔ بومی `android/` باید با دستور `npx cap add android` در محیطی که Android SDK و وابستگی‌ها در دسترس است ساخته شود. APK نهایی در این محیط ساخته نشده است.
