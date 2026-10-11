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
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '-');
    const uniqueName = `${Date.now()}-${safe}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('DB connection failed:', err.message);
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
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (createErr) => {
    if (createErr) {
      console.error('Table creation failed:', createErr.message);
      process.exit(1);
    }

    console.log('Database ready');
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });
});

function buildPeopleQuery(req) {
  const q = (req.query.q || '').trim();
  const country = (req.query.country || '').trim();
  const profession = (req.query.profession || '').trim();

  let sql = `SELECT * FROM people WHERE 1=1`;
  const params = [];

  if (q) {
    sql += ` AND (
      name LIKE ? OR
      profession LIKE ? OR
      education LIKE ? OR
      country LIKE ? OR
      city LIKE ? OR
      bio LIKE ?
    )`;
    const term = `%${q}%`;
    params.push(term, term, term, term, term, term);
  }

  if (country) {
    sql += ` AND country = ?`;
    params.push(country);
  }

  if (profession) {
    sql += ` AND profession = ?`;
    params.push(profession);
  }

  sql += ` ORDER BY created_at DESC`;
  return { sql, params };
}

function getFilterOptions(callback) {
  db.all(`
    SELECT DISTINCT country FROM people
    WHERE country IS NOT NULL AND TRIM(country) != ''
    ORDER BY country ASC
  `, (errCountries, countries) => {
    if (errCountries) return callback(errCountries);

    db.all(`
      SELECT DISTINCT profession FROM people
      WHERE profession IS NOT NULL AND TRIM(profession) != ''
      ORDER BY profession ASC
    `, (errProfessions, professions) => {
      if (errProfessions) return callback(errProfessions);

      callback(null, countries, professions);
    });
  });
}

function getStats(callback) {
  db.get(`SELECT COUNT(*) AS total FROM people`, (errTotal, totalRow) => {
    if (errTotal) return callback(errTotal);

    db.get(`
      SELECT COUNT(DISTINCT country) AS countryCount
      FROM people
      WHERE country IS NOT NULL AND TRIM(country) != ''
    `, (errCountry, countryRow) => {
      if (errCountry) return callback(errCountry);

      db.get(`
        SELECT COUNT(DISTINCT profession) AS professionCount
        FROM people
        WHERE profession IS NOT NULL AND TRIM(profession) != ''
      `, (errProfession, professionRow) => {
        if (errProfession) return callback(errProfession);

        db.get(`
          SELECT COUNT(*) AS recentCount
          FROM people
          WHERE created_at >= datetime('now', '-7 days')
        `, (errRecent, recentRow) => {
          if (errRecent) return callback(errRecent);

          callback(null, {
            total: totalRow.total,
            countries: countryRow.countryCount,
            professions: professionRow.professionCount,
            recent: recentRow.recentCount
          });
        });
      });
    });
  });
}

app.get('/', (req, res) => {
  const { sql, params } = buildPeopleQuery(req);

  db.all(sql, params, (err, people) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Database query failed');
    }

    getFilterOptions((filterErr, countries, professions) => {
      if (filterErr) {
        console.error(filterErr.message);
        return res.status(500).send('Could not load filters');
      }

      getStats((statsErr, stats) => {
        if (statsErr) {
          console.error(statsErr.message);
          return res.status(500).send('Could not load stats');
        }

        res.render('index', {
          people,
          countries,
          professions,
          stats,
          query: (req.query.q || '').trim(),
          selectedCountry: (req.query.country || '').trim(),
          selectedProfession: (req.query.profession || '').trim(),
          success: req.query.success === '1',
          deleted: req.query.deleted === '1',
          updated: req.query.updated === '1'
        });
      });
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
    bio,
    status
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).send('Name is required.');
  }

  const photo = req.file ? `/uploads/${req.file.filename}` : null;

  db.run(
    `
      INSERT INTO people (
        name, birth_date, profession, education, country, city, bio, photo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      name.trim(),
      birth_date || null,
      profession || null,
      education || null,
      country || null,
      city || null,
      bio || null,
      photo,
      status || 'Active'
    ],
    function (err) {
      if (err) {
        console.error('Insert failed:', err.message);
        return res.status(500).send('Could not save person.');
      }

      res.redirect('/?success=1');
    }
  );
});

app.get('/people/:id/edit', (req, res) => {
  const id = req.params.id;

  db.get(`SELECT * FROM people WHERE id = ?`, [id], (err, person) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Database error');
    }

    if (!person) {
      return res.status(404).send('Person not found');
    }

    res.render('edit', { person });
  });
});

app.post('/people/:id/update', upload.single('photo'), (req, res) => {
  const id = req.params.id;
  const {
    name,
    birth_date,
    profession,
    education,
    country,
    city,
    bio,
    status,
    existing_photo
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).send('Name is required.');
  }

  db.get(`SELECT * FROM people WHERE id = ?`, [id], (err, person) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Database error');
    }

    if (!person) {
      return res.status(404).send('Person not found');
    }

    const newPhoto = req.file
      ? `/uploads/${req.file.filename}`
      : (existing_photo || person.photo);

    if (req.file && person.photo) {
      const oldPath = path.join(__dirname, person.photo.replace(/^\\//, ''));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    db.run(
      `
        UPDATE people
        SET
          name = ?,
          birth_date = ?,
          profession = ?,
          education = ?,
          country = ?,
          city = ?,
          bio = ?,
          photo = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        name.trim(),
        birth_date || null,
        profession || null,
        education || null,
        country || null,
        city || null,
        bio || null,
        newPhoto,
        status || 'Active',
        id
      ],
      (updateErr) => {
        if (updateErr) {
          console.error('Update failed:', updateErr.message);
          return res.status(500).send('Could not update person.');
        }

        res.redirect('/?updated=1');
      }
    );
  });
});

app.post('/people/:id/delete', (req, res) => {
  const id = req.params.id;

  db.get(`SELECT photo FROM people WHERE id = ?`, [id], (err, person) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Database error');
    }

    if (person && person.photo) {
      const filePath = path.join(__dirname, person.photo.replace(/^\\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    db.run(`DELETE FROM people WHERE id = ?`, [id], (deleteErr) => {
      if (deleteErr) {
        console.error('Delete failed:', deleteErr.message);
        return res.status(500).send('Could not delete person.');
      }

      res.redirect('/?deleted=1');
    });
  });
});

app.use((req, res) => {
  res.status(404).send('Page not found');
});

module.exports = app;