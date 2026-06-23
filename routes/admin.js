const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

// ==============================
// TOKEN FUNCTIONS
// ==============================

function generateToken(username) {
    return jwt.sign(
        { username },
        SECRET_KEY,
        { expiresIn: '1h' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        return null;
    }
}


// ==============================
// TEST ROUTE
// ==============================

router.get('/', (req, res) => {
    res.redirect('/admin/login')
});

router.get('/login',(req,res)=>{
	console.log('here3')
    const token = req.cookies?.adminToken;

    if (token && verifyToken(token)) {
        return res.redirect('/admin/panel');
    }

	res.render('adminLogin', { error: null })
})

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // خواندن فایل users.json
    const usersPath = path.join(__dirname, '..','data','adminAccounts.json');
    const usersData = fs.readFileSync(usersPath, 'utf8');
    const users = JSON.parse(usersData);

    // پیدا کردن کاربر
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.render('adminLogin', { error: 'کاربر یافت نشد' });
    }

    // مقایسه پسورد با bcrypt
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {

		console.log('here1')
		const token = generateToken(username);

		res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1 * 60 * 60 * 1000
        });

		console.log('here2')
        return res.redirect('/');
    }

    res.render('adminLogin', { error: 'رمز عبور اشتباه است' });
});

router.get('/panel',(req,res)=>{
	const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

	//if(false/* login==false */){res.redirect('/admin/login')}

	res.render('adminPanel')
})

module.exports = router;