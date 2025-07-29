require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3078;

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'new_employee_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
});

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || '*', // Allow environment variable or all origins for testing
    'http://13.48.148.22:3078',
    'http://127.0.0.1:5500',
    'http://13.48.148.22:5500',
    'http://127.0.0.1:5501',
    'http://127.0.0.1:5503',
    'http://13.48.148.22:5503',
    'http://13.48.148.22:8273',
    'http://13.48.148.22:8274'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database and ensure schema is correct
async function initializeDatabase() {
  try {
    // Create table if it doesn't exist
    await pool.query(`
      DROP TABLE IF EXISTS requests;
      CREATE TABLE IF NOT EXISTS requests (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        project VARCHAR(255) NOT NULL,
        manager VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Verify table schema
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'requests';
    `);
    console.log('Table columns:', columnCheck.rows.map(row => row.column_name));

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization failed:', err);
    process.exit(1);
  }
}

// Initialize the database
initializeDatabase();

// API Routes

// Create a new request
app.post('/api/requests', async (req, res) => {
  try {
    console.log('Received request body:', req.body); // Debug: Log request body
    const {
      name,
      employeeId,
      email,
      project,
      manager,
      location,
      fromDate,
      toDate,
      reason,
      status
    } = req.body;

    // Validate required fields
    if (!name || !employeeId || !email || !project || !manager || !location || !fromDate || !toDate || !reason) {
      console.error('Missing required fields:', { name, employeeId, email, project, manager, location, fromDate, toDate, reason });
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate employeeId format
    const empIdRegex = /^ATS0(?!000)[0-9]{3}$/;
    if (!empIdRegex.test(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee ID format. Must be ATS0 followed by 3 digits (not all zeros)' });
    }

    // Validate email format
    const emailRegex = /^[a-zA-Z][a-zA-Z0-9._-]*[a-zA-Z0-9]@astrolitetech\.com$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format. Must be in format: firstname.lastname@astrolitetech.com' });
    }

    // Validate date range
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneYearFromToday = new Date(today);
    oneYearFromToday.setFullYear(today.getFullYear() + 1);
    const maxRangeMs = 60 * 24 * 60 * 60 * 1000; // 60 days

    if (from < today || from > oneYearFromToday || to < from || (to - from) > maxRangeMs) {
      return res.status(400).json({ error: 'Invalid date range. Must be within one year from today and not exceed 60 days' });
    }

    // Check for duplicate pending/approved request
    const check = await pool.query(
      'SELECT * FROM requests WHERE employee_id = $1 AND from_date = $2 AND to_date = $3 AND status != $4',
      [employeeId, fromDate, toDate, 'Rejected']
    );
    if (check.rows.length) {
      return res.status(400).json({ error: `You already have a ${check.rows[0].status.toLowerCase()} request for these dates` });
    }

    const result = await pool.query(
      `INSERT INTO requests (
        name, employee_id, email, project, manager, location, from_date, to_date, reason, status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING *`,
      [name, employeeId, email, project, manager, location, fromDate, toDate, reason, status || 'Pending']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating request:', err);
    res.status(500).json({ error: 'Failed to create request', details: err.message });
  }
});

// Get all requests, optionally filtered by employee_id
app.get('/api/requests', async (req, res) => {
  try {
    const { employeeId } = req.query;
    let query = 'SELECT * FROM requests';
    let values = [];

    if (employeeId) {
      query += ' WHERE employee_id = $1';
      values.push(employeeId);
    }

    query += ' ORDER BY COALESCE(submitted_at, CURRENT_TIMESTAMP) DESC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching requests:', err);
    res.status(500).json({ error: 'Failed to fetch requests', details: err.message });
  }
});

// Get single request by ID
app.get('/api/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM requests WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching request:', err);
    res.status(500).json({ error: 'Failed to fetch request', details: err.message });
  }
});

// Update request status
app.put('/api/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(
      'UPDATE requests SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating request:', err);
    res.status(500).json({ error: 'Failed to update request', details: err.message });
  }
});

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/hr', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hr.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on 0.0.0.0:${port}`);
});