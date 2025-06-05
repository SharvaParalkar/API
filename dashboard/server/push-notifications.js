// Store subscriptions in memory (in production, use a database)
const subscriptions = new Set();

function addSubscription(subscription) {
  subscriptions.add(subscription);
  return true;
}

function removeSubscription(subscription) {
  subscriptions.delete(subscription);
  return true;
}

async function sendNotification(data) {
  const notifications = [];

  for (const subscription of subscriptions) {
    try {
      // In a real implementation, you would use the Push API
      // For now, we'll just store the notification data
      notifications.push({ 
        success: true, 
        subscription,
        data
      });
    } catch (error) {
      notifications.push({ 
        success: false, 
        subscription, 
        error 
      });
    }
  }

  return notifications;
}

// Example notification functions for different events
async function notifyOrderStatusChange(orderId, newStatus) {
  return sendNotification({
    type: 'order_status',
    orderId,
    title: `Order Status Updated: ${orderId}`,
    message: `Order ${orderId} status changed to: ${newStatus}`,
    priority: 'high',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Order'
      }
    ]
  });
}

async function notifyCouponUpdate(couponCode, action) {
  return sendNotification({
    type: 'coupon',
    title: 'Coupon Update',
    message: `Coupon ${couponCode} has been ${action}`,
    priority: 'default'
  });
}

async function notifyPrintStatusChange(orderId, newStatus) {
  return sendNotification({
    type: 'print_status',
    orderId,
    title: `Print Status Changed: ${orderId}`,
    message: `Print status for order ${orderId} changed to: ${newStatus}`,
    priority: 'high',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Order'
      }
    ]
  });
}

// Queue for storing notifications when clients are offline
const notificationQueue = new Map(); // orderId -> notifications[]

function queueNotification(orderId, notification) {
  if (!notificationQueue.has(orderId)) {
    notificationQueue.set(orderId, []);
  }
  notificationQueue.get(orderId).push({
    ...notification,
    timestamp: new Date().toISOString()
  });
}

function getQueuedNotifications(orderId) {
  return notificationQueue.get(orderId) || [];
}

function clearQueuedNotifications(orderId) {
  notificationQueue.delete(orderId);
}

// Periodically clean up old notifications (older than 24 hours)
setInterval(() => {
  const now = new Date();
  for (const [orderId, notifications] of notificationQueue.entries()) {
    const filteredNotifications = notifications.filter(n => {
      const notificationTime = new Date(n.timestamp);
      return (now - notificationTime) < 24 * 60 * 60 * 1000;
    });
    if (filteredNotifications.length === 0) {
      notificationQueue.delete(orderId);
    } else {
      notificationQueue.set(orderId, filteredNotifications);
    }
  }
}, 60 * 60 * 1000); // Run every hour

module.exports = {
  addSubscription,
  removeSubscription,
  sendNotification,
  notifyOrderStatusChange,
  notifyCouponUpdate,
  notifyPrintStatusChange,
  queueNotification,
  getQueuedNotifications,
  clearQueuedNotifications
}; 