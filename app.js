require('dotenv').config(); // အပေါ်ဆုံးမှာ ထည့်သွင်းထားသည်
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const cors = require('cors');

const app = express();

// --- MIDDLEWARE ပြင်ဆင်ခြင်း ---
app.use(cors()); // Frontend ကနေ လှမ်းခေါ်တာကို ခွင့်ပြုခြင်း
app.use(express.json()); // Frontend က JSON Data ဖတ်နိုင်ရန်
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Database ချိတ်ဆက်ခြင်း
let db;
(async () => {
    db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });
    await db.exec(`CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        farmer_name TEXT,
        item_name TEXT,
        item_type TEXT,
        truck_no TEXT,
        weight REAL,
        price REAL,
        broker_fee REAL,
        truck_fee REAL,
        total_clearance REAL
    )`);
})();

app.set('view engine', 'ejs');

// Session Config (Secret ကို .env မှယူသည်)
// app.use(session({
//     secret: process.env.SESSION_SECRET || 'fallback_secret_key',
//     resave: false,
//     saveUninitialized: true
// }));

// Admin Credential များ (.env မှယူသည်)
// const ADMIN_USER = process.env.ADMIN_USER || "admin";
// const ADMIN_PASS = process.env.ADMIN_PASS || "123456"; 

// function checkAuth(req, res, next) {
//     if (req.session.loggedIn) return next();
//     res.redirect('/login');
// }

// --- API FOR FRONTEND VOUCHER ---
app.post('/post', async (req, res) => {
    try {
        const { date, items } = req.body; 

        for (const item of items) {
            if (!item.name && !item.qty) continue; 

            const weight = parseFloat(item.qty) || 0;
            const price = parseFloat(item.price) || 0;
            const broker_fee = parseFloat(item.com) || 0;
            const truck_fee = parseFloat(item.charge) || 0;
            const total_clearance = (weight * price) - broker_fee - truck_fee;

            await db.run(`INSERT INTO records 
                (date, farmer_name, item_name, item_type, truck_no, weight, price, broker_fee, truck_fee, total_clearance) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    date || new Date().toISOString().split('T')[0], 
                    item.name, item.type, item.spec, item.car, 
                    weight, price, broker_fee, truck_fee, total_clearance
                ]
            );
        }
        res.json({ success: true, message: "Voucher သိမ်းဆည်းပြီးပါပြီ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error ဖြစ်သွားပါသည်" });
    }
});

// --- AUTH ROUTES ---
// app.get('/login', (req, res) => res.render('login'));

// app.post('/login', (req, res) => {
//     const { username, password } = req.body;
//     if (username === ADMIN_USER && password === ADMIN_PASS) {
//         req.session.loggedIn = true;
//         res.redirect('/');
//     } else {
//         res.send("Username သို့မဟုတ် Password မှားယွင်းနေပါသည်။");
//     }
// });

// app.get('/logout', (req, res) => {
//     req.session.destroy();
//     res.redirect('/login');
// });

// --- MAIN DASHBOARD ---
app.get('/', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const stats = await db.get('SELECT SUM(total_clearance) as total, SUM(weight) as weight FROM records WHERE date = ?', today);
    const recentRecords = await db.all('SELECT * FROM records ORDER BY id DESC LIMIT 10');
    
    res.render('index', { 
        todayTotal: stats.total || 0, 
        todayWeight: stats.weight || 0,
        records: recentRecords 
    });
});

app.get('/add-record', (req, res) => {
    res.render('add-record');
});

app.post('/add-record', async (req, res) => {
    const d = req.body;
    const weight = parseFloat(d.weight) || 0;
    const price = parseFloat(d.price) || 0;
    const broker_fee = parseFloat(d.broker_fee) || 0;
    const truck_fee = parseFloat(d.truck_fee) || 0;
    const total_clearance = (weight * price) - broker_fee - truck_fee;

    await db.run(`INSERT INTO records 
        (date, farmer_name, item_name, item_type, truck_no, weight, price, broker_fee, truck_fee, total_clearance) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.date, d.farmer_name, d.item_name, d.item_type, d.truck_no, weight, price, broker_fee, truck_fee, total_clearance]
    );
    res.redirect('/');
});

// --- EDIT & DELETE ---
app.get('/edit-record/:id', async (req, res) => {
    const record = await db.get('SELECT * FROM records WHERE id = ?', req.params.id);
    res.render('edit', { record });
});

app.post('/update-record/:id', async (req, res) => {
    const d = req.body;
    const weight = parseFloat(d.weight) || 0;
    const price = parseFloat(d.price) || 0;
    const broker_fee = parseFloat(d.broker_fee) || 0;
    const truck_fee = parseFloat(d.truck_fee) || 0;
    const total_clearance = (weight * price) - broker_fee - truck_fee;

    await db.run(`UPDATE records SET 
        date = ?, farmer_name = ?, item_name = ?, item_type = ?, 
        truck_no = ?, weight = ?, price = ?, broker_fee = ?, 
        truck_fee = ?, total_clearance = ? WHERE id = ?`,
        [d.date, d.farmer_name, d.item_name, d.item_type, d.truck_no, weight, price, broker_fee, truck_fee, total_clearance, req.params.id]
    );
    res.redirect('/');
});

app.post('/delete-record/:id', async (req, res) => {
    await db.run('DELETE FROM records WHERE id = ?', req.params.id);
    res.redirect('/');
});

// --- REPORTS ---
app.get('/report/daily', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const dateFilter = req.query.date || today;
    const typeFilter = req.query.type || '';
    const nameFilter = req.query.itemName || ''; 

    let query = 'SELECT * FROM records WHERE date = ?';
    let params = [dateFilter];

    if (typeFilter) {
        query += ' AND item_type LIKE ?';
        params.push(`%${typeFilter}%`);
    }
    if (nameFilter) {
        query += ' AND item_name LIKE ?';
        params.push(`%${nameFilter}%`);
    }

    const records = await db.all(query, params);
    res.render('reports/daily', { records, dateFilter, typeFilter, nameFilter });
});

app.get('/report/monthly', async (req, res) => {
    const currentMonth = new Date().toISOString().slice(0, 7); 
    const monthFilter = req.query.month || currentMonth;
    const typeFilter = req.query.type || '';
    const nameFilter = req.query.itemName || ''; 

    let query = 'SELECT * FROM records WHERE date LIKE ?';
    let params = [`${monthFilter}%`];

    if (typeFilter) {
        query += ' AND item_type LIKE ?';
        params.push(`%${typeFilter}%`);
    }
    if (nameFilter) {
        query += ' AND item_name LIKE ?';
        params.push(`%${nameFilter}%`);
    }

    const records = await db.all(query, params);
    res.render('reports/monthly', { records, monthFilter, typeFilter, nameFilter });
});

app.get('/report/yearly', async (req, res) => {
    const currentYear = new Date().getFullYear().toString();
    const yearFilter = req.query.year || currentYear;
    const typeFilter = req.query.type || ''; 
    const nameFilter = req.query.itemName || ''; 

    let query = 'SELECT * FROM records WHERE date LIKE ?';
    let params = [`${yearFilter}%`];

    if (typeFilter) {
        query += ' AND item_type LIKE ?';
        params.push(`%${typeFilter}%`);
    }
    if (nameFilter) {
        query += ' AND item_name LIKE ?';
        params.push(`%${nameFilter}%`);
    }

    const records = await db.all(query, params);
    res.render('reports/yearly', { records, yearFilter, typeFilter, nameFilter }); 
});

// Port ကို environment variable မှယူသုံးရန် ပြင်ဆင်ခြင်း
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));