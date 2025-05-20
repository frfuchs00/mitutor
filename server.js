require('dotenv').config();
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'prompts.db');
const db = new sqlite3.Database(dbPath);
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static('public'));

const multer = require('multer');
const uploadPath = path.join(__dirname, 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/chat', async (req, res) => {


  const { messages, prompt, tema } = req.body;

  let cuadernilloTexto = '';

  try {
    const row = await new Promise((resolve, reject) => {
      db.get("SELECT id FROM prompts WHERE prompt = ? ORDER BY id DESC LIMIT 1", [prompt], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (row) {
      const rows = await new Promise((resolve, reject) => {
        db.all("SELECT content FROM cuadernillos WHERE prompt_id = ?", [row.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      cuadernilloTexto = rows.map(r => r.content).join('\n');
    }
  } catch (e) {
    console.error('Error leyendo cuadernillos', e);
  }

  const finalPrompt = `${prompt}\nEl tema actual es: ${tema}.\nContenidos relevantes:\n${cuadernilloTexto}`;
  const cleanMessages = messages.filter(msg => msg.content && typeof msg.content === 'string' && msg.content.trim() !== '');

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: finalPrompt },
        ...cleanMessages
      ]
    });

    res.json({ reply: chatCompletion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al comunicarse con OpenAI');
  }
});

db.run(`CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nivel TEXT,
  eje TEXT,
  destinatario TEXT,
  prompt TEXT,
  imagen TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS cuadernillos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER,
  filename TEXT,
  content TEXT,
  FOREIGN KEY(prompt_id) REFERENCES prompts(id)
)`);

// Ruta de test para validar SQLite
app.get('/test-db', (req, res) => {
  db.serialize(() => {
    db.run("INSERT INTO prompts (nivel, eje, destinatario, prompt, imagen) VALUES (?, ?, ?, ?, ?)",
      ['TestNivel', 'TestEje', 'TestDest', 'Este es un prompt de prueba', '']);
    db.all("SELECT * FROM prompts WHERE nivel = ?", ['TestNivel'], (err, rows) => {
      if (err) return res.status(500).send('Error al leer la base');
      res.json(rows);
    });
  });
});


app.post('/guardar-prompt', upload.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'cuadernillos', maxCount: 10 }
]), (req, res) => {
  const { nivel, eje, destinatario, prompt } = req.body;
  const imagen = req.files?.imagen?.[0]?.filename || '';

  db.run(
    "INSERT INTO prompts (nivel, eje, destinatario, prompt, imagen) VALUES (?, ?, ?, ?, ?)",
    [nivel, eje, destinatario, prompt, imagen],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al guardar el prompt' });
      }
      const promptId = this.lastID;
      const cuadernillos = req.files?.cuadernillos || [];

      cuadernillos.forEach(file => {
        const filePath = path.join(uploadPath, file.filename);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        db.run(
          "INSERT INTO cuadernillos (prompt_id, filename, content) VALUES (?, ?, ?)",
          [promptId, file.filename, fileContent]
        );
      });

      res.json({ success: true, id: promptId });
    }
  );
});

app.get('/prompt', (req, res) => {
  const { nivel, eje, destinatario } = req.query;
  db.get(
    "SELECT * FROM prompts WHERE nivel = ? AND eje = ? AND destinatario = ? ORDER BY id DESC LIMIT 1",
    [nivel, eje, destinatario],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al buscar el prompt' });
      }
      if (!row) return res.status(404).json({ error: 'Prompt no encontrado' });
      res.json({
        ...row,
        imagen: row.imagen ? `/uploads/${row.imagen}` : null
      });
    }
  );
});

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, 'localhost', () => console.log(`Servidor MiTutor corriendo en http://localhost:${PORT}`));
// Nueva ruta para obtener cuadernillos asociados a un prompt
app.get('/cuadernillos', (req, res) => {
  const { prompt_id } = req.query;
  db.all(
    "SELECT filename FROM cuadernillos WHERE prompt_id = ?",
    [prompt_id],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al buscar cuadernillos' });
      }
      res.json(rows);
    }
  );
});