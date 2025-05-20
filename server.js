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

          const cuadernilloLinks = cuadernillos.map(c => `/uploads/${c.filename}`);

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