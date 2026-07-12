const express = require('express');
const router = express.Router();
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
const { logger } = require('../logger'); // ← اضافه کردن logger

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables'); // ← تبدیل به logger
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
            return {}; // فایل خالی → آبجکت خالی
        }
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`فایل محصولات یافت نشد: ${filePath}`); // ← لاگ هشدار
            return {}; // فایل وجود ندارد → آبجکت خالی
        }
        logger.error(`JSON نامعتبر در فایل محصولات: ${filePath}`, { error: err.message }); // ← لاگ خطا
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

const writeJsonFile = async (filePath, data) => {
    try {
        await writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        logger.error(`خطا در نوشتن فایل: ${filePath}`, { error: err.message }); // ← لاگ خطا
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
            logger.withRequest(req, 'تلاش برای دسترسی به مدیریت محصولات بدون توکن'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'توکن نامعتبر در مدیریت محصولات'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بررسی توکن مدیریت محصولات'); // ← لاگ خطا با اطلاعات درخواست
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ==============================
// VALIDATION HELPERS
// ==============================

const isValidPrice = (price) => {
    if (!price) return true; // قیمت اختیاری است
    const num = parseFloat(price.replace(/,/g, ''));
    return !isNaN(num) && num >= 0;
};

// ==============================
// ROUTES
// ==============================

// List all products
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('بارگذاری لیست محصولات', { // ← شروع عملیات
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

        logger.info(`لیست محصولات بارگذاری شد: ${products.length} محصول`); // ← لاگ اطلاعات
        operation.end('success', { productCount: products.length }); // ← پایان موفق

        res.render('adminPanel/adminProducts', { products });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری لیست محصولات'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در بارگذاری لیست محصولات' });
    }
});

// Show add form
router.get('/add', checkToken, async (req, res) => {
    try {
        logger.withRequest(req, `دسترسی به فرم افزودن محصول توسط: ${req.user?.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminProductsAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری فرم افزودن محصول'); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err');
    }
});

// Add new product
router.post('/add', checkToken, async (req, res) => {
    const operation = logger.startOperation('افزودن محصول جدید', { // ← شروع عملیات
        admin: req.user?.username,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        logger.debug('داده‌های دریافتی برای محصول جدید', { body: req.body }); // ← لاگ دیباگ

        const { title, subtitle, price, description } = req.body;

        // اعتبارسنجی عنوان
        if (!title || title.trim() === '') {
            logger.withRequest(req, 'تلاش برای افزودن محصول بدون عنوان'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'missing_title' }); // ← پایان ناموفق
            return res.render('adminPanel/adminProductsAdd', { error: 'عنوان محصول الزامی است' });
        }

        if (title.length > 200) {
            logger.withRequest(req, `عنوان محصول خیلی طولانی است: ${title.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'title_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminProductsAdd', { error: 'عنوان محصول نباید بیشتر از ۲۰۰ کاراکتر باشد' });
        }

        // ==============================
        // پردازش تصاویر (آرایه)
        // ==============================
        const imageArray = req.body.image || [];
        const cleanedImages = imageArray.filter(img => img && img.trim()).map(img => img.trim());

        // ==============================
        // پردازش فروشگاه‌ها
        // ==============================
        const shops = [];
        const shopNames = req.body.shop_name || [];
        const shopLinks = req.body.shop_link || [];
        const shopImages = req.body.shop_image || [];

        for (let i = 0; i < shopNames.length; i++) {
            if (shopNames[i] && shopNames[i].trim()) {
                shops.push({
                    name: shopNames[i].trim().replace(/[،,]\s*$/, ''),
                    link: shopLinks[i]?.trim().replace(/[،,]\s*$/, '') || '',
                    image: shopImages[i]?.trim().replace(/[،,]\s*$/, '') || ''
                });
            }
        }

        // ==============================
        // پردازش ویژگی‌ها
        // ==============================
        const properties = {};
        const propKeys = req.body.prop_key || [];
        const propValues = req.body.prop_value || [];

        for (let i = 0; i < propKeys.length; i++) {
            if (propKeys[i] && propKeys[i].trim()) {
                properties[propKeys[i].trim()] = propValues[i]?.trim() || '';
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
            title: title.trim(),
            subtitle: subtitle?.trim() || '',
            price: price?.trim() || '',
            description: description?.trim() || '',
            image: cleanedImages,
            shops: shops,
            properties: properties,
            unique_code: uniqueCode
        };

        logger.debug('محصول جدید ساخته شد', { product: newProduct }); // ← لاگ دیباگ

        products[nextId] = newProduct;

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`✅ محصول جدید اضافه شد: "${title.trim()}" (ID: ${nextId}, کد: ${uniqueCode}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { 
            productId: nextId, 
            uniqueCode, 
            title: title.trim().substring(0, 50),
            shopCount: shops.length,
            imageCount: cleanedImages.length
        }); // ← پایان موفق

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در افزودن محصول'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در افزودن محصول' });
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;
        
        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `شناسه محصول نامعتبر برای ویرایش: ${productId}`); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);
        const product = products[productId];

        if (!product) {
            logger.withRequest(req, `محصول با شناسه ${productId} برای ویرایش یافت نشد`); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/products');
        }

        logger.withRequest(req, `دسترسی به فرم ویرایش محصول ${productId} (${product.title}) توسط: ${req.user?.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminProductsEdit', { 
            product: { id: productId, ...product } 
        });

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در بارگذاری فرم ویرایش محصول ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err', { message: 'خطا در بارگذاری فرم ویرایش' });
    }
});

// Update product
router.post('/edit/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('ویرایش محصول', { // ← شروع عملیات
        admin: req.user?.username,
        productId: req.params.id,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        const productId = req.params.id;
        const { title, subtitle, price, description } = req.body;

        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `شناسه محصول نامعتبر برای ویرایش: ${productId}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_id' }); // ← پایان ناموفق
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            logger.withRequest(req, `محصول با شناسه ${productId} برای ویرایش یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'product_not_found' }); // ← پایان ناموفق
            return res.redirect('/admin/products');
        }

        if (title && title.length > 200) {
            logger.withRequest(req, `عنوان محصول خیلی طولانی است: ${title.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'title_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminProductsEdit', { 
                product: { id: productId, ...products[productId] },
                error: 'عنوان محصول نباید بیشتر از ۲۰۰ کاراکتر باشد'
            });
        }

        if (price && !isValidPrice(price)) {
            logger.withRequest(req, `قیمت نامعتبر: ${price}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_price' }); // ← پایان ناموفق
            return res.render('adminPanel/adminProductsEdit', {
                product: { id: productId, ...products[productId] },
                error: 'قیمت باید یک عدد معتبر باشد'
            });
        }

        const oldTitle = products[productId].title;

        products[productId] = {
            ...products[productId],
            title: title?.trim() || products[productId].title,
            subtitle: subtitle?.trim() || products[productId].subtitle || '',
            price: price?.trim() || products[productId].price || '',
            description: description?.trim() || products[productId].description || ''
        };

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`✅ محصول ویرایش شد: "${oldTitle}" → "${title}" (ID: ${productId}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { 
            productId, 
            oldTitle: oldTitle.substring(0, 50), 
            newTitle: title?.substring(0, 50) || oldTitle.substring(0, 50) 
        }); // ← پایان موفق

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در ویرایش محصول ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در ویرایش محصول' });
    }
});

// Delete product
router.get('/delete/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('حذف محصول', { // ← شروع عملیات
        admin: req.user?.username,
        productId: req.params.id
    });

    try {
        const productId = req.params.id;

        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `شناسه محصول نامعتبر برای حذف: ${productId}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_id' }); // ← پایان ناموفق
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            logger.withRequest(req, `محصول با شناسه ${productId} برای حذف یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'product_not_found' }); // ← پایان ناموفق
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

        logger.info(`✅ محصول حذف شد: "${deletedTitle}" (ID: ${productId}, کد: ${uniqueCode}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { productId, title: deletedTitle.substring(0, 50), uniqueCode }); // ← پایان موفق

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در حذف محصول ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در حذف محصول' });
    }
});

// ==============================
// TOGGLE SHOWCASE
// ==============================

router.get('/toggle-showcase/:uniqueCode', checkToken, async (req, res) => {
    const operation = logger.startOperation('تغییر وضعیت ویترین', { // ← شروع عملیات
        admin: req.user?.username,
        uniqueCode: req.params.uniqueCode
    });

    try {
        const uniqueCode = req.params.uniqueCode;

        if (!uniqueCode) {
            logger.withRequest(req, 'کد یکتا برای تغییر وضعیت ویترین دریافت نشد'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'missing_unique_code' }); // ← پایان ناموفق
            return res.redirect('/admin/products');
        }

        // خواندن index_data.json
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
            // حذف از ویترین
            indexData.top_products.splice(index, 1);
            action = 'removed';
        } else {
            // افزودن به ویترین
            indexData.top_products.push(uniqueCode);
            action = 'added';
        }

        await writeJsonFile(INDEX_DATA_PATH, indexData);

        logger.info(`✅ وضعیت ویترین برای کد ${uniqueCode}: ${action === 'added' ? 'افزوده شد' : 'حذف شد'} توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { uniqueCode, action }); // ← پایان موفق

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در تغییر وضعیت ویترین برای کد ${req.params.uniqueCode}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در تغییر وضعیت ویترین' });
    }
});

module.exports = router;