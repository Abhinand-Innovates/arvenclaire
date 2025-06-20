const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-schema');
const InvoiceGenerator = require('../../utils/pdf-invoice-generator');

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

    // Check if order can be cancelled based on status
    if (['Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
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
    try {
      // Get current stock before update for verification
      const productBefore = await Product.findById(orderItem.product._id);
      const stockBefore = productBefore ? productBefore.quantity : 0;

      const productUpdateResult = await Product.findByIdAndUpdate(
        orderItem.product._id,
        { $inc: { quantity: orderItem.quantity } },
        { new: true }
      );

      console.log('Product stock restored for individual item cancellation:', {
        productId: orderItem.product._id,
        productName: orderItem.product.productName,
        stockBefore: stockBefore,
        quantityRestored: orderItem.quantity,
        stockAfter: productUpdateResult ? productUpdateResult.quantity : 'unknown',
        verified: productUpdateResult && (productUpdateResult.quantity === stockBefore + orderItem.quantity)
      });
    } catch (stockError) {
      console.error('Error restoring product stock:', stockError);
      // Continue with order cancellation even if stock update fails
    }

    // Recalculate order amounts based on active items only
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const cancelledItems = order.orderedItems.filter(item => item.status === 'Cancelled');
    
    if (activeItems.length === 0) {
      // All items cancelled - set amounts to 0
      order.status = 'Cancelled';
      order.totalPrice = 0;
      order.finalAmount = 0;
      // Keep original discount for record keeping, but it won't affect final amount
    } else {
      // Partially cancelled - recalculate based on active items with proportional discount
      order.status = 'Partially Cancelled';
      
      // Calculate totals
      const activeItemsTotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const cancelledItemsTotal = cancelledItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const originalOrderTotal = activeItemsTotal + cancelledItemsTotal;
      
      // Calculate proportional discount for active items only
      let applicableDiscount = 0;
      if (order.discount > 0 && originalOrderTotal > 0) {
        // Calculate what proportion of the original order the active items represent
        const activeItemsProportion = activeItemsTotal / originalOrderTotal;
        // Apply only the proportional discount to active items
        applicableDiscount = Math.min(order.discount * activeItemsProportion, activeItemsTotal);
      }
      
      // Update order totals
      order.totalPrice = activeItemsTotal;
      order.finalAmount = Math.max(0, activeItemsTotal - applicableDiscount + order.shippingCharges);
      
      console.log('Proportional discount calculation:', {
        originalOrderTotal: originalOrderTotal,
        activeItemsTotal: activeItemsTotal,
        cancelledItemsTotal: cancelledItemsTotal,
        originalDiscount: order.discount,
        applicableDiscount: applicableDiscount,
        finalAmount: order.finalAmount
      });
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: order.status,
      description: `Item cancelled: ${orderItem.product.productName} - ${reason || 'Cancelled by customer'}`,
      timestamp: new Date()
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


// Cancel entire order
const cancelEntireOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    const { reason } = req.body;

    console.log('Cancel entire order request:', { orderId, userId, reason });

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      console.log('Order not found:', { orderId, userId });
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (['Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'].includes(order.status)) {
      console.log('Order cannot be cancelled, current status:', order.status);
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    console.log('Cancelling order with', order.orderedItems.length, 'items');

    // Update order status and amounts
    order.status = 'Cancelled';
    order.totalPrice = 0;
    order.finalAmount = 0;

    // Cancel all active items and restore stock
    for (const item of order.orderedItems) {
      if (item.status === 'Active') {
        console.log('Cancelling item:', item.product.productName, 'quantity:', item.quantity);
        
        item.status = 'Cancelled';
        item.cancellationReason = reason || 'Order cancelled by customer';
        item.cancelledAt = new Date();

        // Restore product stock - this is the key part for accurate inventory management
        try {
          // Get current stock before update for verification
          const productBefore = await Product.findById(item.product._id);
          const stockBefore = productBefore ? productBefore.quantity : 0;

          const productUpdateResult = await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { quantity: item.quantity } },
            { new: true }
          );

          console.log('Product stock restored for entire order cancellation:', {
            productId: item.product._id,
            productName: item.product.productName,
            stockBefore: stockBefore,
            quantityRestored: item.quantity,
            stockAfter: productUpdateResult ? productUpdateResult.quantity : 'unknown',
            verified: productUpdateResult && (productUpdateResult.quantity === stockBefore + item.quantity)
          });
        } catch (stockError) {
          console.error('Error restoring product stock for item:', item.product.productName, stockError);
          // Continue with other items even if one fails
        }
      }
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Cancelled',
      description: `Order cancelled: ${reason || 'Cancelled by customer'}`,
      timestamp: new Date()
    });

    await order.save();

    console.log('Order cancelled successfully:', orderId);

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling entire order:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order'
    });
  }
};


// Download PDF invoice for an order
const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Generate PDF invoice
    const invoiceGenerator = new InvoiceGenerator();
    const pdfBuffer = await invoiceGenerator.generateInvoice(order, user);

    // Set response headers for PDF download
    const filename = `Invoice-${order.orderId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF buffer
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating invoice'
    });
  }
};



module.exports = {
  loadOrderList,
  loadOrderDetails,
  cancelOrderItem,
  cancelEntireOrder,
  downloadInvoice
};
