// server.js
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config(); // Load MONGO_URI from .env
console.log("MONGO_URI is:", process.env.MONGO_URI);


const app = express();

// Global middleware
app.use(cors());             // Allow your Unity WebGL (GitHub Pages) to call the API
app.use(express.json());     // Parse JSON request bodies

// Connect to MongoDB Atlas using the URI from .env
const client = new MongoClient(process.env.MONGO_URI);

async function boot() {
  // 1) Connect to Atlas
  await client.connect();

  // 2) Select database and collection
  const db = client.db('survivalGame');  // Database name (created lazily on first insert)
  const runs = db.collection('runs');    // Collection for storing game runs

  // Health check (quick sanity test)
  app.get('/', (req, res) => res.send({ ok: true }));

  // Save a run (called on Game Over)
  app.post('/runs', async (req, res) => {
    // Expecting: { runId, displayName, score, enemiesKilled, timeSurvived }
    const runData = {
      ...req.body,
      createdAt: new Date() // Useful for tie-breaking and audits
    };

    await runs.insertOne(runData);
    res.status(201).send({ status: 'ok', runId: runData.runId });
  });

  // Update display name (called after player submits name)
  app.patch('/runs/:id', async (req, res) => {
    const runId = req.params.id;
    const { displayName } = req.body;

    const result = await runs.updateOne(
      { runId },
      { $set: { displayName } }
    );

    res.send({
      status: 'updated',
      runId,
      matched: result.matchedCount // 0 if runId not found, 1 if updated
    });
  });

  // Update display name (PUT version for Unity)
  app.put('/runs/:id', async (req, res) => {
    const runId = req.params.id;
    const { displayName } = req.body;

    const result = await runs.updateOne(
      { runId },
      { $set: { displayName } }
    );

    if (result.matchedCount === 0) {
      res.status(404).send({ error: "Run not found" });
    } else {
      res.send({ status: "updated", runId, matched: result.matchedCount });
    }
  });

  // Leaderboard (top 10 by score)
  app.get('/leaderboard', async (req, res) => {
    const topRuns = await runs
      .find({})
      .project({ _id: 0 })               // Don’t leak internal Mongo _id
      .sort({ score: -1, createdAt: 1 }) // Highest score first; older first on ties
      .limit(10)
      .toArray();

    res.send(topRuns);
  });

  // Use Render’s assigned port in production; fallback to 3000 locally
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

// Boot the app and fail fast if something’s wrong
boot().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});