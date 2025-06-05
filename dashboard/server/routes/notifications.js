const express = require('express');
const router = express.Router();
const notifications = require('../push-notifications');

// Store connected SSE clients
const clients = new Set();

// Handle subscription
router.post('/push-subscription', (req, res) => {
  try {
    const subscription = req.body;
    notifications.addSubscription(subscription);
    res.status(201).json({ message: 'Subscription added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add subscription' });
  }
});

// SSE endpoint for real-time notifications
router.get('/notifications', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection message
  res.write('data: {"type":"connected"}\n\n');

  // Add client to the set
  clients.add(res);

  // Remove client when connection closes
  req.on('close', () => {
    clients.delete(res);
  });
});

// Helper function to send notification to all connected clients
function sendToAllClients(data) {
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Example endpoints to trigger notifications
router.post('/notify/order-status', (req, res) => {
  const { orderId, status } = req.body;
  notifications.notifyOrderStatusChange(orderId, status)
    .then(result => {
      sendToAllClients({
        type: 'order_status',
        orderId,
        title: `Order Status Updated: ${orderId}`,
        message: `Order ${orderId} status changed to: ${status}`
      });
      res.json(result);
    })
    .catch(error => res.status(500).json({ error: 'Failed to send notification' }));
});

router.post('/notify/coupon', (req, res) => {
  const { couponCode, action } = req.body;
  notifications.notifyCouponUpdate(couponCode, action)
    .then(result => {
      sendToAllClients({
        type: 'coupon',
        title: 'Coupon Update',
        message: `Coupon ${couponCode} has been ${action}`
      });
      res.json(result);
    })
    .catch(error => res.status(500).json({ error: 'Failed to send notification' }));
});

router.post('/notify/print-status', (req, res) => {
  const { orderId, status } = req.body;
  notifications.notifyPrintStatusChange(orderId, status)
    .then(result => {
      sendToAllClients({
        type: 'print_status',
        orderId,
        title: `Print Status Changed: ${orderId}`,
        message: `Print status for order ${orderId} changed to: ${status}`
      });
      res.json(result);
    })
    .catch(error => res.status(500).json({ error: 'Failed to send notification' }));
});

module.exports = router; 