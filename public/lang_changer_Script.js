document.addEventListener('DOMContentLoaded', function () {

    // --------------------------------------------------------------
    // 1. تنظیم کلاس active بر اساس مسیر جاری
    // --------------------------------------------------------------
    function setActiveLanguage() {
        const path = window.location.pathname;
        // بخش‌های غیر خالی مسیر را استخراج می‌کنیم
        const segments = path.split('/').filter(seg => seg !== '');
        const last = segments.length > 0 ? segments[segments.length - 1] : '';

        // اگر آخرین بخش fa یا en نبود، پیش‌فرض fa در نظر گرفته می‌شود
        const lang = (last === 'fa' || last === 'en') ? last : 'fa';

        const faLink = document.querySelector('.lang-switcher a:first-child');
        const enLink = document.querySelector('.change_langauge_en');

        if (faLink && enLink) {
            faLink.classList.remove('active');
            enLink.classList.remove('active');

            if (lang === 'fa') {
                faLink.classList.add('active');
            } else if (lang === 'en') {
                enLink.classList.add('active');
            }
        }
    }

    setActiveLanguage();

    // --------------------------------------------------------------
    // 2. کلیک روی دکمه‌ی EN → تغییر آخرین بخش به en
    // --------------------------------------------------------------
    const enLink = document.querySelector('.change_langauge_en');
    if (enLink) {
        enLink.addEventListener('click', function (e) {
            e.preventDefault(); // در صورت وجود href

            const path = window.location.pathname;
            const segments = path.split('/').filter(seg => seg !== '');

            if (segments.length > 0 && segments[segments.length - 1] === 'fa') {
                segments[segments.length - 1] = 'en';
                const newPath = '/' + segments.join('/');
                const newUrl = window.location.origin + newPath +
                               window.location.search + window.location.hash;
                window.location.href = newUrl;
            } else {
                // اگر آخرین بخش fa نبود، می‌توانید رفتار دیگری تعریف کنید
                console.warn('آخرین بخش مسیر "fa" نیست، امکان تغییر به "en" وجود ندارد.');
            }
        });
    }

    // --------------------------------------------------------------
    // 3. (اختیاری) کلیک روی دکمه‌ی FA → تغییر آخرین بخش به fa
    // --------------------------------------------------------------
    const faLink = document.querySelector('.lang-switcher a:first-child');
    if (faLink) {
        faLink.addEventListener('click', function (e) {
            e.preventDefault();

            const path = window.location.pathname;
            const segments = path.split('/').filter(seg => seg !== '');

            if (segments.length > 0 && segments[segments.length - 1] === 'en') {
                segments[segments.length - 1] = 'fa';
                const newPath = '/' + segments.join('/');
                const newUrl = window.location.origin + newPath +
                               window.location.search + window.location.hash;
                window.location.href = newUrl;
            } else {
                console.warn('آخرین بخش مسیر "en" نیست، امکان تغییر به "fa" وجود ندارد.');
            }
        });
    }

});