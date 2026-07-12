const express = require('express');
const router = express.Router();
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
const { logger } = require('../logger');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables');
    process.exit(1);
}

// ==============================
// CONSTANTS
// ==============================

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_PATH = path.join(DATA_DIR, 'products.json');
const INDEX_DATA_PATH = path.join(DATA_DIR, 'index_data.json');

// ==============================
// HELPERS
// ==============================

const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        if (!content || content.trim() === '') {
            return {};
        }
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`فایل محصولات یافت نشد: ${filePath}`);
            return {};
        }
        logger.error(`JSON نامعتبر در فایل محصولات: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

const writeJsonFile = async (filePath, data) => {
    try {
        await writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        logger.error(`خطا در نوشتن فایل: ${filePath}`, { error: err.message });
        throw new Error(`Failed to write file: ${filePath}`);
    }
};

const reindexItems = (items) => {
    const newItems = {};
    let counter = 1;
    Object.values(items).forEach(item => {
        newItems[counter] = item;
        counter++;
    });
    return newItems;
};

const generateUniqueCode = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PRD-${timestamp}-${random}`;
};

// ==============================
// TOKEN FUNCTIONS
// ==============================

const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch {
        return null;
    }
};

// ==============================
// MIDDLEWARE: Check Token
// ==============================

const checkToken = (req, res, next) => {
    try {
        const token = req.cookies?.adminToken;
        if (!token) {
            logger.withRequest(req, 'تلاش برای دسترسی به مدیریت محصولات بدون توکن');
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'توکن نامعتبر در مدیریت محصولات');
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بررسی توکن مدیریت محصولات');
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ==============================
// VALIDATION HELPERS
// ==============================

// ==============================
// VALIDATION HELPERS
// ==============================

const isValidImageUrl = (url) => {
    if (!url) return true; // اگر خالی باشد، معتبر است (اختیاری)
    
    try {
        const parsed = new URL(url);
        
        // 1️⃣ فقط پروتکل HTTP و HTTPS مجاز است
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }
        
        // 2️⃣ پسوندهای مجاز تصویر
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const ext = path.extname(parsed.pathname).toLowerCase();
        if (!validExtensions.includes(ext)) {
            return false;
        }
        
        // 3️⃣ (اختیاری) جلوگیری از آدرس‌های مخرب
        // بررسی اینکه آدرس به دامنه‌های معروف مخرب نباشد
        const hostname = parsed.hostname.toLowerCase();
        const blockedDomains = ['malicious.com', 'evil.com']; // لیست سیاه
        if (blockedDomains.some(domain => hostname.includes(domain))) {
            return false;
        }
        
        return true;
    } catch {
        // اگر URL معتبر نباشد، رد می‌شود
        return false;
    }
};

const isValidPrice = (price) => {
    if (!price) return true;
    const num = parseFloat(price.replace(/,/g, ''));
    return !isNaN(num) && num >= 0;
};

// ✅ تابع جدید برای Sanitize
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return '';
    return escapeHtml(input.trim());
};

// ✅ تابع جدید برای اعتبارسنجی shops
const validateShops = (shops) => {
    const MAX_SHOPS = 20;
    if (shops.length > MAX_SHOPS) {
        return { valid: false, error: `حداکثر ${MAX_SHOPS} فروشگاه مجاز است` };
    }
    
    for (const shop of shops) {
        if (shop.name && shop.name.length > 100) {
            return { valid: false, error: 'نام فروشگاه نباید بیشتر از ۱۰۰ کاراکتر باشد' };
        }
        if (shop.link && shop.link.length > 500) {
            return { valid: false, error: 'لینک فروشگاه نباید بیشتر از ۵۰۰ کاراکتر باشد' };
        }
        if (shop.image && shop.image.length > 500) {
            return { valid: false, error: 'آدرس تصویر فروشگاه نباید بیشتر از ۵۰۰ کاراکتر باشد' };
        }
    }
    
    return { valid: true };
};

// ✅ تابع جدید برای اعتبارسنجی properties
const validateProperties = (properties) => {
    const MAX_PROPERTIES = 30;
    const keys = Object.keys(properties);
    
    if (keys.length > MAX_PROPERTIES) {
        return { valid: false, error: `حداکثر ${MAX_PROPERTIES} ویژگی مجاز است` };
    }
    
    for (const [key, value] of Object.entries(properties)) {
        if (key.length > 100) {
            return { valid: false, error: 'کلید ویژگی نباید بیشتر از ۱۰۰ کاراکتر باشد' };
        }
        if (value.length > 500) {
            return { valid: false, error: 'مقدار ویژگی نباید بیشتر از ۵۰۰ کاراکتر باشد' };
        }
    }
    
    return { valid: true };
};

// ==============================
// ROUTES
// ==============================

// List all products
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('بارگذاری لیست محصولات', {
        admin: req.user?.username,
        action: 'list_products'
    });

    try {
        const productsObj = await readJsonFile(PRODUCTS_PATH);
        const indexData = await readJsonFile(INDEX_DATA_PATH);
        const showcaseCodes = indexData.top_products || [];

        const products = Object.entries(productsObj).map(([id, item]) => ({
            id,
            ...item,
            isShowcase: showcaseCodes.includes(item.unique_code)
        }));

        logger.info(`لیست محصولات بارگذاری شد: ${products.length} محصول`);
        operation.end('success', { productCount: products.length });

        res.render('adminPanel/adminProducts', { products });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری لیست محصولات');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'خطا در بارگذاری لیست محصولات' });
    }
});

// Show add form
router.get('/add', checkToken, async (req, res) => {
    try {
        logger.withRequest(req, `دسترسی به فرم افزودن محصول توسط: ${req.user?.username}`);
        res.render('adminPanel/adminProductsAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری فرم افزودن محصول');
        res.status(500).render('err');
    }
});

// Add new product
router.post('/add', checkToken, async (req, res) => {
    const operation = logger.startOperation('افزودن محصول جدید', {
        admin: req.user?.username,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        logger.debug('داده‌های دریافتی برای محصول جدید', { body: req.body });

        const { title, subtitle, price, description } = req.body;

        // اعتبارسنجی عنوان
        if (!title || title.trim() === '') {
            logger.withRequest(req, 'تلاش برای افزودن محصول بدون عنوان');
            operation.end('failed', { reason: 'missing_title' });
            return res.render('adminPanel/adminProductsAdd', { error: 'عنوان محصول الزامی است' });
        }

        if (title.length > 200) {
            logger.withRequest(req, `عنوان محصول خیلی طولانی است: ${title.length} کاراکتر`);
            operation.end('failed', { reason: 'title_too_long' });
            return res.render('adminPanel/adminProductsAdd', { error: 'عنوان محصول نباید بیشتر از ۲۰۰ کاراکتر باشد' });
        }

        // ==============================
        // پردازش تصاویر (آرایه)
        // ==============================
/*         const imageArray = req.body.image || [];
        const cleanedImages = imageArray.filter(img => img && img.trim()).map(img => img.trim());
 */

        const imageArray = req.body.image || [];
        const cleanedImages = [];
        const MAX_IMAGES = 10;
        // اعتبارسنجی تعداد تصاویر
        if (imageArray.length > MAX_IMAGES) {
            logger.withRequest(req, `تعداد تصاویر بیشتر از حد مجاز: ${imageArray.length}`);
            operation.end('failed', { reason: 'too_many_images' });
            return res.render('adminPanel/adminProductsAdd', { 
                error: `حداکثر ${MAX_IMAGES} تصویر مجاز است` 
            });
        }

        // اعتبارسنجی هر تصویر
        for (const img of imageArray) {
            if (img && img.trim()) {
                const trimmed = img.trim();
                
                if (!isValidImageUrl(trimmed)) {
                    logger.withRequest(req, `آدرس تصویر نامعتبر: ${trimmed}`);
                    operation.end('failed', { reason: 'invalid_image_url' });
                    return res.render('adminPanel/adminProductsAdd', { 
                        error: 'آدرس تصویر نامعتبر است. فقط آدرس‌های معتبر با پسوندهای jpg, jpeg, png, gif, webp, svg مجاز هستند.' 
                    });
                }
                
                cleanedImages.push(trimmed);
            }
        }

        // ==============================
        // پردازش فروشگاه‌ها (با Sanitize و اعتبارسنجی)
        // ==============================
        const shops = [];
        const shopNames = req.body.shop_name || [];
        const shopLinks = req.body.shop_link || [];
        const shopImages = req.body.shop_image || [];

        // ✅ اعتبارسنجی تعداد فروشگاه‌ها
        if (shopNames.length > 20) {
            logger.withRequest(req, `تعداد فروشگاه‌ها بیشتر از حد مجاز: ${shopNames.length}`);
            operation.end('failed', { reason: 'too_many_shops' });
            return res.render('adminPanel/adminProductsAdd', { 
                error: 'حداکثر ۲۰ فروشگاه مجاز است' 
            });
        }

        for (let i = 0; i < shopNames.length; i++) {
            if (shopNames[i] && shopNames[i].trim()) {
                // ✅ Sanitize کامل
                const name = sanitizeInput(shopNames[i]);
                const link = sanitizeInput(shopLinks[i] || '');
                const image = sanitizeInput(shopImages[i] || '');
                
                // ✅ اعتبارسنجی طول
                if (name.length > 100) {
                    logger.withRequest(req, `نام فروشگاه خیلی طولانی است: ${name.length} کاراکتر`);
                    operation.end('failed', { reason: 'shop_name_too_long' });
                    return res.render('adminPanel/adminProductsAdd', { 
                        error: 'نام فروشگاه نباید بیشتر از ۱۰۰ کاراکتر باشد' 
                    });
                }
                
                if (link.length > 500) {
                    logger.withRequest(req, `لینک فروشگاه خیلی طولانی است: ${link.length} کاراکتر`);
                    operation.end('failed', { reason: 'shop_link_too_long' });
                    return res.render('adminPanel/adminProductsAdd', { 
                        error: 'لینک فروشگاه نباید بیشتر از ۵۰۰ کاراکتر باشد' 
                    });
                }
                
                if (image.length > 500) {
                    logger.withRequest(req, `آدرس تصویر فروشگاه خیلی طولانی است: ${image.length} کاراکتر`);
                    operation.end('failed', { reason: 'shop_image_too_long' });
                    return res.render('adminPanel/adminProductsAdd', { 
                        error: 'آدرس تصویر فروشگاه نباید بیشتر از ۵۰۰ کاراکتر باشد' 
                    });
                }
                
                shops.push({
                    name: name,
                    link: link,
                    image: image
                });
            }
        }

        // ==============================
        // پردازش ویژگی‌ها (با Sanitize و اعتبارسنجی)
        // ==============================
        const properties = {};
        const propKeys = req.body.prop_key || [];
        const propValues = req.body.prop_value || [];

        // ✅ اعتبارسنجی تعداد ویژگی‌ها
        if (propKeys.length > 30) {
            logger.withRequest(req, `تعداد ویژگی‌ها بیشتر از حد مجاز: ${propKeys.length}`);
            operation.end('failed', { reason: 'too_many_properties' });
            return res.render('adminPanel/adminProductsAdd', { 
                error: 'حداکثر ۳۰ ویژگی مجاز است' 
            });
        }

        for (let i = 0; i < propKeys.length; i++) {
            if (propKeys[i] && propKeys[i].trim()) {
                // ✅ Sanitize کامل
                const key = sanitizeInput(propKeys[i]);
                const value = sanitizeInput(propValues[i] || '');
                
                // ✅ اعتبارسنجی طول
                if (key.length > 100) {
                    logger.withRequest(req, `کلید ویژگی خیلی طولانی است: ${key.length} کاراکتر`);
                    operation.end('failed', { reason: 'property_key_too_long' });
                    return res.render('adminPanel/adminProductsAdd', { 
                        error: 'کلید ویژگی نباید بیشتر از ۱۰۰ کاراکتر باشد' 
                    });
                }
                
                if (value.length > 500) {
                    logger.withRequest(req, `مقدار ویژگی خیلی طولانی است: ${value.length} کاراکتر`);
                    operation.end('failed', { reason: 'property_value_too_long' });
                    return res.render('adminPanel/adminProductsAdd', { 
                        error: 'مقدار ویژگی نباید بیشتر از ۵۰۰ کاراکتر باشد' 
                    });
                }
                
                properties[key] = value;
            }
        }

        // ==============================
        // خواندن فایل و ذخیره
        // ==============================
        const products = await readJsonFile(PRODUCTS_PATH);

        const ids = Object.keys(products).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        const uniqueCode = generateUniqueCode();

        const newProduct = {
            title: sanitizeInput(title),
            subtitle: sanitizeInput(subtitle || ''),
            price: price?.trim() || '',
            description: sanitizeInput(description || ''),
            image: cleanedImages,
            shops: shops,
            properties: properties,
            unique_code: uniqueCode
        };

        logger.debug('محصول جدید ساخته شد', { product: newProduct });

        products[nextId] = newProduct;

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`✅ محصول جدید اضافه شد: "${title.trim()}" (ID: ${nextId}, کد: ${uniqueCode}) توسط ${req.user?.username}`);
        operation.end('success', { 
            productId: nextId, 
            uniqueCode, 
            title: title.trim().substring(0, 50),
            shopCount: shops.length,
            imageCount: cleanedImages.length,
            propertyCount: Object.keys(properties).length
        });

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در افزودن محصول');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'خطا در افزودن محصول' });
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;
        
        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `شناسه محصول نامعتبر برای ویرایش: ${productId}`);
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);
        const product = products[productId];

        if (!product) {
            logger.withRequest(req, `محصول با شناسه ${productId} برای ویرایش یافت نشد`);
            return res.redirect('/admin/products');
        }

        logger.withRequest(req, `دسترسی به فرم ویرایش محصول ${productId} (${product.title}) توسط: ${req.user?.username}`);
        res.render('adminPanel/adminProductsEdit', { 
            product: { id: productId, ...product } 
        });

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در بارگذاری فرم ویرایش محصول ${req.params.id}`);
        res.status(500).render('err', { message: 'خطا در بارگذاری فرم ویرایش' });
    }
});

// Update product
router.post('/edit/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('ویرایش محصول', {
        admin: req.user?.username,
        productId: req.params.id,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        const productId = req.params.id;
        const { title, subtitle, price, description } = req.body;

        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `شناسه محصول نامعتبر برای ویرایش: ${productId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            logger.withRequest(req, `محصول با شناسه ${productId} برای ویرایش یافت نشد`);
            operation.end('failed', { reason: 'product_not_found' });
            return res.redirect('/admin/products');
        }

        if (title && title.length > 200) {
            logger.withRequest(req, `عنوان محصول خیلی طولانی است: ${title.length} کاراکتر`);
            operation.end('failed', { reason: 'title_too_long' });
            return res.render('adminPanel/adminProductsEdit', { 
                product: { id: productId, ...products[productId] },
                error: 'عنوان محصول نباید بیشتر از ۲۰۰ کاراکتر باشد'
            });
        }

        if (price && !isValidPrice(price)) {
            logger.withRequest(req, `قیمت نامعتبر: ${price}`);
            operation.end('failed', { reason: 'invalid_price' });
            return res.render('adminPanel/adminProductsEdit', {
                product: { id: productId, ...products[productId] },
                error: 'قیمت باید یک عدد معتبر باشد'
            });
        }

        const imageArray = req.body.image || [];
        const cleanedImages = [];
        const MAX_IMAGES = 10;

        if (imageArray.length > MAX_IMAGES) {
            logger.withRequest(req, `تعداد تصاویر بیشتر از حد مجاز در ویرایش: ${imageArray.length}`);
            operation.end('failed', { reason: 'too_many_images' });
            return res.render('adminPanel/adminProductsEdit', { 
                product: { id: productId, ...products[productId] },
                error: `حداکثر ${MAX_IMAGES} تصویر مجاز است` 
            });
        }

        for (const img of imageArray) {
            if (img && img.trim()) {
                const trimmed = img.trim();
                
                if (!isValidImageUrl(trimmed)) {
                    logger.withRequest(req, `آدرس تصویر نامعتبر در ویرایش: ${trimmed}`);
                    operation.end('failed', { reason: 'invalid_image_url' });
                    return res.render('adminPanel/adminProductsEdit', { 
                        product: { id: productId, ...products[productId] },
                        error: 'آدرس تصویر نامعتبر است' 
                    });
                }
                
                cleanedImages.push(trimmed);
            }
        }

        // ==============================
        // پردازش فروشگاه‌ها در ویرایش (با Sanitize و اعتبارسنجی)
        // ==============================
        const shops = [];
        const shopNames = req.body.shop_name || [];
        const shopLinks = req.body.shop_link || [];
        const shopImages = req.body.shop_image || [];

        if (shopNames.length > 20) {
            logger.withRequest(req, `تعداد فروشگاه‌ها بیشتر از حد مجاز در ویرایش: ${shopNames.length}`);
            operation.end('failed', { reason: 'too_many_shops' });
            return res.render('adminPanel/adminProductsEdit', { 
                product: { id: productId, ...products[productId] },
                error: 'حداکثر ۲۰ فروشگاه مجاز است' 
            });
        }

        for (let i = 0; i < shopNames.length; i++) {
            if (shopNames[i] && shopNames[i].trim()) {
                const name = sanitizeInput(shopNames[i]);
                const link = sanitizeInput(shopLinks[i] || '');
                const image = sanitizeInput(shopImages[i] || '');
                
                if (name.length > 100) {
                    logger.withRequest(req, `نام فروشگاه خیلی طولانی است در ویرایش: ${name.length} کاراکتر`);
                    operation.end('failed', { reason: 'shop_name_too_long' });
                    return res.render('adminPanel/adminProductsEdit', { 
                        product: { id: productId, ...products[productId] },
                        error: 'نام فروشگاه نباید بیشتر از ۱۰۰ کاراکتر باشد' 
                    });
                }
                
                if (link.length > 500) {
                    logger.withRequest(req, `لینک فروشگاه خیلی طولانی است در ویرایش: ${link.length} کاراکتر`);
                    operation.end('failed', { reason: 'shop_link_too_long' });
                    return res.render('adminPanel/adminProductsEdit', { 
                        product: { id: productId, ...products[productId] },
                        error: 'لینک فروشگاه نباید بیشتر از ۵۰۰ کاراکتر باشد' 
                    });
                }
                
                if (image.length > 500) {
                    logger.withRequest(req, `آدرس تصویر فروشگاه خیلی طولانی است در ویرایش: ${image.length} کاراکتر`);
                    operation.end('failed', { reason: 'shop_image_too_long' });
                    return res.render('adminPanel/adminProductsEdit', { 
                        product: { id: productId, ...products[productId] },
                        error: 'آدرس تصویر فروشگاه نباید بیشتر از ۵۰۰ کاراکتر باشد' 
                    });
                }
                
                shops.push({
                    name: name,
                    link: link,
                    image: image
                });
            }
        }

        // ==============================
        // پردازش ویژگی‌ها در ویرایش (با Sanitize و اعتبارسنجی)
        // ==============================
        const properties = {};
        const propKeys = req.body.prop_key || [];
        const propValues = req.body.prop_value || [];

        if (propKeys.length > 30) {
            logger.withRequest(req, `تعداد ویژگی‌ها بیشتر از حد مجاز در ویرایش: ${propKeys.length}`);
            operation.end('failed', { reason: 'too_many_properties' });
            return res.render('adminPanel/adminProductsEdit', { 
                product: { id: productId, ...products[productId] },
                error: 'حداکثر ۳۰ ویژگی مجاز است' 
            });
        }

        for (let i = 0; i < propKeys.length; i++) {
            if (propKeys[i] && propKeys[i].trim()) {
                const key = sanitizeInput(propKeys[i]);
                const value = sanitizeInput(propValues[i] || '');
                
                if (key.length > 100) {
                    logger.withRequest(req, `کلید ویژگی خیلی طولانی است در ویرایش: ${key.length} کاراکتر`);
                    operation.end('failed', { reason: 'property_key_too_long' });
                    return res.render('adminPanel/adminProductsEdit', { 
                        product: { id: productId, ...products[productId] },
                        error: 'کلید ویژگی نباید بیشتر از ۱۰۰ کاراکتر باشد' 
                    });
                }
                
                if (value.length > 500) {
                    logger.withRequest(req, `مقدار ویژگی خیلی طولانی است در ویرایش: ${value.length} کاراکتر`);
                    operation.end('failed', { reason: 'property_value_too_long' });
                    return res.render('adminPanel/adminProductsEdit', { 
                        product: { id: productId, ...products[productId] },
                        error: 'مقدار ویژگی نباید بیشتر از ۵۰۰ کاراکتر باشد' 
                    });
                }
                
                properties[key] = value;
            }
        }

        const oldTitle = products[productId].title;

        products[productId] = {
            ...products[productId],
            title: sanitizeInput(title || products[productId].title),
            subtitle: sanitizeInput(subtitle || products[productId].subtitle || ''),
            price: price?.trim() || products[productId].price || '',
            description: sanitizeInput(description || products[productId].description || ''),
            image: cleanedImages, // ← اضافه کنید
            shops: shops,
            properties: properties
        };

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`✅ محصول ویرایش شد: "${oldTitle}" → "${title}" (ID: ${productId}) توسط ${req.user?.username}`);
        operation.end('success', { 
            productId, 
            oldTitle: oldTitle.substring(0, 50), 
            newTitle: title?.substring(0, 50) || oldTitle.substring(0, 50),
            shopCount: shops.length,
            propertyCount: Object.keys(properties).length
        });

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در ویرایش محصول ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'خطا در ویرایش محصول' });
    }
});

// Delete product
router.get('/delete/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('حذف محصول', {
        admin: req.user?.username,
        productId: req.params.id
    });

    try {
        const productId = req.params.id;

        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `شناسه محصول نامعتبر برای حذف: ${productId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            logger.withRequest(req, `محصول با شناسه ${productId} برای حذف یافت نشد`);
            operation.end('failed', { reason: 'product_not_found' });
            return res.redirect('/admin/products');
        }

        const deletedTitle = products[productId].title;
        const uniqueCode = products[productId].unique_code;

        // حذف از ویترین اگر وجود داشت
        const indexData = await readJsonFile(INDEX_DATA_PATH);
        if (uniqueCode) {
            indexData.top_products = (indexData.top_products || []).filter(code => code !== uniqueCode);
            await writeJsonFile(INDEX_DATA_PATH, indexData);
        }

        delete products[productId];

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`✅ محصول حذف شد: "${deletedTitle}" (ID: ${productId}, کد: ${uniqueCode}) توسط ${req.user?.username}`);
        operation.end('success', { productId, title: deletedTitle.substring(0, 50), uniqueCode });

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در حذف محصول ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'خطا در حذف محصول' });
    }
});

// ==============================
// TOGGLE SHOWCASE
// ==============================

router.get('/toggle-showcase/:uniqueCode', checkToken, async (req, res) => {
    const operation = logger.startOperation('تغییر وضعیت ویترین', {
        admin: req.user?.username,
        uniqueCode: req.params.uniqueCode
    });

    try {
        const uniqueCode = req.params.uniqueCode;

        if (!uniqueCode) {
            logger.withRequest(req, 'کد یکتا برای تغییر وضعیت ویترین دریافت نشد');
            operation.end('failed', { reason: 'missing_unique_code' });
            return res.redirect('/admin/products');
        }

        let indexData;
        try {
            indexData = await readJsonFile(INDEX_DATA_PATH);
        } catch (err) {
            indexData = { top_products: [] };
        }

        indexData.top_products = indexData.top_products || [];

        const index = indexData.top_products.indexOf(uniqueCode);
        let action;

        if (index > -1) {
            indexData.top_products.splice(index, 1);
            action = 'removed';
        } else {
            indexData.top_products.push(uniqueCode);
            action = 'added';
        }

        await writeJsonFile(INDEX_DATA_PATH, indexData);

        logger.info(`✅ وضعیت ویترین برای کد ${uniqueCode}: ${action === 'added' ? 'افزوده شد' : 'حذف شد'} توسط ${req.user?.username}`);
        operation.end('success', { uniqueCode, action });

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در تغییر وضعیت ویترین برای کد ${req.params.uniqueCode}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'خطا در تغییر وضعیت ویترین' });
    }
});

module.exports = router;