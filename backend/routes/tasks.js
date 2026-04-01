const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Task Schema
const TaskSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  reasoning: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

// Middleware to verify JWT
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

async function getAIPriority(taskTitle) {
  console.log('Calling Gemini with task:', taskTitle);
  console.log('API Key:', process.env.GEMINI_API_KEY);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a task prioritization assistant. Given this task: "${taskTitle}", respond with ONLY a JSON object in this exact format, nothing else:
              {"priority": "High" or "Medium" or "Low", "reasoning": "one short sentence explaining why"}
              Rules: High = urgent/important deadlines or critical work. Medium = regular work, no immediate deadline. Low = optional, can wait.`
            }]
          }]
        })
      }
    );
    const data = await response.json();
    console.log('Full Gemini data:', JSON.stringify(data));
    const text = data.candidates[0].content.parts[0].text;
    console.log('Gemini response:', text);
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.log('Gemini error:', err);
    return { priority: 'Medium', reasoning: 'AI unavailable, set to default priority' };
  }
}

router.get('/', auth, async (req, res) => {
  const tasks = await Task.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(tasks);
});

router.post('/', auth, async (req, res) => {
  const { title } = req.body;
  const { priority, reasoning } = await getAIPriority(title);
  const task = new Task({ userId: req.user.id, title, priority, reasoning });
  await task.save();
  res.json(task);
});

router.put('/:id', auth, async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, { completed: req.body.completed }, { new: true });
  res.json(task);
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;