/**
 * Admin Products Add Page Script
 * Handles dynamic image, shop and property fields using Event Listeners
 */

document.addEventListener('DOMContentLoaded', function() {

    // ==============================
    // ADD IMAGE
    // ==============================

    const addImageBtn = document.getElementById('addImageBtn');
    if (addImageBtn) {
        addImageBtn.addEventListener('click', function() {
            const container = document.getElementById('images-container');
            const div = document.createElement('div');
            div.className = 'dynamic-group image-item';
            div.innerHTML = `
                <div class="form-group">
                    <label>آدرس تصویر</label>
                    <input type="url" name="image[]" placeholder="https://example.com/image.jpg">
                </div>
                <button type="button" class="remove-btn" data-container="images-container">حذف تصویر</button>
            `;
            container.appendChild(div);
        });
    }

    // ==============================
    // ADD SHOP
    // ==============================

    const addShopBtn = document.getElementById('addShopBtn');
    if (addShopBtn) {
        addShopBtn.addEventListener('click', function() {
            const container = document.getElementById('shops-container');
            const div = document.createElement('div');
            div.className = 'dynamic-group shop-item';
            div.innerHTML = `
                <div class="form-group">
                    <label>نام فروشگاه</label>
                    <input type="text" name="shop_name[]" placeholder="مثال: دیجیکالا">
                </div>
                <div class="form-group">
                    <label>لینک فروشگاه</label>
                    <input type="url" name="shop_link[]" placeholder="https://example.com">
                </div>
                <div class="form-group">
                    <label>آدرس تصویر فروشگاه</label>
                    <input type="url" name="shop_image[]" placeholder="https://example.com/logo.png">
                </div>
                <button type="button" class="remove-btn" data-container="shops-container">حذف فروشگاه</button>
            `;
            container.appendChild(div);
        });
    }

    // ==============================
    // ADD PROPERTY
    // ==============================

    const addPropertyBtn = document.getElementById('addPropertyBtn');
    if (addPropertyBtn) {
        addPropertyBtn.addEventListener('click', function() {
            const container = document.getElementById('properties-container');
            const div = document.createElement('div');
            div.className = 'dynamic-group property-item';
            div.innerHTML = `
                <div class="form-group">
                    <label>عنوان ویژگی</label>
                    <input type="text" name="prop_key[]" placeholder="مثال: زمان بازی">
                </div>
                <div class="form-group">
                    <label>مقدار ویژگی</label>
                    <input type="text" name="prop_value[]" placeholder="مثال: 15 دقیقه">
                </div>
                <button type="button" class="remove-btn" data-container="properties-container">حذف ویژگی</button>
            `;
            container.appendChild(div);
        });
    }

    // ==============================
    // REMOVE ITEM (Event Delegation)
    // ==============================

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-btn')) {
            const containerId = e.target.dataset.container;
            const parent = e.target.parentElement;
            const container = document.getElementById(containerId);

            if (!container) return;

            if (container.children.length > 1) {
                parent.remove();
            } else {
                alert('حداقل یک آیتم باید وجود داشته باشد.');
            }
        }
    });

});