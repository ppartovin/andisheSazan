// logger.js
const winston = require('winston');
const morgan = require('morgan');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// اطمینان از وجود پوشه logs (در صورت نیاز)
const fs = require('fs');
const logDir = 'logs';
fs.mkdirSync(logDir, { recursive: true });


const sensitiveFilter = winston.format((info) => {
    const sensitiveFields = ['password', 'token', 'authorization', 'cookie', 'secret'];
    const redact = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;
        return Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [
                k,
                sensitiveFields.includes(k.toLowerCase()) ? '[REDACTED]' : redact(v)
            ])
        );
    };
    return Object.assign(info, redact(info));
});



// ==============================================
// 1. پیکربندی Winston (لاگر اصلی)
// ==============================================

// تعریف فرمت سفارشی برای لاگ‌ها
const customFormat = winston.format.combine(
	sensitiveFilter(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }), // ثبت کامل خطاها با پشته
    winston.format.splat(), // پشتیبانی از جایگزین‌های %s, %d, %j
    winston.format.json() // خروجی به صورت JSON برای پردازش بهتر
);

// فرمت ساده‌تر برای کنسول (قابل خواندن برای انسان)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
        return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
);

const consoleTransport = new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
});
consoleTransport.on('error', (err) => {
    console.error('خطا در consoleTransport:', err);
});

// Transport برای چرخش خودکار فایل‌های لاگ
const fileRotateTransport = new DailyRotateFile({
    filename: path.join('logs', 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d', // نگهداری لاگ‌های ۱۴ روز اخیر
    maxSize: '20m', // حداکثر حجم هر فایل: ۲۰ مگابایت
    format: customFormat
});

// Transport برای ذخیره فقط خطاها در یک فایل جداگانه
const errorFileTransport = new DailyRotateFile({
    filename: path.join('logs', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d', // خطاها را بیشتر نگه می‌داریم
    level: 'error',
    format: customFormat
});

errorFileTransport.on('error', (err) => {
    console.error('خطا در errorFileTransport:', err);
});


// ایجاد لاگر اصلی Winston
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    transports: [
/*         // خروجی به کنسول (با فرمت خوانا)
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
        }), */
        // خروجی به فایل با چرخش خودکار
        fileRotateTransport,
        // خروجی خطاها به فایل جداگانه
        errorFileTransport,
		consoleTransport
    ],
    exitOnError: false, // در صورت خطا در لاگر، برنامه متوقف نشود
});

fileRotateTransport.on('error', (err) => {
    console.error('خطا در fileRotateTransport:', err);
});


// ==============================================
// 2. پیکربندی Morgan و اتصال به Winston
// ==============================================

// ایجاد stream برای Morgan که لاگ‌ها را به Winston بفرستد
const morganStream = {
    write: (message) => {
        // حذف فاصله و خط جدید اضافی و ارسال به Winston
        logger.info(message.trim());
    }
};

// ساخت middleware Morgan با فرمت combined
const morganMiddleware = morgan('combined', { 
    stream: morganStream,
    // حذف درخواست‌های مربوط به فایل‌های استاتیک (اختیاری)
    skip: (req) => {
        // می‌توانید درخواست‌های خاصی را نادیده بگیرید
        // مثل: req.url.startsWith('/static') 
        return false;
    }
});

// ==============================================
// 3. توابع کمکی برای لاگ‌گیری آسان‌تر
// ==============================================

// تابع برای لاگ کردن با شناسه درخواست (در صورت وجود)
logger.withRequest = (req, message, meta = {}) => {
    const requestInfo = {
        requestId: req.id || req.headers['x-request-id'] || 'unknown',
        method: req.method,
        url: req.url,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
    };
    return logger.info(message, { ...meta, request: requestInfo });
};

// تابع برای لاگ خطا با اطلاعات درخواست
logger.errorWithRequest = (req, error, message = 'خطا رخ داد') => {
    const requestInfo = {
        requestId: req.id || req.headers['x-request-id'] || 'unknown',
        method: req.method,
        url: req.url,
        ip: req.ip || req.socket.remoteAddress,
    };
    return logger.error(message, {
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name
        },
        request: requestInfo
    });
};

// تابع کمکی برای شروع و پایان یک عملیات
logger.startOperation = (operationName, meta = {}) => {
    const startTime = Date.now();
    logger.info(`شروع عملیات: ${operationName}`, { ...meta, operation: operationName, startTime });
    return {
        end: (result = 'success', additionalMeta = {}) => {
            const duration = Date.now() - startTime;
            logger.info(`پایان عملیات: ${operationName}`, {
                ...meta,
                ...additionalMeta,
                operation: operationName,
                duration: `${duration}ms`,
                result
            });
            return { duration, result };
        }
    };
};

// اضافه کردن هندلر برای خطاهای خود لاگر
logger.on('error', (err) => {
    console.error('خطا در لاگر:', err.message);
    // می‌تونی به یک سرویس مانیتورینگ مثل Sentry بفرستی
});

// ==============================================
// 4. خروجی‌های ماژول
// ==============================================

module.exports = {
    logger,          // لاگر اصلی Winston
    morganMiddleware // Middleware Morgan برای Express
};