/**
 * Product Page Script
 * Handles image gallery slider and description toggle
 */

document.addEventListener('DOMContentLoaded', function() {

    // ==============================
    // دریافت داده از data-* attribute
    // ==============================

    const scriptTag = document.querySelector('script[src*="product_Script.js"]');
    const imagesData = scriptTag ? scriptTag.getAttribute('data-images') : null;
    const images = imagesData ? JSON.parse(imagesData) : [];

    console.log('Product images loaded:', images);

    // ==============================
    // IMAGE GALLERY SLIDER
    // ==============================

    let currentIndex = 0;
    const productImage = document.getElementById('product-image');

    if (productImage && images.length > 0) {
        const nextBtn = document.getElementById('next');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                currentIndex++;
                if (currentIndex >= images.length) {
                    currentIndex = 0;
                }
                productImage.src = images[currentIndex];
            });
        }

        const prevBtn = document.getElementById('prev');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                currentIndex--;
                if (currentIndex < 0) {
                    currentIndex = images.length - 1;
                }
                productImage.src = images[currentIndex];
            });
        }
    } else {
        console.warn('No product images found or product-image element missing');
    }

    // ==============================
    // DESCRIPTION TOGGLE
    // ==============================

    const moreBtn = document.getElementById('more');
    const lessBtn = document.getElementById('less');
    const shortDesc = document.getElementById('short-desc');
    const fullDesc = document.getElementById('full-desc');

    if (moreBtn && lessBtn && shortDesc && fullDesc) {
        moreBtn.addEventListener('click', function() {
            shortDesc.style.display = 'none';
            fullDesc.style.display = 'block';
            moreBtn.style.display = 'none';
            lessBtn.style.display = 'inline-block';
        });

        lessBtn.addEventListener('click', function() {
            shortDesc.style.display = 'block';
            fullDesc.style.display = 'none';
            moreBtn.style.display = 'inline-block';
            lessBtn.style.display = 'none';
        });
    } else {
        console.warn('Description toggle elements not found');
    }
});