require('dotenv').config();
const mammoth = require('mammoth');
const express = require('express');
const app = express();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const textract = require('textract');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, project: process.env.OPENAI_PROJECT_ID });
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID;
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

      db.all(
        'SELECT filename, originalname FROM cuadernillos WHERE prompt_id = ?',
        [prompt.id],
        (err2, rows) => {
          let cuadernillos = [];
          if (rows && rows.length) {
            cuadernillos = rows.map(r => {
              const fullPath = path.join(__dirname, 'uploads', r.filename);
              if (fs.existsSync(fullPath)) {
                return {
                  nombre: r.originalname,
                  url: `/uploads/${r.filename}`,
                  filename: r.filename
                };
              }
              return null;
            }).filter(Boolean);
          }

          let imagenUrl = null;
          if (prompt.imagen) {
            const imagePath = path.join(__dirname, 'uploads', prompt.imagen);
            if (fs.existsSync(imagePath)) {
              imagenUrl = `/uploads/${prompt.imagen}`;
            }
          }

          res.json({
            prompt: prompt.prompt,
            imagen: imagenUrl,
            cuadernillos
          });
          db.close();
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

  async function subirArchivoAProject(filepath, filename) {
    try {
      const file = await openai.files.create({
        file: fs.createReadStream(filepath),
        purpose: 'assistants'
      });

      await openai.beta.projects.files.create(
        OPENAI_PROJECT_ID,
        { file_id: file.id }
      );

      console.log(`Archivo subido a Project: ${filename} → ${file.id}`);
      return file.id;
    } catch (error) {
      console.error(`Error al subir archivo ${filename} a OpenAI:`, error.message);
      return null;
    }
  }

  db.run(
    "INSERT INTO prompts (nivel, eje, destinatario, prompt, imagen) VALUES (?, ?, ?, ?, ?)",
    [nivel, eje, destinatario, prompt, imagenFile],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al guardar el prompt' });
      }

      const promptId = this.lastID;

      const insertCuadernillo = db.prepare("INSERT INTO cuadernillos (prompt_id, filename, originalname, content) VALUES (?, ?, ?, ?)");

      const promises = cuadernillos.map(file => {
        return new Promise((resolve) => {
          const ext = path.extname(file.originalname).toLowerCase();
          const filepath = file.path;

          const guardarCuadernillo = (content) => {
            // Subir archivo a OpenAI Project antes de guardar en base de datos
            subirArchivoAProject(filepath, file.originalname).then(() => {
              insertCuadernillo.run(promptId, file.filename, file.originalname, content || '', () => resolve());
            });
          };

          if (ext === '.txt') {
            try {
              const content = fs.readFileSync(filepath, 'utf8');
              guardarCuadernillo(content);
            } catch (err) {
              console.error(`Error al leer TXT ${file.originalname}:`, err.message);
              guardarCuadernillo('');
            }
          } else if (ext === '.pdf') {
            try {
              const dataBuffer = fs.readFileSync(filepath);
              pdfParse(dataBuffer).then(data => {
                guardarCuadernillo(data.text);
              }).catch(err => {
                console.error(`Error al procesar PDF ${file.originalname}:`, err.message);
                guardarCuadernillo('');
              });
            } catch (err) {
              console.error(`Error al leer PDF ${file.originalname}:`, err.message);
              guardarCuadernillo('');
            }
          } else if (ext === '.docx') {
            mammoth.extractRawText({ path: filepath })
              .then(result => {
                guardarCuadernillo(result.value);
              })
              .catch(err => {
                console.error(`Error al procesar DOCX ${file.originalname}:`, err.message);
                guardarCuadernillo('');
              });
          } else if (ext === '.doc') {
            console.warn(`Archivo .doc no soportado: ${file.originalname}`);
            guardarCuadernillo('');
          } else {
            console.warn(`Tipo de archivo no soportado: ${ext}`);
            guardarCuadernillo('');
          }
        });
      });

      Promise.all(promises).then(() => {
        insertCuadernillo.finalize();
        res.json({ success: true });
      });
    }
  );
  // === Copia de seguridad de APKs instalados en la TV ===
  // Antes de eliminar aplicaciones, es recomendable copiar los APKs actuales
  // para poder restaurarlos si fuera necesario. Crear un archivo `backup_apks.bat` con el siguiente contenido:
  /*
  @echo off
  adb shell pm list packages -f > paquetes.txt
  for /f "tokens=2 delims==:" %%i in ('findstr /R "package:" paquetes.txt') do (
      adb pull %%i backups_apk\
  )
  echo Copia finalizada. Los APKs estan en la carpeta backups_apk
  pause
  */
  // Ejecutar este script en la terminal de Windows desde la carpeta donde se encuentra ADB.
  // Ejemplo para batch automático:
  // (archivo limpiar.bat)
  // ...
});

app.get('/cuadernillos/:prompt_id', (req, res) => {
  const promptId = parseInt(req.params.prompt_id, 10);
  if (!promptId) return res.status(400).json({ error: 'ID inválido' });

  const db = new sqlite3.Database(path.join(__dirname, 'prompts.db'));
  db.all(
    'SELECT content FROM cuadernillos WHERE prompt_id = ?',
    [promptId],
    (err, rows) => {
      if (err) {
        console.error('Error al leer cuadernillos:', err);
        return res.status(500).json({ error: 'Error al leer cuadernillos' });
      }
      const contenidos = rows.map(r => r.content).filter(Boolean);
      res.json({ contenidos });
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor MiTutor corriendo en http://localhost:${PORT}`);
});