const express = require('express');
const app = express();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const db = new sqlite3.Database(path.join(__dirname, 'prompts.db'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/prompt', (req, res) => {
  const { nivel, eje, destinatario } = req.query;
  console.log('GET /prompt', req.query);

  db.get(
    'SELECT * FROM prompts WHERE UPPER(nivel) = UPPER(?) AND UPPER(eje) = UPPER(?) AND UPPER(destinatario) = UPPER(?)',
    [nivel, eje, destinatario],
    (err, prompt) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error en la base de datos' });
      }

      if (!prompt) {
        return res.status(404).json({ error: 'Prompt no encontrado' });
      }

      db.all(
        'SELECT filename FROM cuadernillos WHERE prompt_id = ?',
        [prompt.id],
        (cuadErr, cuadernillos) => {
          if (cuadErr) {
            console.error(cuadErr);
            return res.status(500).json({ error: 'Error al obtener cuadernillos' });
          }

          res.json({
            prompt: prompt.prompt,
            imagen: prompt.imagen ? `/uploads/${prompt.imagen}` : null,
            cuadernillos: cuadernillos.map(c => `/uploads/${c.filename}`)
          });
        }
      );
    }
  );
});

const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.post('/guardar-prompt', upload.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'cuadernillos' }
]), (req, res) => {
  const { nivel, eje, destinatario, prompt } = req.body;
  const imagenFile = req.files['imagen'] ? req.files['imagen'][0].filename : null;
  const cuadernillos = req.files['cuadernillos'] || [];

  db.run(
    "INSERT INTO prompts (nivel, eje, destinatario, prompt, imagen) VALUES (?, ?, ?, ?, ?)",
    [nivel, eje, destinatario, prompt, imagenFile],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al guardar el prompt' });
      }

      const promptId = this.lastID;

      const insertCuadernillo = db.prepare("INSERT INTO cuadernillos (prompt_id, filename, content) VALUES (?, ?, ?)");

      cuadernillos.forEach(file => {
        const ext = path.extname(file.originalname).toLowerCase();
        let content = '';

        try {
          content = fs.readFileSync(file.path, 'utf8');
        } catch (readErr) {
          console.error(`Error al leer ${file.originalname}:`, readErr.message);
        }

        insertCuadernillo.run(promptId, file.filename, content);
      });

      insertCuadernillo.finalize();

      res.json({ success: true });
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor MiTutor corriendo en http://localhost:${PORT}`);
});