import express from 'express';
import { getRandomDataPoint, initializeData } from './scripts/dataloader';
import { getRowById } from './scripts/db-loader';

const app = express();
app.use(express.json());

// Sample data endpoint
app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello World', data: [1, 2, 3] });
});

// Get data by ID
app.get('/api/data/:id', (req, res) => {
  const { id } = req.params;
  res.json({ id, message: `Data for ID: ${id}` });
});

// POST endpoint
app.post('/api/data', (req, res) => {
  const newData = req.body;
  res.json({ success: true, data: newData });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000/');
  initializeData();
});

// debug endpoints
app.get('/random', (req, res) => {
  res.json({ data: getRandomDataPoint() });
});

app.get('/db/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const row = await getRowById(Number.parseInt(id, 10));
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch row with ' + error });
  }
});
