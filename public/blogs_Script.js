/**
 * Blog Page Script
 * Handles infinite scroll loading of blog posts
 */

// ==============================
// HELPERS
// ==============================

function isValidUrl(url) {
    if (!url) return false;
    const trimmed = url.trim();
    
    // مسیرهای نسبی مجاز هستند
    if (trimmed.startsWith('/')) return true;
    
    // پشتیبانی از mailto: و tel:
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
    
    // مسیرهای نسبی مجاز هستند
    if (trimmed.startsWith('/')) return true;
    
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// ==============================
// MAIN CODE
// ==============================

let page = 1;
let loading = false;
let hasMore = true;

async function loadPosts() {
    if (loading || !hasMore) return;

    loading = true;

    try {
        const res = await fetch(`/api/blogs/${page}`);
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();

        if (!data.posts || !Array.isArray(data.posts)) {
            throw new Error('Invalid data format');
        }

        const container = document.getElementById("posts-container");

        data.posts.forEach(post => {
            const div = document.createElement("div");
            div.className = "post";

            // تصویر
            const img = document.createElement("img");
            img.src = isValidImageUrl(post.image) ? post.image : '';
            img.alt = post.title || 'تصویر بلاگ';
            div.appendChild(img);

            // عنوان
            const title = document.createElement("h3");
            title.textContent = post.title || 'بدون عنوان';
            div.appendChild(title);

            // زیرعنوان
            const subtitle = document.createElement("p");
            subtitle.textContent = post.subtitle || '';
            div.appendChild(subtitle);

            // تاریخ
            const dateSpan = document.createElement("span");
            dateSpan.textContent = post.date || '';
            div.appendChild(dateSpan);

            // لینک ادامه مطلب
            const link = document.createElement("a");
            link.href = isValidUrl(post.link) ? post.link : '#';
            link.textContent = "ادامه مطلب";
            div.appendChild(link);

            container.appendChild(div);
        });

        hasMore = data.hasMore;
        page++;

        if (!hasMore) {
            document.getElementById("scroll-loader").innerText = "مقاله بیشتری وجود ندارد";
        }

    } catch (err) {
        console.error('Error loading posts:', err);
        document.getElementById("scroll-loader").innerText = "خطا در بارگذاری مقالات";
    } finally {
        loading = false;
    }
}

window.addEventListener("scroll", () => {
    const loader = document.getElementById("scroll-loader");
    if (!loader) return;
    const rect = loader.getBoundingClientRect();

    if (rect.top < window.innerHeight) {
        loadPosts();
    }
});

loadPosts();