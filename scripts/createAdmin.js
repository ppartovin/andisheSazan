const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const args = process.argv.slice(2);
const username = args[0];
const password = args[1];

if (!username || !password) {
    console.log('❌ استفاده: npm run createAdmin <username> <password>');
    process.exit(1);
}

const usersPath = path.join(__dirname, '../data/adminAccounts.json');

// اگر فایل نبود، بساز
if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, JSON.stringify([], null, 2));
}

const usersData = fs.readFileSync(usersPath, 'utf8');
const users = JSON.parse(usersData);

if (users.find(u => u.username === username)) {
    console.log(`❌ کاربر "${username}" قبلاً وجود دارد`);
    process.exit(1);
}

const hashedPassword = bcrypt.hashSync(password, 10);

users.push({
    username: username,
    password: hashedPassword
});

fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

console.log(`✅ کاربر "${username}" با موفقیت اضافه شد`);