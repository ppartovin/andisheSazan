const fs = require('fs');
const path = require('path');

// ==============================
// CONFIG
// ==============================

const ROOT_DIR = path.join(__dirname, '..');
const IGNORE_DIRS = ['node_modules', '.git', 'logs', 'tmp', 'cache'];
const IGNORE_FILES = ['.env', '.gitignore', 'package-lock.json'];

// ==============================
// SHOW STRUCTURE
// ==============================

function showStructure(dir, prefix = '') {
    const items = fs.readdirSync(dir);

    // فیلتر کردن
    const filteredItems = items.filter(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            return !IGNORE_DIRS.includes(item);
        }

        return !IGNORE_FILES.includes(item);
    });

    // مرتب‌سازی: پوشه‌ها اول، سپس فایل‌ها
    filteredItems.sort((a, b) => {
        const aIsDir = fs.statSync(path.join(dir, a)).isDirectory();
        const bIsDir = fs.statSync(path.join(dir, b)).isDirectory();

        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
    });

    filteredItems.forEach((item, index) => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        const isLast = index === filteredItems.length - 1;

        const connector = isLast ? '└── ' : '├── ';
        const prefixNew = isLast ? '    ' : '│   ';

        console.log(prefix + connector + item);

        if (stat.isDirectory()) {
            showStructure(fullPath, prefix + prefixNew);
        }
    });
}

// ==============================
// RUN
// ==============================

console.log('📁 Project Structure:\n');
console.log('📦 ' + path.basename(ROOT_DIR));
showStructure(ROOT_DIR, '    ');