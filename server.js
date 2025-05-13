require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/chat', async (req, res) => {


  const { message: userMessage, prompt, tema } = req.body;

const finalPrompt = `${prompt}\nEl tema actual es: ${tema}.`;

try {
  const chatCompletion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: finalPrompt },
      { role: 'user', content: userMessage }
    ]
  });

    res.json({ reply: chatCompletion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al comunicarse con OpenAI');
  }
});

const path = require('path');
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, 'localhost', () => console.log(`Servidor MiTutor corriendo en http://localhost:${PORT}`));