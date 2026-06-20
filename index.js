require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const app = express();

// تنظیمات امنیتی و ویو انجین
/* app.use(helmet());
 */app.set('view engine', 'ejs');
app.use('/public',express.static('public'));

// تابع رندر پیج
const renderPage = (res, pageName, lang, data = {}) => {
    // اگر زبان انگلیسی بود En و اگر نبود پیشفرض Fa
    const suffix = (lang === 'en') ? 'En' : 'Fa';
    const viewName = `${pageName}${suffix}`;
    console.log('render:',viewName)
    // رندر با هندل کردن خطای وجود فایل
    res.render(viewName, { data, lang }, (err, html) => {
        if (err) {
            // اگر فایل وجود نداشت، به ارور 404 پاس بده
            return res.status(404).render('404', { message: 'Page not found' });
        }
        res.send(html);
    });
};

// روت‌های اصلی و صفحات استاتیک
app.get('/', (req, res) => res.redirect('/index'));
// --- روت‌های اصلاح شده ---

app.get('/index', (req, res) => res.redirect('/index/fa'));
app.get('/index/:lang', (req, res) => renderPage(res, 'index', req.params.lang));

app.get('/aboutus', (req, res) => res.redirect('/aboutus/fa'));
app.get('/aboutus/:lang', (req, res) => {console.log('aboutus'); renderPage(res, 'aboutus', req.params.lang) });

app.get('/team', (req, res) => res.redirect('/team/fa'));
app.get('/team/:lang', (req, res) => renderPage(res, 'team', req.params.lang));

app.get('/wholesale', (req, res) => res.redirect('/wholesale/fa'));
app.get('/wholesale/:lang', (req, res) => renderPage(res, 'wholesale', req.params.lang));

app.get('/products', (req, res) => res.redirect('/products/fa'));
app.get('/products/:lang', (req, res) => {
    renderPage(res, 'products', req.params.lang);
});

app.get('/product/:id', (req, res) => res.redirect(`/product/${req.params.id}/fa`));
app.get('/product/:id/:lang', (req, res) => {
    const products = JSON.parse(fs.readFileSync('./data/products.json', 'utf8'));
    const product = products.find(p => p.id == req.params.id);
    renderPage(res, 'productDetail', req.params.lang, { product });
});

app.get('/contact', (req, res) => res.redirect('/contact/fa'));
app.get('/contact/:lang', (req, res) => renderPage(res, 'contact', req.params.lang));

app.get('/trusted', (req, res) => res.redirect('/trusted/fa'));
app.get('/trusted/:lang', (req, res) => renderPage(res, 'trusted', req.params.lang));

app.get('/partnership', (req, res) => res.redirect('/career/fa'));
app.get('/partnership/:lang', (req, res) => {console.log('partnership'); renderPage(res, 'partnership', req.params.lang)});

app.get('/blog', (req, res) => res.redirect('/blog/fa'));
app.get('/blog/:lang', (req, res) => renderPage(res, 'blog', req.params.lang));

app.get('/faq', (req, res) => res.redirect('/faq/fa'));
app.get('/faq/:lang', (req, res) => renderPage(res, 'faq', req.params.lang));

app.get('/customorder', (req, res) => res.redirect('/customorder/fa'));
app.get('/customorder/:lang', (req, res) => renderPage(res, 'customorder', req.params.lang));


// فرض کنید این دیتابیس ماست (۱۰۰ محصول فرضی)
const allProducts = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    name: `محصول شماره ${i + 1}`,
    price: `${(i + 1) * 10000} تومان`,
    description: `توضیحات کوتاه برای محصول شماره ${i + 1}`
}));

// API برای دریافت محصولات به صورت تکه‌ای (Pagination)
app.get('/api/products', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // تعداد محصول در هر بار بارگذاری
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const results = allProducts.slice(startIndex, endIndex);

    // شبیه‌سازی تاخیر شبکه برای دیدن حالت Loading
    setTimeout(() => {
        res.json({
            products: results,
            hasMore: endIndex < allProducts.length // آیا هنوز محصولی مانده؟
        });
    }, 500); 
});


// مدیریت ارور 404 (برای تمام مسیرهایی که پیدا نشدند)
app.use((req, res, next) => {
    console.log('404')
    res.status(404).render('404');
});

// مدیریت خطاهای عمومی (500)
app.use((err, req, res, next) => {
    console.log('err')
    console.error(err.stack);
    res.status(500).render('err');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));


/*

سید ببین می خواهم که یک سایت بزنم با express.js و ejs و dotenv و helmet که سایت یک شرکت باشه
می خواهم یک صفحه ی ایندکس یا صفحه ی اول سایت داشته باشه که در مسیر / باشه
می خواهم یک صفحه ی /aboutus داشته باشه
می خواهم یک صفحه داشته باشه جهت معرفی اشخاص در اون شرکت مانند مدیر عامل سرمایه گزاران بنیان گذاران
می خواهم یک صفحه ی نمایش محصولات داشته باشه به صورت لیستی
می خواهم یک صفحه ی ارطبات با ما داشته باشه
می خواهم یک صفحه ی کسانی که به ما اعتماد کردند داشته باشه
می خواهم یک صفحه ی همکاری با ما داشته باشه(برای شرح مزیات همکاری)
می خواهم برای هر محصول یک صفحه داشته باشه
می خواهم صفحات ارور برای 404 و دیگر ارور ها داشته باشه
می خواهم صفحه ی بلاگ و اخبار داشته باشه
می خواهم صفحه ی سوالات متداول داشته باشه


می خواهم قابلیت تغییر زبان داشته باشه(زبان در قسمت مغییر های یو آر ال ثبت بشه و اگر نبود پیشفرض فارسی باشه)
سیستم ذخیره سازی دیتا ها با جیسون هست
ادمین پلن رو بعدا می سازم(کاری بهش نداشته باش)
در بک اند حتما مدیریت ارور خوبی داشته باشه

*/