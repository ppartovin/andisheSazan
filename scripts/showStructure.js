const fs = require('fs');
const path = require('path');

// ==============================
// CONFIG
// ==============================

const ROOT_DIR = path.join(__dirname, '..');
const IGNORE_DIRS = ['node_modules', '.git', 'logs', 'tmp', 'cache', 'data'];
const IGNORE_FILES = ['.env', '.gitignore', 'package-lock.json', 'package.json'];

// ==============================
// COUNT LINES OF CODE
// ==============================

const countLines = (filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').length;
    } catch {
        return 0;
    }
};

const isTextFile = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = ['.js', '.ejs', '.html', '.css', '.json', '.md', '.txt', '.sh', '.yml', '.yaml'];
    return textExtensions.includes(ext);
};

// ==============================
// GET ALL FILES (Recursive)
// ==============================

const getAllFiles = (dir, baseDir = '') => {
    const items = fs.readdirSync(dir);
    let files = [];

    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(item)) {
                files = files.concat(getAllFiles(fullPath, path.join(baseDir, item)));
            }
        } else {
            if (!IGNORE_FILES.includes(item)) {
                files.push({
                    name: item,
                    path: fullPath,
                    relativePath: path.join(baseDir, item),
                    ext: path.extname(item)
                });
            }
        }
    });

    return files;
};

// ==============================
// SHOW STRUCTURE
// ==============================

const showStructure = (dir, prefix = '') => {
    const items = fs.readdirSync(dir);

    const filteredItems = items.filter(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            return !IGNORE_DIRS.includes(item);
        }
        return !IGNORE_FILES.includes(item);
    });

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

        if (stat.isDirectory()) {
            console.log(prefix + connector + item + '/');
            showStructure(fullPath, prefix + prefixNew);
        } else {
            const lines = isTextFile(fullPath) ? countLines(fullPath) : 0;
            const lineInfo = lines > 0 ? ` (${lines} lines)` : '';
            console.log(prefix + connector + item + lineInfo);
        }
    });
};

// ==============================
// RUN
// ==============================

console.log('📁 Project Structure with Line Counts\n');
console.log('📦 ' + path.basename(ROOT_DIR));

// First, show structure
showStructure(ROOT_DIR, '    ');

// Then, count total lines
console.log('\n' + '='.repeat(50));
console.log('\n📊 Total Code Statistics:');

const allFiles = getAllFiles(ROOT_DIR);
const jsFiles = allFiles.filter(f => f.ext === '.js');
const ejsFiles = allFiles.filter(f => f.ext === '.ejs');
const cssFiles = allFiles.filter(f => f.ext === '.css');
const htmlFiles = allFiles.filter(f => f.ext === '.html');
const jsonFiles = allFiles.filter(f => f.ext === '.json');

const countTotalLines = (files) => {
    return files.reduce((sum, file) => sum + countLines(file.path), 0);
};

console.log(`   📄 JavaScript files: ${jsFiles.length} files, ${countTotalLines(jsFiles)} lines`);
console.log(`   📄 EJS files:       ${ejsFiles.length} files, ${countTotalLines(ejsFiles)} lines`);
console.log(`   📄 CSS files:       ${cssFiles.length} files, ${countTotalLines(cssFiles)} lines`);
console.log(`   📄 HTML files:      ${htmlFiles.length} files, ${countTotalLines(htmlFiles)} lines`);
console.log(`   📄 JSON files:      ${jsonFiles.length} files, ${countTotalLines(jsonFiles)} lines`);
console.log(`   📄 Total files:     ${allFiles.length} files, ${countTotalLines(allFiles)} lines`);
console.log('\n' + '='.repeat(50));