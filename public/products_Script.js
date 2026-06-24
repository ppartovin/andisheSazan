/**
 * Products Page Script
 * Handles infinite scroll loading of products using Intersection Observer
 */

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

document.addEventListener("DOMContentLoaded", function() {

    // ==============================
    // STATE VARIABLES
    // ==============================

    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;

    const container = document.getElementById('product-list-container');
    const anchor = document.getElementById('infinite-scroll-anchor');

    // ==============================
    // LOAD PRODUCTS FROM API
    // ==============================

    async function loadProducts() {
        if (isLoading || !hasMore) return;

        isLoading = true;
        anchor.style.display = 'block';

        try {
            // Note: Use relative path if running on port 3000
            const response = await fetch(`/api/products?page=${currentPage}`);
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();

            console.log('data', data);
            console.log('data.product', data.product);

            if (data.products && data.products.length > 0) {
                data.products.forEach(product => {
                    const article = document.createElement('article');
                    article.className = 'product-item';

                    const title = document.createElement('h3');
                    title.textContent = product.title || 'بدون عنوان';
                    article.appendChild(title);

                    const subtitle = document.createElement('p');
                    subtitle.textContent = product.subtitle || '';
                    article.appendChild(subtitle);

                    const price = document.createElement('span');
                    price.textContent = product.price || '';
                    article.appendChild(price);

                    const br = document.createElement('br');
                    article.appendChild(br);

                    const link = document.createElement('a');
                    link.href = isValidUrl(product.link) ? product.link : '#';
                    link.textContent = 'مشاهده';
                    article.appendChild(link);

                    const hr = document.createElement('hr');
                    article.appendChild(hr);

                    container.appendChild(article);
                });
                currentPage++;
                hasMore = data.hasMore;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error("Error loading products:", error);
        } finally {
            isLoading = false;
            if (!hasMore) {
                anchor.textContent  = '<p>تمام محصولات نمایش داده شدند.</p>';
            }
        }
    }

    // ==============================
    // INTERSECTION OBSERVER - Infinite Scroll
    // ==============================

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
            loadProducts();
        }
    }, { threshold: 0.5 }); // Increased sensitivity

    observer.observe(anchor);

    // ==============================
    // INITIAL LOAD
    // ==============================

    loadProducts(); // Initial load

});