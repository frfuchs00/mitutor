require('dotenv').config();
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'prompts.db');
const db = new sqlite3.Database(dbPath);
const cors = require('cors');
const { OpenAI } = require('openai');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/chat', async (req, res) => {


  const { messages, prompt, tema } = req.body;

const finalPrompt = `${prompt}\nEl tema actual es: ${tema}.`;
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

app.post('/guardar-prompt', upload.single('imagen'), (req, res) => {
  const { nivel, eje, destinatario, prompt } = req.body;
  const imagen = req.file ? req.file.filename : '';

  console.log("Prompt recibido:", { nivel, eje, destinatario, prompt, imagen });

  db.run(
    "INSERT INTO prompts (nivel, eje, destinatario, prompt, imagen) VALUES (?, ?, ?, ?, ?)",
    [nivel, eje, destinatario, prompt, imagen],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al guardar el prompt' });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, 'localhost', () => console.log(`Servidor MiTutor corriendo en http://localhost:${PORT}`));