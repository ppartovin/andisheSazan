const fs = require('fs');
const path = require('path');

const adminViewsDir = path.join(__dirname, '..', 'views', 'adminPanel');
const cssDir = path.join(__dirname, '..', 'public', 'css');

// Read all .ejs files in adminPanel
const files = fs.readdirSync(adminViewsDir).filter(f => f.endsWith('.ejs'));

files.forEach(file => {
    const filePath = path.join(adminViewsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Extract style tag content
    const styleRegex = /<style>([\s\S]*?)<\/style>/;
    const match = content.match(styleRegex);
    
    if (!match) {
        console.log(`[SKIP] ${file}: No <style> tag found`);
        return;
    }
    
    const styleContent = match[1];
    
    // Create CSS filename: e.g. adminBlogs_style.css
    const baseName = path.basename(file, '.ejs');
    const cssFileName = baseName + '_style.css';
    const cssPath = path.join(cssDir, cssFileName);
    
    // Write CSS file
    fs.writeFileSync(cssPath, styleContent.trimStart(), 'utf8');
    console.log(`[CSS] Created ${cssFileName}`);
    
    // Replace <style>...</style> with <link> in EJS
    const linkTag = `    <link rel="stylesheet" href="/public/css/${cssFileName}">`;
    const newContent = content.replace(styleRegex, linkTag);
    
    // Write back to EJS file
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`[EJS] Updated ${file} -> removed <style>, added <link>`);
});

console.log('\nDone!');