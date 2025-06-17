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

// Cancel partial quantity of an item
const cancelPartialOrderItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.userId;
    const { reason, cancelQuantity } = req.body;

    // Validate cancel quantity
    const parsedCancelQuantity = parseInt(cancelQuantity);
    if (isNaN(parsedCancelQuantity) || parsedCancelQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cancellation quantity'
      });
    }

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

    // Check if cancel quantity is valid
    if (parsedCancelQuantity >= orderItem.quantity) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel more items than ordered. Use full cancellation instead.'
      });
    }

    // Calculate new quantities and prices
    const remainingQuantity = orderItem.quantity - parsedCancelQuantity;
    const newTotalPrice = orderItem.price * remainingQuantity;
    const cancelledAmount = orderItem.price * parsedCancelQuantity;

    // Update the item
    orderItem.quantity = remainingQuantity;
    orderItem.totalPrice = newTotalPrice;

    // Restore product stock for cancelled quantity
    await Product.findByIdAndUpdate(
      orderItem.product._id,
      { $inc: { quantity: parsedCancelQuantity } }
    );

    // Recalculate order totals
    const newOrderTotal = order.orderedItems.reduce((total, item) => {
      return item.status === 'Active' ? total + item.totalPrice : total;
    }, 0);

    order.totalPrice = newOrderTotal;
    order.finalAmount = newOrderTotal + order.shippingCharges - order.discount;

    // Update order status to partially cancelled if not already
    if (order.status !== 'Partially Cancelled') {
      order.status = 'Partially Cancelled';
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Partially Cancelled',
      description: `Partial cancellation: ${parsedCancelQuantity} units of ${orderItem.product.productName} cancelled - ${reason || 'Cancelled by customer'}`
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: `${parsedCancelQuantity} units cancelled successfully`,
      updatedOrder: {
        totalPrice: order.totalPrice,
        finalAmount: order.finalAmount,
        item: {
          quantity: orderItem.quantity,
          totalPrice: orderItem.totalPrice
        }
      }
    });

  } catch (error) {
    console.error('Error cancelling partial order item:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling partial order item'
    });
  }
};

// Bulk cancel multiple items with different quantities
const bulkCancelOrderItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    const { reason, items } = req.body;

    // Validate required fields
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item must be selected for cancellation'
      });
    }

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

    let totalCancelledItems = 0;
    let totalRefundAmount = 0;
    const cancelledProducts = [];

    // Process each item for cancellation
    for (const cancelItem of items) {
      const { itemId, quantity } = cancelItem;

      // Validate quantity
      const parsedQuantity = parseInt(quantity);
      if (isNaN(parsedQuantity) || parsedQuantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Invalid cancellation quantity for item ${itemId}`
        });
      }

      // Find the order item
      const orderItem = order.orderedItems.id(itemId);
      if (!orderItem) {
        return res.status(404).json({
          success: false,
          message: `Order item ${itemId} not found`
        });
      }

      // Check if item can be cancelled
      if (orderItem.status !== 'Active') {
        return res.status(400).json({
          success: false,
          message: `Item ${orderItem.product.productName} is already cancelled or returned`
        });
      }

      // Check if requested quantity is valid
      if (parsedQuantity > orderItem.quantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel ${parsedQuantity} items. Only ${orderItem.quantity} available for ${orderItem.product.productName}`
        });
      }

      // Calculate refund amount for this cancellation
      const itemRefundAmount = (orderItem.price * parsedQuantity);
      totalRefundAmount += itemRefundAmount;

      // If cancelling all quantities, mark item as cancelled
      if (parsedQuantity === orderItem.quantity) {
        orderItem.status = 'Cancelled';
        orderItem.cancellationReason = reason;
        orderItem.cancelledAt = new Date();
      } else {
        // Partial cancellation - reduce quantity and adjust prices
        orderItem.quantity -= parsedQuantity;
        orderItem.totalPrice = orderItem.price * orderItem.quantity;
      }

      // Restore product stock
      await Product.findByIdAndUpdate(
        orderItem.product._id,
        { $inc: { quantity: parsedQuantity } }
      );

      totalCancelledItems += parsedQuantity;
      cancelledProducts.push({
        name: orderItem.product.productName,
        quantity: parsedQuantity,
        refundAmount: itemRefundAmount
      });
    }

    // Recalculate order totals
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    if (activeItems.length === 0) {
      order.status = 'Cancelled';
    } else {
      order.status = 'Partially Cancelled';

      // Recalculate order total price
      order.totalPrice = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);
      order.finalAmount = order.totalPrice - order.discount + order.shippingCharges;
    }

    // Add to order timeline
    const productNames = cancelledProducts.map(p => `${p.name} (${p.quantity})`).join(', ');
    order.orderTimeline.push({
      status: order.status,
      description: `Bulk cancellation: ${productNames} - ${reason}`
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: `Successfully cancelled ${totalCancelledItems} item(s)`,
      cancelledItems: totalCancelledItems,
      refundAmount: totalRefundAmount,
      updatedOrder: {
        status: order.status,
        totalPrice: order.totalPrice,
        finalAmount: order.finalAmount
      }
    });

  } catch (error) {
    console.error('Error in bulk cancellation:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing bulk cancellation'
    });
  }
};

module.exports = {
  loadOrderList,
  loadOrderDetails,
  cancelOrder,
  cancelOrderItem,
  cancelPartialOrderItem,
  bulkCancelOrderItems
};
