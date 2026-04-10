require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg'); 
const cors = require('cors');
const path = require('path');

const app = express();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- POSTGRESQL CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://pwayyone_user:yCvvO08kQEKLhFmruN517X1n20z83Hcr@dpg-d7cap3osfn5c73ccadh0-a.singapore-postgres.render.com/pwayyone',
    ssl: { rejectUnauthorized: false }
});

// Table ဆောက်ခြင်း (Startup တွင် တစ်ခါတည်းလုပ်ဆောင်သည်)
(async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS records (
            id SERIAL PRIMARY KEY,
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
    } catch (err) {
        console.error("Database table creation error:", err);
    }
})();

app.set('view engine', 'ejs');

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

            await pool.query(`INSERT INTO records 
                (date, farmer_name, item_name, item_type, truck_no, weight, price, broker_fee, truck_fee, total_clearance) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [date || new Date().toISOString().split('T')[0], item.name, item.type, item.spec, item.car, weight, price, broker_fee, truck_fee, total_clearance]
            );
        }
        res.json({ success: true, message: "သိမ်းဆည်းပြီးပါပြီ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

// --- MAIN DASHBOARD (No Login Required) ---
app.get('/', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const stats = await pool.query('SELECT SUM(total_clearance) as total, SUM(weight) as weight FROM records WHERE date = $1', [today]);
        const recent = await pool.query('SELECT * FROM records ORDER BY id DESC LIMIT 10');
        res.render('index', { 
            todayTotal: stats.rows[0].total || 0, 
            todayWeight: stats.rows[0].weight || 0,
            records: recent.rows 
        });
    } catch (err) {
        res.status(500).send("Database Error");
    }
});

app.get('/add-record', (req, res) => res.render('add-record'));

app.post('/add-record', async (req, res) => {
    const d = req.body;
    const weight = parseFloat(d.weight) || 0;
    const price = parseFloat(d.price) || 0;
    const broker_fee = parseFloat(d.broker_fee) || 0;
    const truck_fee = parseFloat(d.truck_fee) || 0;
    const total_clearance = (weight * price) - broker_fee - truck_fee;

    await pool.query(`INSERT INTO records (date, farmer_name, item_name, item_type, truck_no, weight, price, broker_fee, truck_fee, total_clearance) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [d.date, d.farmer_name, d.item_name, d.item_type, d.truck_no, weight, price, broker_fee, truck_fee, total_clearance]
    );
    res.redirect('/');
});

// --- EDIT & DELETE ---
app.get('/edit-record/:id', async (req, res) => {
    const result = await pool.query('SELECT * FROM records WHERE id = $1', [req.params.id]);
    res.render('edit', { record: result.rows[0] });
});

app.post('/update-record/:id', async (req, res) => {
    const d = req.body;
    const weight = parseFloat(d.weight) || 0;
    const price = parseFloat(d.price) || 0;
    const broker_fee = parseFloat(d.broker_fee) || 0;
    const truck_fee = parseFloat(d.truck_fee) || 0;
    const total_clearance = (weight * price) - broker_fee - truck_fee;

    await pool.query(`UPDATE records SET date=$1, farmer_name=$2, item_name=$3, item_type=$4, truck_no=$5, weight=$6, price=$7, broker_fee=$8, truck_fee=$9, total_clearance=$10 WHERE id=$11`,
        [d.date, d.farmer_name, d.item_name, d.item_type, d.truck_no, weight, price, broker_fee, truck_fee, total_clearance, req.params.id]
    );
    res.redirect('/');
});

app.post('/delete-record/:id', async (req, res) => {
    await pool.query('DELETE FROM records WHERE id = $1', [req.params.id]);
    res.redirect('/');
});

// --- REPORTS (Daily, Monthly, Yearly) ---
app.get('/report/daily', async (req, res) => {
    const dateFilter = req.query.date || new Date().toISOString().split('T')[0];
    const typeFilter = req.query.type || '';
    const nameFilter = req.query.itemName || '';
    const result = await pool.query(`SELECT * FROM records WHERE date = $1 AND item_type LIKE $2 AND item_name LIKE $3`, [dateFilter, `%${typeFilter}%`, `%${nameFilter}%`]);
    res.render('reports/daily', { records: result.rows, dateFilter, typeFilter, nameFilter });
});

app.get('/report/monthly', async (req, res) => {
    const monthFilter = req.query.month || new Date().toISOString().slice(0, 7);
    const typeFilter = req.query.type || '';
    const nameFilter = req.query.itemName || '';
    const result = await pool.query(`SELECT * FROM records WHERE date LIKE $1 AND item_type LIKE $2 AND item_name LIKE $3`, [`${monthFilter}%`, `%${typeFilter}%`, `%${nameFilter}%`]);
    res.render('reports/monthly', { records: result.rows, monthFilter, typeFilter, nameFilter });
});

app.get('/report/yearly', async (req, res) => {
    const yearFilter = req.query.year || new Date().getFullYear().toString();
    const typeFilter = req.query.type || '';
    const nameFilter = req.query.itemName || '';
    const result = await pool.query(`SELECT * FROM records WHERE date LIKE $1 AND item_type LIKE $2 AND item_name LIKE $3`, [`${yearFilter}%`, `%${typeFilter}%`, `%${nameFilter}%`]);
    res.render('reports/yearly', { records: result.rows, yearFilter, typeFilter, nameFilter });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));