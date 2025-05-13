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
  const userMessage = req.body.message;

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Eres MiTutor, un tutor socrático que guía con preguntas en vez de dar respuestas directas.' },
        { role: 'user', content: userMessage }
      ]
    });

    res.json({ reply: chatCompletion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al comunicarse con OpenAI');
  }
});

const PORT = 8080;
app.listen(PORT, () => console.log(`Servidor MiTutor corriendo en http://localhost:${PORT}`));