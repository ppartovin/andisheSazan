/**
 * Product Page Script
 * Handles image gallery slider and description toggle
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {

    // ==============================
    // IMAGE GALLERY SLIDER
    // ==============================

    // Get images from global data passed by EJS
    const images = window.productData ? window.productData.images : [];
    
    // Log for debugging
    console.log('Product images loaded:', images);

    let currentIndex = 0;
    const productImage = document.getElementById('product-image');

    // Only run if we have images and the element exists
    if (productImage && images.length > 0) {
        // Next button handler
        const nextBtn = document.getElementById('next');
        if (nextBtn) {
            nextBtn.onclick = function() {
                currentIndex++;
                if (currentIndex >= images.length) {
                    currentIndex = 0;
                }
                productImage.src = images[currentIndex];
            };
        }

        // Previous button handler
        const prevBtn = document.getElementById('prev');
        if (prevBtn) {
            prevBtn.onclick = function() {
                currentIndex--;
                if (currentIndex < 0) {
                    currentIndex = images.length - 1;
                }
                productImage.src = images[currentIndex];
            };
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
        // Show full description
        moreBtn.onclick = function() {
            shortDesc.style.display = 'none';
            fullDesc.style.display = 'block';
            moreBtn.style.display = 'none';
            lessBtn.style.display = 'inline-block';
        };

        // Show short description
        lessBtn.onclick = function() {
            shortDesc.style.display = 'block';
            fullDesc.style.display = 'none';
            moreBtn.style.display = 'inline-block';
            lessBtn.style.display = 'none';
        };
    } else {
        console.warn('Description toggle elements not found');
    }
});