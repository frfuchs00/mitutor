const express = require('express');
const app = express();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
// const db = new sqlite3.Database(path.join(__dirname, 'prompts.db'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/prompt', (req, res) => {
  const { nivel, eje, destinatario } = req.query;

  if (!nivel || !eje || !destinatario) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  const nivelNorm = nivel.trim().toUpperCase();
  const ejeNorm = eje.trim().toUpperCase();
  const destinatarioNorm = destinatario.trim().toUpperCase();
  console.log('GET /prompt =>', nivelNorm, ejeNorm, destinatarioNorm);
  console.log(`Consulta SQL: SELECT * FROM prompts WHERE UPPER(TRIM(nivel)) = ? AND UPPER(TRIM(eje)) = ? AND UPPER(TRIM(destinatario)) = ?`);
  console.log('Parámetros normalizados:', [nivelNorm, ejeNorm, destinatarioNorm]);

  const db = new sqlite3.Database(path.join(__dirname, 'prompts.db'));
  db.get(
    'SELECT * FROM prompts WHERE UPPER(TRIM(nivel)) = ? AND UPPER(TRIM(eje)) = ? AND UPPER(TRIM(destinatario)) = ?',
    [nivelNorm, ejeNorm, destinatarioNorm],
    (err, prompt) => {
      if (err) {
        console.error('Error al recuperar prompt:', err);
        return res.status(500).json({ error: 'Error en la base de datos' });
      }

      if (!prompt) {
        return res.status(404).json({ error: 'Prompt no encontrado' });
      }

      const cuadernillos = [];
      db.all(
        'SELECT filename FROM cuadernillos WHERE prompt_id = ?',
        [prompt.id],
        (err2, rows) => {
          if (!err2 && rows) {
            for (const r of rows) {
              cuadernillos.push('/uploads/' + r.filename);
            }
          }

          res.json({
            prompt: prompt.prompt,
            imagen: prompt.imagen ? `/uploads/${prompt.imagen}` : null,
            cuadernillos
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
  const db = new sqlite3.Database(path.join(__dirname, 'prompts.db'));
  const { nivel, eje, destinatario, prompt } = req.body;
  const imagenFile = req.files['imagen'] ? req.files['imagen'][0].filename : null;
  if (req.files['imagen']) {
    console.log("Imagen subida:");
    console.log("  Nombre original:", req.files['imagen'][0].originalname);
    console.log("  Ruta almacenada:", req.files['imagen'][0].path);
  }
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