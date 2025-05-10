const bcrypt = require('bcrypt')
const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const jsonwebtoken = require('jsonwebtoken')
const sqlite3 = require('sqlite3')
const multer = require('multer');

const upload = multer();
const app = express()
const port = 3001

app.use(cors())
app.use(bodyParser.json())

const db = new sqlite3.Database('./db.db', (err) => {
  if (err) {
      return console.log(err);
  }
  return console.log('бд подключена');
})

function formatTodayMonthWithDay() {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const today = new Date();
  const monthName = months[today.getMonth()];
  const day = today.getDate();
  return `${day} ${monthName}`;
}

function checkToken(token, res) {
  let id = 0;
  if (!token) {
      return res.status(500).json({message: 'Токен не предоставлен'})
  }

  jsonwebtoken.verify(token, 'secret', (err, row) => {
      if (err) {
          return res.status(500).json({message: 'Не получилось верифицировать'})
      }
      id = row.userId
  })
  return id
}

app.post('/refresh', async (req, res) => {
  const id = checkToken(req.headers.authorization?.split(' ')[1], res)
  if (id) {
    db.get(`select * from user where id = ?`, [id], (err, row) => {
      if (err || !row) {
          return res.status(500).json({message: err})
      }
      return res.status(200).send({token: jsonwebtoken.sign({userId: row.id, name: row.username, isAdmin: row.isAdmin}, 'secret', {expiresIn: '1h'})})
    })
  } else {
    return res.status(500).send('Ошибка обновления токена')
  }
})

app.post('/register', async (req, res) => {
  const {username, password, email} = req.body

  if (!username || !password) {
      return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
  }

  db.get(`select * from user where username = ?`, [username], (err, row) => {
      if (err) {
          return res.status(500).json({message: err})
      }
      if (row) {
          return res.status(500).json({message: 'Такой пользователь уже существует'})
      }
      const hash = bcrypt.hashSync(password, 10)
      db.run('insert into user (username, password, isAdmin, email) values (?, ?, ?, ?)', [username, hash, 0, email], function(err) {
          if (err) {
              return res.status(500).json({message: 'Не получилось создать пользователя'})
          }
          return res.status(200).json({message: 'Получилось создать пользователя!'})
      })
  })
})

app.post('/auth', async (req, res) => {
  const {email, password} = req.body

  db.get(`select * from user where email = ?`, [email], (err, row) => {
      if (!row) {
        return res.status(500).json({message: 'Такого пользователя не существует'})
      }
      const unHah = bcrypt.compareSync(password, row.password)
      if (err || !unHah) {
          return res.status(500).json({message: err})
      }
      const token = jsonwebtoken.sign({userId: row.id, name: row.username, isAdmin: row.isAdmin}, 'secret', {expiresIn: '1h'});
      res.status(200).json({
        id: row.id,
        token,
        isAdmin: row.isAdmin,
        username: row.username,
        email: row.email,
      })
  })
})

app.post('/request', async (req, res) => {
  const {username, eventsName, count, email, date} = req.body
  const id = checkToken(req.headers.authorization?.split(' ')[1], res)

  if (!id) return res.status(500).json({message: 'Неправильный токен'})
  const dateToInsert = date ?? formatTodayMonthWithDay();
  db.run('insert into requests (username, eventsName, count, email, date) values (?, ?, ?, ?, ?)', [username, eventsName, count, email, dateToInsert], function(err) {
    if (err) {
        return res.status(500).json({message: 'Не получилось создать заявку'})
    }
    return res.status(200).json({message: 'Получилось создать заявку!'})
  })
})

app.post('/add-publish', async (req, res) => {
  const {date, type, name, description} = req.body
  const id = checkToken(req.headers.authorization?.split(' ')[1], res)

  if (!id) return res.status(500).json({message: 'Неправильный токен'})
  db.run('insert into events (date, type, name, description, price) values (?, ?, ?, ?, ?)', [date, type, name, description, 1000], function(err) {
    if (err) {
        return res.status(500).json({message: 'Не получилось создать событие'})
    }
    return res.status(200).json({message: 'Получилось создать событие!'})
  })
})

app.post('/change-publish', async (req, res) => {
  const { id, date, type, name, description } = req.body;
  const userId = checkToken(req.headers.authorization?.split(' ')[1], res);

  if (!userId) return res.status(500).json({ message: 'Неправильный токен' });
  if (!id) return res.status(400).json({ message: 'Не передан id события' });

  db.run(
    'UPDATE events SET date = ?, type = ?, name = ?, description = ? WHERE id = ?',
    [date, type, name, description, id],
    function (err) {
      if (err) {
        return res.status(500).json({ message: 'Не удалось изменить событие' });
      }
      return res.status(200).json({ message: 'Событие изменено!' });
    }
  );
});


app.post('/delete-publish', async (req, res) => {
  const { id } = req.body;
  const userId = checkToken(req.headers.authorization?.split(' ')[1], res);

  if (!userId) return res.status(500).json({ message: 'Неправильный токен' });
  if (!id) return res.status(400).json({ message: 'Не передан id события' });

  db.run(
    'DELETE FROM events WHERE id = ?',
    [id],
    function (err) {
      if (err) {
        return res.status(500).json({ message: 'Не удалось удалить событие' });
      }
      return res.status(200).json({ message: 'Событие удалено!' });
    }
  );
});

app.post('/requests', async (req, res) => {
  const id = checkToken(req.headers.authorization?.split(' ')[1], res)
  if (id === 1) {
    db.all(`select * from requests`, (err, row) => {
      if (err) {
          return res.status(500).json({message: err})
        }
      return res.status(200).json(row)
    })
  } else {
    db.get(`select * from user where id = ?`, [id], (err, row) => {
      if (err) {
          return res.status(500).json({message: err})
      }
      db.all(`select * from requests where username = ?`, [row.username], (err, row) => {
        if (err) {
            return res.status(500).json({message: err})
          }
        return res.status(200).json(row)
      })
    })
  }
})

app.post('/me', async (req, res) => {
  const id = checkToken(req.headers.authorization?.split(' ')[1], res)

  db.get(`select * from user where id = ?`, [id], (err, row) => {
      if (err) {
          return res.status(500).json({message: err})
      }
      const token = jsonwebtoken.sign({userId: row.id, name: row.username, isAdmin: row.isAdmin}, 'secret', {expiresIn: '1h'});
      res.status(200).json({
        id: row.id,
        token,
        isAdmin: row.isAdmin,
        username: row.username,
        email: row.email,
      })
  })
})

function buildEventsQuery(type, search, table) {
  let sql = `SELECT * FROM ${table}`;
  let params = [];
  let where = [];

  if (type && type !== 'Все') {
    where.push('type = ?');
    params.push(type);
  }
  if (search && search.trim() !== '') {
    where.push('(description LIKE ? OR name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (where.length > 0) {
    sql += ' WHERE ' + where.join(' AND ');
  }
  return { sql, params };
}

app.post('/excursions', async (req, res) => {
  const { type, search } = req.body;

  const { sql, params } = buildEventsQuery(type, search, 'excursions');

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }
    res.status(200).json({ data: rows });
  });
});

function parseDateRange(dateStr, year = (new Date()).getFullYear()) {
  const months = {
    'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
    'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11
  };
  dateStr = dateStr.trim();

  let match = dateStr.match(/^(\d+)\s*[–-]\s*(\d+)\s+([а-яё]+)$/i);
  if (match) {
    const startDay = parseInt(match[1], 10);
    const endDay = parseInt(match[2], 10);
    const month = months[match[3].toLowerCase()];
    return {
      start: new Date(year, month, startDay),
      end: new Date(year, month, endDay)
    };
  }

  match = dateStr.match(/^(\d+)\s+([а-яё]+)\s*[–-]\s*(\d+)\s+([а-яё]+)$/i);
  if (match) {
    const startDay = parseInt(match[1], 10);
    const startMonth = months[match[2].toLowerCase()];
    const endDay = parseInt(match[3], 10);
    const endMonth = months[match[4].toLowerCase()];
    return {
      start: new Date(year, startMonth, startDay),
      end: new Date(year, endMonth, endDay)
    };
  }

  match = dateStr.match(/^(\d+)\s+([а-яё]+)$/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = months[match[2].toLowerCase()];
    const d = new Date(year, month, day);
    return { start: d, end: d };
  }

  return { start: null, end: null };
}

app.post('/events', async (req, res) => {
  const { type, search } = req.body;
  const { sql, params } = buildEventsQuery(type, search, 'events');

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    const futureRows = rows.filter(event => {
      const { start, end } = parseDateRange(event.date);
      return end && end >= today;
    });

    futureRows.sort((a, b) => {
      const { start: aStart } = parseDateRange(a.date);
      const { start: bStart } = parseDateRange(b.date);
      return aStart - bStart;
    });

    res.status(200).json({ data: futureRows });
  });
});

app.post('/events-archive', async (req, res) => {
  const { type, search } = req.body;
  const { sql, params } = buildEventsQuery(type, search, 'events');

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    const archiveRows = rows.filter(event => {
      const { end } = parseDateRange(event.date);
      return end && end < today;
    });

    archiveRows.sort((a, b) => {
      const { start: aStart } = parseDateRange(a.date);
      const { start: bStart } = parseDateRange(b.date);
      return bStart - aStart;
    });

    res.status(200).json({ data: archiveRows });
  });
});

app.get('/news', async (req, res) => {
  db.all(`select * from news`, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: err });
    }
    const data = rows.map(row => {
      let imageBase64 = null;
      if (row.image) {
        imageBase64 = Buffer.from(row.image).toString('base64');
      }
      return {
        ...row,
        image: imageBase64
      }
    });
    res.status(200).json({ data });
  });
});

app.post('/add-news', upload.single('image'), async (req, res) => {
  const { title, text, description } = req.body;
  const image = req.file;

  const id = checkToken(req.headers.authorization?.split(' ')[1], res);

  if (!id) return res.status(500).json({ message: 'Неправильный токен' });

  db.run(
    'insert into news (title, text, description, image) values (?, ?, ?, ?)',
    [title, text, description, image ? image.buffer : null],
    function (err) {
      if (err) {
        return res.status(500).json({ message: 'Не получилось создать новость' });
      }
      return res.status(200).json({ message: 'Получилось создать новость!' });
    }
  );
});

app.post('/change-news', upload.single('image'), async (req, res) => {
  const { id, title, text, description } = req.body;
  const image = req.file;

  const userId = checkToken(req.headers.authorization?.split(' ')[1], res);
  if (!userId) return res.status(401).json({ message: 'Неправильный токен' });

  if (!id) return res.status(400).json({ message: 'Не передан id новости' });

  let sql = '';
  let params = [];

  if (image) {
    sql = 'UPDATE news SET title=?, text=?, description=?, image=? WHERE id=?';
    params = [title, text, description, image.buffer, Number(id)];
  } else {
    sql = 'UPDATE news SET title=?, text=?, description=? WHERE id=?';
    params = [title, text, description, Number(id)];
  }

  db.run(sql, params, function (err) {
    if (err) {
      return res.status(500).json({ message: 'Не удалось изменить новость' });
    }
    return res.status(200).json({ message: 'Новость изменена!' });
  });
});

app.post('/delete-news', async (req, res) => {
  const { id } = req.body;

  const userId = checkToken(req.headers.authorization?.split(' ')[1], res);
  if (!userId) return res.status(401).json({ message: 'Неправильный токен' });

  if (!id) return res.status(400).json({ message: 'Не передан id новости' });

  db.run('DELETE FROM news WHERE id=?', [Number(id)], function (err) {
    if (err) {
      return res.status(500).json({ message: 'Не удалось удалить новость' });
    }
    return res.status(200).json({ message: 'Новость удалена!' });
  });
});

app.post('/send-review', async (req, res) => {
  const {typeOrganization, region, sex, age, overview, review} = req.body
  db.run('insert into review (typeOrganization, region, sex, age, overview, review) values (?, ?, ?, ?, ?, ?)', [typeOrganization, region, sex, age, overview, review], function(err) {
    if (err) {
        return res.status(500).json({message: 'Не получилось отправить отзыв'})
    }
    return res.status(200).json({message: 'Получилось отправить отзыв!'})
  })
})

app.post('/reviews', async (req, res) => {
  const id = checkToken(req.headers.authorization?.split(' ')[1], res)

  if (!id) return res.status(500).json({message: 'Неправильный токен'})
  db.all(`select * from review`, (err, row) => {
    if (!row || err) {
      return res.status(500).json({message: 'Не получилось запросить отзывы'})
    }
    res.status(200).json(row)
  })
})

app.listen(port, () => console.log(`http://localhost:${port}`))