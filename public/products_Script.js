document.addEventListener("DOMContentLoaded", function() {
    let currentPage = 1;
    let isLoading = false;
    let hasMore = true;

    const container = document.getElementById('product-list-container');
    const anchor = document.getElementById('infinite-scroll-anchor');

    async function loadProducts() {
        if (isLoading || !hasMore) return;
        
        isLoading = true;
        anchor.style.display = 'block';

        try {
            // نکته: اگر از پورت 3000 استفاده می‌کنید آدرس نسبی بنویسید
            const response = await fetch(`/api/products?page=${currentPage}`);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();

            if (data.products && data.products.length > 0) {
                data.products.forEach(product => {
                    const productHTML = `
                        <article class="product-item">
                            <h3>${product.name}</h3>
                            <p>${product.description}</p>
                            <span>${product.price}</span>
                            <br>
                            <a href="/product/${product.id}/fa">مشاهده</a>
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
            console.error("خطا در بارگذاری محصولات:", error);
        } finally {
            isLoading = false;
            if (!hasMore) {
                anchor.innerHTML = '<p>تمام محصولات نمایش داده شدند.</p>';
            }
        }
    }

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
            loadProducts();
        }
    }, { threshold: 0.5 }); // حساسیت را کمی بیشتر کردیم

    observer.observe(anchor);
    loadProducts(); // لود اولیه
});