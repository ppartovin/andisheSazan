document.addEventListener('DOMContentLoaded', () => {
    function getCookie(name) {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    function setCookie(name, value, days = 365) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = name + '=' + value + ';expires=' + expires.toUTCString() + ';path=/';
    }

    function defalt_theme() {
        if (!getCookie('light_status')) {
            setCookie('light_status', 'day');
        }
    }
    defalt_theme();

    const dayBtn = document.querySelector('.go_day');
    const nightBtn = document.querySelector('.go_night');

    if (!dayBtn) console.warn('Element with class "go_day" not found!');
    if (!nightBtn) console.warn('Element with class "go_night" not found!');

    dayBtn?.addEventListener('click', () => {
        console.log('here');
        setCookie('light_status', 'day');
        location.reload();
    });

    nightBtn?.addEventListener('click', () => {
        console.log('here2');
        setCookie('light_status', 'night');
        location.reload();
    });
});
