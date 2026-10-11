const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'people.db');
const uploadsDir = path.join(__dirname, 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/\s+/g, '-');
    const uniqueName = `${Date.now()}-${safeName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
    process.exit(1);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      birth_date TEXT,
      profession TEXT,
      education TEXT,
      country TEXT,
      city TEXT,
      bio TEXT,
      photo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (createErr) => {
    if (createErr) {
      console.error('Database creation error:', createErr.message);
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });
});

app.get('/', (req, res) => {
  db.all('SELECT * FROM people ORDER BY created_at DESC', (err, people) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Database error');
    }

    res.render('index', {
      people,
      success: req.query.success === '1'
    });
  });
});

app.post('/people', upload.single('photo'), (req, res) => {
  const {
    name,
    birth_date,
    profession,
    education,
    country,
    city,
    bio
  } = req.body;

  const photo = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !name.trim()) {
    return res.status(400).send('Name is required.');
  }

  db.run(
    `INSERT INTO people (name, birth_date, profession, education, country, city, bio, photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      birth_date || null,
      profession || null,
      education || null,
      country || null,
      city || null,
      bio || null,
      photo
    ],
    function (err) {
      if (err) {
        console.error('Insert error:', err.message);
        return res.status(500).send('Could not save person information.');
      }

      res.redirect('/?success=1');
    }
  );
});

app.use((req, res) => {
  res.status(404).send('Page not found');
});

module.exports = app;
