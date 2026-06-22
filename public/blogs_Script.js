/**
 * Blog Page Script
 * Handles infinite scroll loading of blog posts
 */

let page = 1;
let loading = false;
let hasMore = true;

async function loadPosts() {
    if (loading || !hasMore) return;

    loading = true;

    const res = await fetch(`/api/blogs/${page}`);
    const data = await res.json();

    const container = document.getElementById("posts-container");

    data.posts.forEach(post => {
        const div = document.createElement("div");
        div.className = "post";

        div.innerHTML = `
            <img src="${post.image}">
            <h3>${post.title}</h3>
            <p>${post.subtitle}</p>
            <span>${post.date}</span>
            <a href="${post.link}">ادامه مطلب</a>
        `;

        container.appendChild(div);
    });

    hasMore = data.hasMore;
    page++;

    if (!hasMore) {
        document.getElementById("scroll-loader").innerText = "مقاله بیشتری وجود ندارد";
    }

    loading = false;
}

window.addEventListener("scroll", () => {
    const loader = document.getElementById("scroll-loader");
    const rect = loader.getBoundingClientRect();

    if (rect.top < window.innerHeight) {
        loadPosts();
    }
});

loadPosts();