/**
 * FAQ Page Script
 * Handles search functionality and toggle display of FAQ answers
 */

document.addEventListener('DOMContentLoaded', function() {

    // ==============================
    // FAQ TOGGLE - Click to show/hide answer
    // ==============================

    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(function(item) {
        const title = item.querySelector('.faq-title');
        const content = item.querySelector('.faq-content');

        // Initially hide all answers
        if (content) {
            content.style.display = 'none';
        }

        // Toggle answer on title click
        if (title) {
            title.onclick = function() {
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                } else {
                    content.style.display = 'none';
                }
            };
        }
    });

    // ==============================
    // SEARCH FUNCTIONALITY
    // ==============================

    const searchInput = document.querySelector('.faq-search input');
    const searchButton = document.querySelector('.faq-search button');

    function filterFaqs() {
        const query = searchInput.value.toLowerCase().trim();

        faqItems.forEach(function(item) {
            const title = item.querySelector('.faq-title');
            const content = item.querySelector('.faq-content');
            const text = (title ? title.textContent : '') + ' ' + (content ? content.textContent : '');
            
            if (text.toLowerCase().includes(query)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Search on button click
    if (searchButton) {
        searchButton.onclick = filterFaqs;
    }

    // Search on Enter key
    if (searchInput) {
        searchInput.onkeyup = function(e) {
            if (e.key === 'Enter') {
                filterFaqs();
            }
        };
    }
});