/**
 * Products Page Script
 * Handles infinite scroll loading of products using Intersection Observer
 */

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
                    const productHTML = `
                        <article class="product-item">
                            <h3>${product.title}</h3>
                            <p>${product.subtitle}</p>
                            <span>${product.price}</span>
                            <br>
                            <a href="${product.link}">مشاهده</a>
                            <hr>
                        </article>
                    `;
                    container.insertAdjacentHTML('beforeend', productHTML);
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
                anchor.innerHTML = '<p>تمام محصولات نمایش داده شدند.</p>';
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