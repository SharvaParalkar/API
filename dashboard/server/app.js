const express = require('express');
const path = require('path');
const cors = require('cors');
const notificationRoutes = require('./routes/notifications');

const app = express();
const port = process.env.PORT || 3300;

// Middleware
app.use(cors());
app.use(express.json());

// Session middleware (memory store for development)
const session = require('express-session');
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Serve static files with /dashboard prefix
app.use('/dashboard', express.static(path.join(__dirname, '../public')));

// Routes with /dashboard prefix
app.use('/dashboard/api', notificationRoutes);

// Handle root dashboard path
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Simple test endpoint for notifications
app.post('/dashboard/test-notification', (req, res) => {
  const { notifications } = require('./push-notifications');
  const { type = 'test', message = 'Test notification' } = req.body;
  
  notifications.sendNotification({
    type,
    title: 'Test Notification',
    message,
    priority: 'high',
    requireInteraction: true
  })
    .then(() => res.json({ success: true }))
    .catch(error => res.status(500).json({ error: error.message }));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 