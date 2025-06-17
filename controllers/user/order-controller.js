const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-schema');

// Load order listing page
const loadOrderList = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { highlight } = req.query; // Get highlight parameter from query string

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's orders with populated product data
    const orders = await Order.find({ userId })
      .populate('orderedItems.product')
      .sort({ createdAt: -1 });

    res.render('order-list', {
      user,
      orders: orders || [],
      title: 'My Orders',
      highlightOrderId: highlight || null // Pass highlight parameter to view
    });
  } catch (error) {
    console.error('Error loading order list:', error);
    res.status(500).render('error', { message: 'Error loading orders' });
  }
};

// Load order details page
const loadOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).render('error', { message: 'Order not found' });
    }

    res.render('order-details', {
      user,
      order,
      title: `Order ${orderId}`
    });
  } catch (error) {
    console.error('Error loading order details:', error);
    res.status(500).render('error', { message: 'Error loading order details' });
  }
};

// Cancel entire order
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    const { reason } = req.body;

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (!['Pending', 'Processing'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Update order status
    order.status = 'Cancelled';

    // Cancel all items and restore stock
    for (const item of order.orderedItems) {
      if (item.status === 'Active') {
        item.status = 'Cancelled';
        item.cancellationReason = reason || 'Order cancelled by customer';
        item.cancelledAt = new Date();

        // Restore product stock
        await Product.findByIdAndUpdate(
          item.product._id,
          { $inc: { quantity: item.quantity } }
        );
      }
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Cancelled',
      description: `Order cancelled: ${reason || 'Cancelled by customer'}`
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order'
    });
  }
};

// Cancel individual item
const cancelOrderItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.userId;
    const { reason } = req.body;

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Find the specific item
    const orderItem = order.orderedItems.id(itemId);
    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: 'Order item not found'
      });
    }

    // Check if item can be cancelled
    if (orderItem.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Item is already cancelled or returned'
      });
    }

    // Cancel the item
    orderItem.status = 'Cancelled';
    orderItem.cancellationReason = reason || 'Item cancelled by customer';
    orderItem.cancelledAt = new Date();

    // Restore product stock
    await Product.findByIdAndUpdate(
      orderItem.product._id,
      { $inc: { quantity: orderItem.quantity } }
    );

    // Check if all items are cancelled
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    if (activeItems.length === 0) {
      order.status = 'Cancelled';
    } else {
      order.status = 'Partially Cancelled';
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: order.status,
      description: `Item cancelled: ${orderItem.product.productName} - ${reason || 'Cancelled by customer'}`
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Item cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling order item:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order item'
    });
  }
};

module.exports = {
  loadOrderList,
  loadOrderDetails,
  cancelOrder,
  cancelOrderItem
};
