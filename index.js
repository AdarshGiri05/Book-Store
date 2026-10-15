require('dotenv').config();

const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');

const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({
    version: 'v1',
    auth: oauth2Client
});
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require("path");
const fs = require('fs');
const express = require('express');
const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "1234";
const SESSION_SECRET = process.env.SESSION_SECRET || require('node:crypto').randomBytes(48).toString('hex');

const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const multer = require('multer');
const session = require('express-session');

async function main() {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookstore';
    await mongoose.connect
    ('mongodb+srv://Adarshgiri05:Adarshgiri006@cluster0.eqiqtln.mongodb.net/bookstore?appName=Cluster0');
    console.log("DB Connected");
    app.listen(PORT, () => {
        console.log("Listening on " + PORT);
    });
}

main().catch((err) => {
    console.error('Database connection failed:', err);
});

const bookSchema = new mongoose.Schema({
    name: String,
    title: String,
    author: String,
    price: Number,
    category: String,
    image: String
});

const Book = mongoose.model('Book', bookSchema, 'books');
const uploadDir = path.join(__dirname, 'public', 'uploads');
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '.jpg');
            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
            cb(null, uniqueName);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
        }
    }
});

fs.mkdirSync(uploadDir, { recursive: true });

app.set('views',path.join(__dirname,'views'))
app.set('view engine','ejs')
app.use(express.static(path.join(__dirname, 'public')));

app.locals.cart = [];

const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(session({
    name: 'bookstore.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000
    }
}));
app.use((req, res, next) => {
    res.locals.isAdmin = req.session.admin?.role === 'admin';
    next();
});

const requireAdmin = (req, res, next) => {
    if (req.session.admin?.role !== 'admin') {
        return res.status(403).send('Administrator access required.');
    }

    next();
};

app.get('/admin', (req, res) => {
    if (req.session.admin?.role === 'admin') {
        return res.redirect('/books');
    }

    res.render('adminlogin', { error: null });
});

app.post('/admin/login', (req, res) => {
    const username = req.body.username?.trim();
    const password = req.body.password;

    if (!username || !password?.trim()) {
        return res.status(400).render('adminlogin', {
            error: 'Please enter both username and password.'
        });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).render('adminlogin', {
            error: 'Invalid username or password.'
        });
    }

    req.session.regenerate((error) => {
        if (error) {
            console.error('Admin session creation error:', error);
            return res.status(500).send('Could not start an administrator session.');
        }

        req.session.admin = { role: 'admin' };
        req.session.save((saveError) => {
            if (saveError) {
                console.error('Admin session save error:', saveError);
                return res.status(500).send('Could not start an administrator session.');
            }

            res.redirect('/books');
        });
    });
});

app.post('/admin/logout', requireAdmin, (req, res, next) => {
    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }

        res.clearCookie('bookstore.sid', {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });
        res.redirect('/books');
    });
});

const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'adarshgiriag2006@gmail.com',
        pass: 'xucx bqyn nelk qvha'
    }
});

app.get('/',(req,res)=>{
    res.render('home')
})
app.get('/about',(req,res)=>{
    res.render('about')
})
app.get('/books', async (req, res) => {
    try {
        const books = await Book.find({});

        console.log("Total books found:", books.length);

        res.render('books', {
            books,
            isAdmin: req.session.admin?.role === 'admin'
        });
    } catch (err) {
        console.error("Books fetch error:", err);
        res.status(500).send("Error fetching books");
    }
});

app.get('/books/add-to-cart/:id', async (req, res) => {
    const book = await Book.findById(req.params.id);

    if (!book) {
        return res.redirect('/books');
    }

    const quantity = Math.max(1, Number.parseInt(req.query.qty, 10) || 1);
    const cartItems = app.locals.cart || [];
    const existingItem = cartItems.find(item => item._id.toString() === book._id.toString());

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cartItems.push({ ...book.toObject(), quantity });
    }

    app.locals.cart = cartItems;
    res.redirect(req.query.action === 'add' ? '/books' : '/cart');
});

app.get('/cart', (req, res) => {
    const cartItems = app.locals.cart || [];
    const total = cartItems.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity || 1)), 0);

    res.render('cart', { cartItems, total });
});

app.get('/cart/remove/:id', (req, res) => {
    const cartItems = app.locals.cart || [];
    app.locals.cart = cartItems.filter(item => item._id.toString() !== req.params.id);
    res.redirect('/cart');
});

app.get('/cart/increase/:id', (req, res) => {
    const cartItems = app.locals.cart || [];
    const item = cartItems.find(book => book._id.toString() === req.params.id);

    if (!item) {
        return res.redirect('/cart');
    }

    item.quantity += 1;
    app.locals.cart = cartItems;
    res.redirect('/cart');
});

app.get('/cart/decrease/:id', (req, res) => {
    const cartItems = app.locals.cart || [];
    const item = cartItems.find(book => book._id.toString() === req.params.id);

    if (!item) {
        return res.redirect('/cart');
    }

    if (item.quantity > 1) {
        item.quantity -= 1;
    }

    app.locals.cart = cartItems;
    res.redirect('/cart');
});

app.get('/books/add', requireAdmin, (req, res) => {
    res.render('addbook', {
        error: null,
        formData: {}
    });
});

app.post('/books/add', requireAdmin, upload.single('imageFile'), async (req, res) => {
    const formData = req.body || {};
    const name = String(formData.name || formData.title || '').trim();
    const title = String(formData.title || formData.name || '').trim();
    const author = String(formData.author || '').trim();
    const category = String(formData.category || '').trim();
    const price = Number(formData.price);

    if (!name || !title || !author || !category || formData.price === '' ||
        !Number.isFinite(price) || price < 0) {
        return res.status(400).render('addbook', {
            error: 'Enter the book name, title, author, category, and a valid non-negative price.',
            formData
        });
    }

    const bookData = { name, title, author, price, category };
    if (req.file) {
        bookData.image = `uploads/${req.file.filename}`;
    } else if (typeof formData.image === 'string' && formData.image.trim()) {
        bookData.image = formData.image.trim().replace(/^\/+/, '');
    }

    try {
        await Book.create(bookData);
        res.redirect('/books');
    } catch (error) {
        console.error('Book creation error:', error);
        res.status(500).render('addbook', {
            error: 'Could not add the book. Please try again.',
            formData
        });
    }
});

app.get('/books/edit/:id', requireAdmin, async (req, res) => {
    const book = await Book.findById(req.params.id);
    if (!book) {
        return res.redirect('/books');
    }

    res.render('editbook', { book });
});

app.post('/books/edit/:id', requireAdmin, upload.single('imageFile'), async (req, res) => {
    const body = req.body || {};
    const { name, title, author, price, category, image } = body;

    if (!Object.keys(body).length) {
        return res.status(400).send('Could not read the submitted form. Please refresh the edit page and try again.');
    }

    const updatedData = {
        name: name || title,
        title: title || name,
        author,
        price: Number(price),
        category,
    };

    if (req.file) {
        updatedData.image = `uploads/${req.file.filename}`;
    } else if (image && image.trim()) {
        updatedData.image = image.trim().replace(/^\/+/, '');
    }

    try {
        await Book.findByIdAndUpdate(req.params.id, updatedData, { new: true });
        res.redirect('/books');
    } catch (error) {
        console.error('Book update error:', error);
        res.status(500).send('Error updating book');
    }
});

app.get('/category', async (req, res) => {
    const books = await Book.find();
    const allBooks = await Book.find();
    const categoriesList = [...new Set(allBooks.map(book => book.category))];
    res.render('categories', { books, category: 'All', categories: categoriesList });
});

app.get('/category/:category', async (req, res) => {
    const category = req.params.category;
    const escapedCategory = category.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const books = await Book.find({
        category: { $regex: `^${escapedCategory}$`, $options: 'i' }
    });
    const allBooks = await Book.find();
    const categoriesList = [...new Set(allBooks.map(book => book.category))];
    res.render('categories', { books, category, categories: categoriesList });
});
app.get('/contact',(req,res)=>{
    const success = req.query.success === '1';
    const error = req.query.error === '1';
    res.render('contact', { success, error });
})
app.post('/contact', async (req, res) => {
    const name = req.body.name;
    const email = req.body.email;
    const mobile = req.body.mob;
    const message = req.body.message;
    const cartItems = app.locals.cart || [];

    const cartHtml = cartItems.length
        ? cartItems.map(item => {
            const imagePath = item.image ? path.join(__dirname, 'public', item.image) : null;
            const safeName = escapeHtml(item.name || item.title || 'Book');
            const safePrice = escapeHtml(item.price || 0);
            const safeCategory = escapeHtml(item.category || 'Uncategorized');

            return `
                <div style="display: flex; align-items: center; gap: 16px; border: 1px solid #e0e0e0; border-radius: 12px; padding: 14px; margin: 12px 0; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    ${imagePath ? `<img src="cid:book-${String(item._id)}" alt="${safeName}" style="width: 90px; height: 90px; object-fit: contain; border-radius: 8px; background: #f7f7f7;" />` : ''}
                    <div>
                        <div style="font-size: 18px; font-weight: 700; color: #1f1f1f; margin-bottom: 4px;">${safeName}</div>
                        <div style="font-size: 14px; color: #555; margin-bottom: 4px;">Category: ${safeCategory}</div>
                        <div style="font-size: 15px; color: #1f1f1f; font-weight: 600;">Price: ₹${safePrice}</div>
                    </div>
                </div>
            `;
        }).join('')
        : '<p style="margin: 0; color: #666;">No books selected.</p>';

    const attachments = cartItems
        .filter(item => item.image)
        .map(item => ({
            filename: path.basename(item.image),
            path: path.join(__dirname, 'public', item.image),
            cid: `book-${String(item._id)}`
        }));

    const missingGmailConfig = [
        'GMAIL_CLIENT_ID',
        'GMAIL_CLIENT_SECRET',
        'GMAIL_REFRESH_TOKEN'
    ].filter(key => !process.env[key]);

    if (missingGmailConfig.length) {
        console.error(
            `Gmail API is not configured. Missing environment variables: ${missingGmailConfig.join(', ')}`
        );
        return res.redirect('/contact?error=1');
    }

    const mailOptions = {
        from: 'adarshgiriag2006@gmail.com',
        to: 'adarshgiriag2006@gmail.com',
        subject: 'New Customer Message',
        html: `
            <div style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 24px; color: #111;">
                <div style="max-width: 700px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e7e7e7;">
                    <div style="background: linear-gradient(135deg, #202124, #3c4043); color: #fff; padding: 20px 24px; font-size: 24px; font-weight: 700;">
                        New Customer Message
                    </div>
                    <div style="padding: 22px 24px 8px;">
                        <div style="margin-bottom: 14px;"><strong>Name:</strong> ${escapeHtml(name)}</div>
                        <div style="margin-bottom: 14px;"><strong>Email:</strong> ${escapeHtml(email)}</div>
                        <div style="margin-bottom: 14px;"><strong>Mobile:</strong> ${escapeHtml(mobile)}</div>
                        <div style="margin-bottom: 18px;"><strong>Message:</strong> ${escapeHtml(message)}</div>
                    </div>
                    <div style="padding: 0 24px 24px;">
                        <div style="font-size: 18px; font-weight: 700; margin-bottom: 10px; color: #1f1f1f;">Books in Cart</div>
                        ${cartHtml}
                    </div>
                </div>
            </div>
        `,
        attachments
    };

    try {
        const mail = new MailComposer(mailOptions);
        const rawMessage = await new Promise((resolve, reject) => {
            mail.compile().build((error, message) => {
                if (error) return reject(error);
                resolve(message);
            });
        });

        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: Buffer.from(rawMessage).toString('base64url')
            }
        });

        app.locals.cart = [];
        return res.redirect('/contact?success=1');
    } catch (error) {
        console.error(
            'Gmail API error:',
            error.response?.data || error.message
        );
        return res.redirect('/contact?error=1');
    }
});

app.post('/books/delete/:id', requireAdmin, async (req, res) => {
    try {
        await Book.findByIdAndDelete(req.params.id);
        res.redirect('/books');
    } catch (error) {
        console.error('Book delete error:', error);
        res.status(500).send('Error deleting book');
    }
});
