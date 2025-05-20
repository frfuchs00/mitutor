<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mi Tutor Chatbot</title>
<style>
  #confirmacionPrompt {
    display: none;
    margin-top: 10px;
    padding: 10px;
    border: 1px solid green;
    background-color: #e0ffe0;
    color: green;
  }
</style>
</head>
<body>
  <h1>Mi Tutor Chatbot</h1>
  <form id="promptForm" enctype="multipart/form-data">
    <label for="nivel">Nivel:</label>
    <input type="text" id="nivel" name="nivel" required /><br />

    <label for="eje">Eje:</label>
    <input type="text" id="eje" name="eje" required /><br />

    <label for="destinatario">Destinatario:</label>
    <input type="text" id="destinatario" name="destinatario" required /><br />

    <label for="prompt">Prompt:</label><br />
    <textarea id="prompt" name="prompt" rows="4" cols="50" required></textarea><br />

    <label for="imagen">Imagen de avatar:</label><br />
    <input type="file" id="imagen" name="imagen" accept="image/*" /><br />
    <small>Subí o arrastrá una imagen de avatar</small><br />

    <label for="cuadernillos">Cuadernillos (archivos de texto):</label><br />
    <input type="file" id="cuadernillos" name="cuadernillos" multiple accept=".txt" /><br />
    <ul id="previewCuadernillos"></ul>

    <button type="submit">Guardar Prompt</button>
  </form>

  <div id="confirmacionPrompt"></div>

  <script>
    const cuadernillosInput = document.getElementById('cuadernillos');
    const previewCuadernillos = document.getElementById('previewCuadernillos');
    const confirmacionPrompt = document.getElementById('confirmacionPrompt');
    const promptForm = document.getElementById('promptForm');

    cuadernillosInput.addEventListener('change', () => {
      previewCuadernillos.innerHTML = '';
      for (const file of cuadernillosInput.files) {
        const li = document.createElement('li');
        li.textContent = file.name;
        previewCuadernillos.appendChild(li);
      }
    });

    promptForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      confirmacionPrompt.style.display = 'none';
      const formData = new FormData(promptForm);

      try {
        const response = await fetch('/guardar-prompt', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const nombresCuadernillos = Array.from(cuadernillosInput.files).map(f => f.name);
            confirmacionPrompt.textContent = `Prompt guardado con éxito. Cuadernillos guardados: ${nombresCuadernillos.join(', ')}`;
            confirmacionPrompt.style.display = 'block';
            previewCuadernillos.innerHTML = '';
            cuadernillosInput.value = '';
            promptForm.reset();
          } else {
            confirmacionPrompt.textContent = 'Error al guardar el prompt.';
            confirmacionPrompt.style.display = 'block';
          }
        } else {
          confirmacionPrompt.textContent = 'Error al guardar el prompt.';
          confirmacionPrompt.style.display = 'block';
        }
      } catch (err) {
        confirmacionPrompt.textContent = 'Error de red al guardar el prompt.';
        confirmacionPrompt.style.display = 'block';
      }
    });
  </script>
</body>
</html>