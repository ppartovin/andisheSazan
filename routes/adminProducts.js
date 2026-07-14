// ============================================================
// IMPORTS & DEPENDENCIES
// ============================================================

const express = require('express');
const router = express.Router();
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
const { logger } = require('../logger');

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables');
    process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_PATH = path.join(DATA_DIR, 'products.json');
const INDEX_DATA_PATH = path.join(DATA_DIR, 'index_data.json');

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Reads and parses a JSON file from the given path
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Object|Array>} Parsed JSON data or empty object on error
 * @throws {Error} If JSON is invalid
 */
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
            logger.warn(`Products file not found: ${filePath}`);
            return {};
        }
        logger.error(`Invalid JSON in products file: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

/**
 * Writes data to a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {Object|Array} data - Data to write
 * @returns {Promise<void>}
 * @throws {Error} If write operation fails
 */
const writeJsonFile = async (filePath, data) => {
    try {
        await writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        logger.error(`Error writing file: ${filePath}`, { error: err.message });
        throw new Error(`Failed to write file: ${filePath}`);
    }
};

/**
 * Reindexes items to have sequential numeric keys starting from 1
 * @param {Object} items - Object with numeric keys
 * @returns {Object} Reindexed object
 */
const reindexItems = (items) => {
    const newItems = {};
    let counter = 1;
    Object.values(items).forEach(item => {
        newItems[counter] = item;
        counter++;
    });
    return newItems;
};

/**
 * Generates a unique product code
 * @returns {string} Unique code in format PRD-TIMESTAMP-RANDOM
 */
const generateUniqueCode = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PRD-${timestamp}-${random}`;
};

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * Validates if a URL points to a valid image with allowed extension
 * @param {string} url - Image URL to validate
 * @returns {boolean} True if URL is valid and has allowed extension
 */
const isValidImageUrl = (url) => {
    if (!url) return true;

    try {
        const parsed = new URL(url);

        // Only HTTP and HTTPS protocols allowed
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }

        // Allowed file extensions
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const ext = path.extname(parsed.pathname).toLowerCase();
        if (!validExtensions.includes(ext)) {
            return false;
        }

        // Block malicious domains
        const hostname = parsed.hostname.toLowerCase();
        const blockedDomains = ['malicious.com', 'evil.com'];
        if (blockedDomains.some(domain => hostname.includes(domain))) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
};

/**
 * Validates if a price string is a valid positive number
 * @param {string} price - Price string to validate
 * @returns {boolean} True if price is valid
 */
const isValidPrice = (price) => {
    if (!price) return true;
    const num = parseFloat(price.replace(/,/g, ''));
    return !isNaN(num) && num >= 0;
};

/**
 * Sanitizes user input by trimming and escaping HTML
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return '';
    return escapeHtml(input.trim());
};

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch {
        return null;
    }
};

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

/**
 * Middleware to verify admin authentication token
 * Redirects to login page if token is missing or invalid
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const checkToken = (req, res, next) => {
    try {
        const token = req.cookies?.adminToken;
        if (!token) {
            logger.withRequest(req, 'Attempted to access product management without token');
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'Invalid token in product management');
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error verifying token in product management');
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ============================================================
// ROUTES - LIST PRODUCTS
// ============================================================

/**
 * GET /admin/products
 * Displays a list of all products with showcase status
 */
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('Loading product list', {
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

        logger.info(`Product list loaded: ${products.length} products`);
        operation.end('success', { productCount: products.length });

        res.render('adminPanel/adminProducts', { products });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading product list');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error loading product list' });
    }
});

// ============================================================
// ROUTES - ADD PRODUCT
// ============================================================

/**
 * GET /admin/products/add
 * Displays the add product form
 */
router.get('/add', checkToken, async (req, res) => {
    try {
        logger.withRequest(req, `Accessing add product form by: ${req.user?.username}`);
        res.render('adminPanel/adminProductsAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading add product form');
        res.status(500).render('err');
    }
});

/**
 * POST /admin/products/add
 * Creates a new product
 */
router.post('/add', checkToken, async (req, res) => {
    const operation = logger.startOperation('Adding new product', {
        admin: req.user?.username,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        logger.debug('Received data for new product', { body: req.body });

        const { title, subtitle, price, description } = req.body;

        // Validate required fields
        if (!title || title.trim() === '') {
            logger.withRequest(req, 'Attempted to add product without title');
            operation.end('failed', { reason: 'missing_title' });
            return res.render('adminPanel/adminProductsAdd', { error: 'Product title is required' });
        }

        if (title.length > 200) {
            logger.withRequest(req, `Product title too long: ${title.length} characters`);
            operation.end('failed', { reason: 'title_too_long' });
            return res.render('adminPanel/adminProductsAdd', { error: 'Product title cannot exceed 200 characters' });
        }

        // Process images
        const imageArray = req.body.image || [];
        const cleanedImages = [];
        const MAX_IMAGES = 10;

        if (imageArray.length > MAX_IMAGES) {
            logger.withRequest(req, `Too many images: ${imageArray.length}`);
            operation.end('failed', { reason: 'too_many_images' });
            return res.render('adminPanel/adminProductsAdd', {
                error: `Maximum ${MAX_IMAGES} images allowed`
            });
        }

        for (const img of imageArray) {
            if (img && img.trim()) {
                const trimmed = img.trim();

                if (!isValidImageUrl(trimmed)) {
                    logger.withRequest(req, `Invalid image URL: ${trimmed}`);
                    operation.end('failed', { reason: 'invalid_image_url' });
                    return res.render('adminPanel/adminProductsAdd', {
                        error: 'Invalid image URL. Only jpg, jpeg, png, gif, webp, svg extensions are allowed.'
                    });
                }

                cleanedImages.push(trimmed);
            }
        }

        // Process shops
        const shops = [];
        const shopNames = req.body.shop_name || [];
        const shopLinks = req.body.shop_link || [];
        const shopImages = req.body.shop_image || [];

        if (shopNames.length > 20) {
            logger.withRequest(req, `Too many shops: ${shopNames.length}`);
            operation.end('failed', { reason: 'too_many_shops' });
            return res.render('adminPanel/adminProductsAdd', {
                error: 'Maximum 20 shops allowed'
            });
        }

        for (let i = 0; i < shopNames.length; i++) {
            if (shopNames[i] && shopNames[i].trim()) {
                const name = sanitizeInput(shopNames[i]);
                const link = sanitizeInput(shopLinks[i] || '');
                const image = sanitizeInput(shopImages[i] || '');

                if (name.length > 100) {
                    logger.withRequest(req, `Shop name too long: ${name.length} characters`);
                    operation.end('failed', { reason: 'shop_name_too_long' });
                    return res.render('adminPanel/adminProductsAdd', {
                        error: 'Shop name cannot exceed 100 characters'
                    });
                }

                if (link.length > 500) {
                    logger.withRequest(req, `Shop link too long: ${link.length} characters`);
                    operation.end('failed', { reason: 'shop_link_too_long' });
                    return res.render('adminPanel/adminProductsAdd', {
                        error: 'Shop link cannot exceed 500 characters'
                    });
                }

                if (image.length > 500) {
                    logger.withRequest(req, `Shop image URL too long: ${image.length} characters`);
                    operation.end('failed', { reason: 'shop_image_too_long' });
                    return res.render('adminPanel/adminProductsAdd', {
                        error: 'Shop image URL cannot exceed 500 characters'
                    });
                }

                shops.push({
                    name: name,
                    link: link,
                    image: image
                });
            }
        }

        // Process properties
        const properties = {};
        const propKeys = req.body.prop_key || [];
        const propValues = req.body.prop_value || [];

        if (propKeys.length > 30) {
            logger.withRequest(req, `Too many properties: ${propKeys.length}`);
            operation.end('failed', { reason: 'too_many_properties' });
            return res.render('adminPanel/adminProductsAdd', {
                error: 'Maximum 30 properties allowed'
            });
        }

        for (let i = 0; i < propKeys.length; i++) {
            if (propKeys[i] && propKeys[i].trim()) {
                const key = sanitizeInput(propKeys[i]);
                const value = sanitizeInput(propValues[i] || '');

                if (key.length > 100) {
                    logger.withRequest(req, `Property key too long: ${key.length} characters`);
                    operation.end('failed', { reason: 'property_key_too_long' });
                    return res.render('adminPanel/adminProductsAdd', {
                        error: 'Property key cannot exceed 100 characters'
                    });
                }

                if (value.length > 500) {
                    logger.withRequest(req, `Property value too long: ${value.length} characters`);
                    operation.end('failed', { reason: 'property_value_too_long' });
                    return res.render('adminPanel/adminProductsAdd', {
                        error: 'Property value cannot exceed 500 characters'
                    });
                }

                properties[key] = value;
            }
        }

        // Save product
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

        logger.debug('New product created', { product: newProduct });

        products[nextId] = newProduct;

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`New product added: "${title.trim()}" (ID: ${nextId}, Code: ${uniqueCode}) by ${req.user?.username}`);
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
        logger.errorWithRequest(req, err, 'Error adding product');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error adding product' });
    }
});

// ============================================================
// ROUTES - EDIT PRODUCT
// ============================================================

/**
 * GET /admin/products/edit/:id
 * Displays the edit product form
 */
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;

        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `Invalid product ID for editing: ${productId}`);
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);
        const product = products[productId];

        if (!product) {
            logger.withRequest(req, `Product with ID ${productId} not found for editing`);
            return res.redirect('/admin/products');
        }

        logger.withRequest(req, `Accessing edit product form for ${productId} (${product.title}) by: ${req.user?.username}`);
        res.render('adminPanel/adminProductsEdit', {
            product: { id: productId, ...product }
        });

    } catch (err) {
        logger.errorWithRequest(req, err, `Error loading edit product form for ${req.params.id}`);
        res.status(500).render('err', { message: 'Error loading edit form' });
    }
});

/**
 * POST /admin/products/edit/:id
 * Updates an existing product
 */
router.post('/edit/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('Editing product', {
        admin: req.user?.username,
        productId: req.params.id,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        const productId = req.params.id;
        const { title, subtitle, price, description } = req.body;

        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `Invalid product ID for editing: ${productId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            logger.withRequest(req, `Product with ID ${productId} not found for editing`);
            operation.end('failed', { reason: 'product_not_found' });
            return res.redirect('/admin/products');
        }

        if (title && title.length > 200) {
            logger.withRequest(req, `Product title too long: ${title.length} characters`);
            operation.end('failed', { reason: 'title_too_long' });
            return res.render('adminPanel/adminProductsEdit', {
                product: { id: productId, ...products[productId] },
                error: 'Product title cannot exceed 200 characters'
            });
        }

        if (price && !isValidPrice(price)) {
            logger.withRequest(req, `Invalid price: ${price}`);
            operation.end('failed', { reason: 'invalid_price' });
            return res.render('adminPanel/adminProductsEdit', {
                product: { id: productId, ...products[productId] },
                error: 'Price must be a valid number'
            });
        }

        // Process images
        const imageArray = req.body.image || [];
        const cleanedImages = [];
        const MAX_IMAGES = 10;

        if (imageArray.length > MAX_IMAGES) {
            logger.withRequest(req, `Too many images in edit: ${imageArray.length}`);
            operation.end('failed', { reason: 'too_many_images' });
            return res.render('adminPanel/adminProductsEdit', {
                product: { id: productId, ...products[productId] },
                error: `Maximum ${MAX_IMAGES} images allowed`
            });
        }

        for (const img of imageArray) {
            if (img && img.trim()) {
                const trimmed = img.trim();

                if (!isValidImageUrl(trimmed)) {
                    logger.withRequest(req, `Invalid image URL in edit: ${trimmed}`);
                    operation.end('failed', { reason: 'invalid_image_url' });
                    return res.render('adminPanel/adminProductsEdit', {
                        product: { id: productId, ...products[productId] },
                        error: 'Invalid image URL'
                    });
                }

                cleanedImages.push(trimmed);
            }
        }

        // Process shops
        const shops = [];
        const shopNames = req.body.shop_name || [];
        const shopLinks = req.body.shop_link || [];
        const shopImages = req.body.shop_image || [];

        if (shopNames.length > 20) {
            logger.withRequest(req, `Too many shops in edit: ${shopNames.length}`);
            operation.end('failed', { reason: 'too_many_shops' });
            return res.render('adminPanel/adminProductsEdit', {
                product: { id: productId, ...products[productId] },
                error: 'Maximum 20 shops allowed'
            });
        }

        for (let i = 0; i < shopNames.length; i++) {
            if (shopNames[i] && shopNames[i].trim()) {
                const name = sanitizeInput(shopNames[i]);
                const link = sanitizeInput(shopLinks[i] || '');
                const image = sanitizeInput(shopImages[i] || '');

                if (name.length > 100) {
                    logger.withRequest(req, `Shop name too long in edit: ${name.length} characters`);
                    operation.end('failed', { reason: 'shop_name_too_long' });
                    return res.render('adminPanel/adminProductsEdit', {
                        product: { id: productId, ...products[productId] },
                        error: 'Shop name cannot exceed 100 characters'
                    });
                }

                if (link.length > 500) {
                    logger.withRequest(req, `Shop link too long in edit: ${link.length} characters`);
                    operation.end('failed', { reason: 'shop_link_too_long' });
                    return res.render('adminPanel/adminProductsEdit', {
                        product: { id: productId, ...products[productId] },
                        error: 'Shop link cannot exceed 500 characters'
                    });
                }

                if (image.length > 500) {
                    logger.withRequest(req, `Shop image URL too long in edit: ${image.length} characters`);
                    operation.end('failed', { reason: 'shop_image_too_long' });
                    return res.render('adminPanel/adminProductsEdit', {
                        product: { id: productId, ...products[productId] },
                        error: 'Shop image URL cannot exceed 500 characters'
                    });
                }

                shops.push({
                    name: name,
                    link: link,
                    image: image
                });
            }
        }

        // Process properties
        const properties = {};
        const propKeys = req.body.prop_key || [];
        const propValues = req.body.prop_value || [];

        if (propKeys.length > 30) {
            logger.withRequest(req, `Too many properties in edit: ${propKeys.length}`);
            operation.end('failed', { reason: 'too_many_properties' });
            return res.render('adminPanel/adminProductsEdit', {
                product: { id: productId, ...products[productId] },
                error: 'Maximum 30 properties allowed'
            });
        }

        for (let i = 0; i < propKeys.length; i++) {
            if (propKeys[i] && propKeys[i].trim()) {
                const key = sanitizeInput(propKeys[i]);
                const value = sanitizeInput(propValues[i] || '');

                if (key.length > 100) {
                    logger.withRequest(req, `Property key too long in edit: ${key.length} characters`);
                    operation.end('failed', { reason: 'property_key_too_long' });
                    return res.render('adminPanel/adminProductsEdit', {
                        product: { id: productId, ...products[productId] },
                        error: 'Property key cannot exceed 100 characters'
                    });
                }

                if (value.length > 500) {
                    logger.withRequest(req, `Property value too long in edit: ${value.length} characters`);
                    operation.end('failed', { reason: 'property_value_too_long' });
                    return res.render('adminPanel/adminProductsEdit', {
                        product: { id: productId, ...products[productId] },
                        error: 'Property value cannot exceed 500 characters'
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
            image: cleanedImages,
            shops: shops,
            properties: properties
        };

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`Product updated: "${oldTitle}" → "${title}" (ID: ${productId}) by ${req.user?.username}`);
        operation.end('success', {
            productId,
            oldTitle: oldTitle.substring(0, 50),
            newTitle: title?.substring(0, 50) || oldTitle.substring(0, 50),
            shopCount: shops.length,
            propertyCount: Object.keys(properties).length
        });

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `Error editing product ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error editing product' });
    }
});

// ============================================================
// ROUTES - DELETE PRODUCT
// ============================================================

/**
 * GET /admin/products/delete/:id
 * Deletes a product and removes it from showcase if present
 */
router.get('/delete/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('Deleting product', {
        admin: req.user?.username,
        productId: req.params.id
    });

    try {
        const productId = req.params.id;

        if (!productId || isNaN(parseInt(productId)) || !/^\d+$/.test(productId)) {
            logger.withRequest(req, `Invalid product ID for deletion: ${productId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            logger.withRequest(req, `Product with ID ${productId} not found for deletion`);
            operation.end('failed', { reason: 'product_not_found' });
            return res.redirect('/admin/products');
        }

        const deletedTitle = products[productId].title;
        const uniqueCode = products[productId].unique_code;

        // Remove from showcase if present
        const indexData = await readJsonFile(INDEX_DATA_PATH);
        if (uniqueCode) {
            indexData.top_products = (indexData.top_products || []).filter(code => code !== uniqueCode);
            await writeJsonFile(INDEX_DATA_PATH, indexData);
        }

        delete products[productId];

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        logger.info(`Product deleted: "${deletedTitle}" (ID: ${productId}, Code: ${uniqueCode}) by ${req.user?.username}`);
        operation.end('success', { productId, title: deletedTitle.substring(0, 50), uniqueCode });

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `Error deleting product ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error deleting product' });
    }
});

// ============================================================
// ROUTES - TOGGLE SHOWCASE
// ============================================================

/**
 * GET /admin/products/toggle-showcase/:uniqueCode
 * Toggles a product's showcase status
 */
router.get('/toggle-showcase/:uniqueCode', checkToken, async (req, res) => {
    const operation = logger.startOperation('Toggling showcase status', {
        admin: req.user?.username,
        uniqueCode: req.params.uniqueCode
    });

    try {
        const uniqueCode = req.params.uniqueCode;

        if (!uniqueCode) {
            logger.withRequest(req, 'Missing unique code for showcase toggle');
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

        logger.info(`Showcase status for code ${uniqueCode}: ${action} by ${req.user?.username}`);
        operation.end('success', { uniqueCode, action });

        res.redirect('/admin/products');

    } catch (err) {
        logger.errorWithRequest(req, err, `Error toggling showcase for code ${req.params.uniqueCode}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error toggling showcase status' });
    }
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = router;