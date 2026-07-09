/**
 * Blog Page Script
 * Handles infinite scroll + search (client-side filtering)
 */

// ==============================
// HELPERS
// ==============================

function isValidUrl(url) {
    if (!url) return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('/')) return true;
    if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return true;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidImageUrl(url) {
    if (!url) return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('/')) return true;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// ==============================
// STATE
// ==============================

let page = 1;
let loading = false;
let hasMore = true;
let allPosts = [];          // ذخیره تمام پست‌های لود شده
let searchTerm = '';
const lang = document.documentElement.lang || 'fa';
const container = document.getElementById('posts-container');
const loader = document.getElementById('scroll-loader');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');

// ==============================
// RENDER POSTS (بر اساس فیلتر)
// ==============================

function noPostsMsg() {
    return lang === 'en' ? 'No posts found.' : 'هیچ مطلبی یافت نشد.';
}

function readMoreText() {
    return lang === 'en' ? 'Read more' : 'ادامه مطلب';
}

function noMorePostsText() {
    return lang === 'en' ? 'No more posts' : 'مقاله بیشتری وجود ندارد';
}

function loadingErrorText() {
    return lang === 'en' ? 'Error loading posts' : 'خطا در بارگذاری مقالات';
}

function renderPosts(posts) {
    container.innerHTML = '';
    if (posts.length === 0) {
        container.innerHTML = `<p style="text-align:center;color:#999;">${noPostsMsg()}</p>`;
        return;
    }
    posts.forEach(post => {
        const div = document.createElement('div');
        div.className = 'post';

        const img = document.createElement('img');
        img.src = isValidImageUrl(post.image) ? post.image : '';
        img.alt = post.title || 'تصویر بلاگ';
        div.appendChild(img);

        const title = document.createElement('h3');
        title.textContent = post.title || 'بدون عنوان';
        div.appendChild(title);

        const subtitle = document.createElement('p');
        subtitle.textContent = post.subtitle || '';
        div.appendChild(subtitle);

        const dateSpan = document.createElement('span');
        dateSpan.textContent = post.date || '';
        div.appendChild(dateSpan);

        const link = document.createElement('a');
        link.href = isValidUrl(post.link) ? post.link : '#';
        link.textContent = readMoreText();
        console.log(link.textContent)
        link.className = 'btn-view';
        div.appendChild(link);

        container.appendChild(div);
    });
}

// ==============================
// FILTER POSTS
// ==============================

function applyFilter() {
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
        renderPosts(allPosts);
        return;
    }
    const filtered = allPosts.filter(post =>
        (post.title && post.title.toLowerCase().includes(term)) ||
        (post.subtitle && post.subtitle.toLowerCase().includes(term)) ||
        (post.text && post.text.toLowerCase().includes(term))
    );
    renderPosts(filtered);
}

// ==============================
// LOAD POSTS FROM API
// ==============================

async function loadPosts() {
    if (loading || !hasMore) return;

    loading = true;

    try {
        console.log('lang:',lang)
        const res = await fetch(`/api/blogs/${page}/${lang}`);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();

        if (!data.posts || !Array.isArray(data.posts)) {
            throw new Error('Invalid data format');
        }

        // اضافه کردن پست‌های جدید به آرایه کلی
        allPosts = allPosts.concat(data.posts);

        // اگر جستجو فعال نیست، همه را نشان بده
        if (!searchTerm.trim()) {
            renderPosts(allPosts);
        } else {
            // در غیر این صورت، فیلتر را اعمال کن
            applyFilter();
        }

        hasMore = data.hasMore;
        page++;

        if (!hasMore) {
            loader.innerText = noMorePostsText();
        }

    } catch (err) {
        console.error('Error loading posts:', err);
        loader.innerText = loadingErrorText();
    } finally {
        loading = false;
    }
}

// ==============================
// SEARCH HANDLERS
// ==============================

function handleSearch() {
    searchTerm = searchInput.value;
    // اگر جستجو خالی بود، همه پست‌ها را نشان بده
    if (!searchTerm.trim()) {
        renderPosts(allPosts);
    } else {
        applyFilter();
    }
}

searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

// ==============================
// INFINITE SCROLL
// ==============================

window.addEventListener('scroll', () => {
    if (!loader) return;
    const rect = loader.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
        loadPosts();
    }
});

// ==============================
// INITIAL LOAD
// ==============================

loadPosts();