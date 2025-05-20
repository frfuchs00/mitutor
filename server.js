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
  db.get(
    "SELECT * FROM prompts WHERE nivel = ? AND eje = ? AND destinatario = ? ORDER BY id DESC LIMIT 1",
    [nivel, eje, destinatario],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al buscar el prompt' });
      }
      if (!row) return res.status(404).json({ error: 'Prompt no encontrado' });

      db.all(
        "SELECT filename FROM cuadernillos WHERE prompt_id = ?",
        [row.id],
        (err2, cuadernillos) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: 'Error al buscar cuadernillos' });
          }

          const cuadernilloLinks = cuadernillos.map(c => ({
            nombre: c.filename,
            url: `/uploads/${c.filename}`
          }));

          res.json({
            ...row,
            imagen: row.imagen ? `/uploads/${row.imagen}` : null,
            cuadernillos: cuadernilloLinks
          });
        }
      );
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor MiTutor corriendo en http://localhost:${PORT}`);
});