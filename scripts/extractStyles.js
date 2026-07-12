const fs = require('fs');
const path = require('path');

const viewsDir = 'views';
const cssDir = 'public/css';
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

files.forEach(file => {
    const filePath = path.join(viewsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const name = path.basename(file, '.ejs');

    // Extract style content between <style> and </style>
    const styleRegex = /<style>([\s\S]*?)<\/style>/;
    const match = content.match(styleRegex);
    
    if (match) {
        const styleContent = match[1].trim();
        const cssFilePath = path.join(cssDir, name + '_style.css');
        
        // Write the CSS content to the file
        fs.writeFileSync(cssFilePath, styleContent + '\n');
        console.log('Written CSS to: ' + name + '_style.css');
        
        // Replace <style>...</style> with <link> tag
        const linkTag = '<link rel="stylesheet" href="/public/css/' + name + '_style.css">';
        content = content.replace(styleRegex, linkTag);
        
        // Write back the modified .ejs file
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated: ' + file);
    } else {
        console.log('No <style> tag found in: ' + file + ' (skipped)');
    }
});

console.log('Done!');