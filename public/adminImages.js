/**
 * Admin Images Page Script
 * Handles copy to clipboard functionality
 */

document.addEventListener('DOMContentLoaded', function() {
    // انتخاب همه لینک‌های کپی
    const copyLinks = document.querySelectorAll('.copy-link');

    copyLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const text = this.getAttribute('data-link');
            const original = this.textContent;

            navigator.clipboard.writeText(text)
                .then(function() {
                    this.textContent = '✅ کپی شد!';
                    setTimeout(function() {
                        this.textContent = original;
                    }, 2000); // ← ۲۰۰۰ میلی‌ثانیه = ۲ ثانیه
                }.bind(this))
                .catch(function() {
                    alert('خطا در کپی کردن لینک');
                });
        });
    });
});