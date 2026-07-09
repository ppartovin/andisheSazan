/**
 * Products Page Script
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

// ==============================
// STATE
// ==============================

let currentPage = 1;
let isLoading = false;
let hasMore = true;
let allProducts = [];
let searchTerm = '';
const lang = document.documentElement.lang || 'fa';

// ==============================
// DOM ELEMENTS
// ==============================

document.addEventListener("DOMContentLoaded", function() {

    const container = document.getElementById('product-list-container');
    const anchor = document.getElementById('infinite-scroll-anchor');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');

    // ==============================
    // LANGUAGE HELPERS
    // ==============================

    function noProductsText() {
        return lang === 'en' ? 'No products found.' : 'هیچ محصولی یافت نشد.';
    }

    function viewProductText() {
        return lang === 'en' ? 'View' : 'مشاهده';
    }

    function loadingText() {
        return lang === 'en' ? 'Loading...' : 'در حال بارگذاری...';
    }

    function allProductsLoadedText() {
        return lang === 'en' ? 'All products have been displayed.' : 'تمام محصولات نمایش داده شدند.';
    }

    function loadingErrorText() {
        return lang === 'en' ? 'Error loading products' : 'خطا در بارگذاری محصولات';
    }

    // ==============================
    // RENDER PRODUCTS
    // ==============================

    function renderProducts(products) {
        container.innerHTML = '';
        if (products.length === 0) {
            container.innerHTML = `<p style="text-align:center;color:#888;">${noProductsText()}</p>`;
            return;
        }

        products.forEach(product => {
            const article = document.createElement('article');
            article.className = 'product-item';

            // تصویر محصول
            const img = document.createElement('img');
            if (Array.isArray(product.image) && product.image.length > 0) {
                img.src = product.image[0];
            } else if (typeof product.image === 'string' && product.image) {
                img.src = product.image;
            } else {
                img.src = '/default.jpg';
            }
            img.alt = product.title || (lang === 'en' ? 'Product' : 'محصول');
            img.style.width = '100%';
            img.style.height = '180px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            img.style.backgroundColor = '#f5f3ef';
            article.appendChild(img);

            const title = document.createElement('h3');
            title.textContent = product.title || (lang === 'en' ? 'Untitled' : 'بدون عنوان');
            article.appendChild(title);

            const subtitle = document.createElement('p');
            subtitle.textContent = product.subtitle || '';
            article.appendChild(subtitle);

            const price = document.createElement('span');
            price.textContent = product.price || '';
            article.appendChild(price);

            const link = document.createElement('a');
            link.href = isValidUrl(product.link) ? product.link : '#';
            link.textContent = viewProductText();
            link.className = 'btn-view';
            article.appendChild(link);

            container.appendChild(article);
        });
    }

    // ==============================
    // FILTER PRODUCTS
    // ==============================

    function applyFilter() {
        const term = searchTerm.trim().toLowerCase();
        if (!term) {
            renderProducts(allProducts);
            return;
        }
        const filtered = allProducts.filter(product =>
            (product.title && product.title.toLowerCase().includes(term)) ||
            (product.subtitle && product.subtitle.toLowerCase().includes(term))
        );
        renderProducts(filtered);
    }

    // ==============================
    // LOAD PRODUCTS FROM API
    // ==============================

    async function loadProducts() {
        if (isLoading || !hasMore) return;

        isLoading = true;
        anchor.style.display = 'block';
        anchor.textContent = loadingText();

        try {
            const response = await fetch(`/api/products/${currentPage}/${lang}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();

            if (data.products && data.products.length > 0) {
                allProducts = allProducts.concat(data.products);

                if (!searchTerm.trim()) {
                    renderProducts(allProducts);
                } else {
                    applyFilter();
                }

                currentPage++;
                hasMore = data.hasMore;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error("Error loading products:", error);
            anchor.textContent = loadingErrorText();
        } finally {
            isLoading = false;
            if (!hasMore) {
                anchor.innerHTML = `<p style="text-align:center;color:#888;">${allProductsLoadedText()}</p>`;
            }
        }
    }

    // ==============================
    // SEARCH HANDLERS
    // ==============================

    function handleSearch() {
        searchTerm = searchInput.value;
        if (!searchTerm.trim()) {
            renderProducts(allProducts);
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
    // INTERSECTION OBSERVER
    // ==============================

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
            loadProducts();
        }
    }, { threshold: 0.5 });

    observer.observe(anchor);

    // ==============================
    // INITIAL LOAD
    // ==============================

    loadProducts();

});