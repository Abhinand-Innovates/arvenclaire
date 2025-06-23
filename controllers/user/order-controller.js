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

      // Product stock restored successfully
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
      
      // Proportional discount calculated successfully
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

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (['Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Update order status and amounts
    order.status = 'Cancelled';
    order.totalPrice = 0;
    order.finalAmount = 0;

    // Cancel all active items and restore stock
    for (const item of order.orderedItems) {
      if (item.status === 'Active') {
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

          // Product stock restored successfully
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


// Request return for an order (entire order or specific items)
const requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;
    const { reason, items, requestType } = req.body;

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be returned (only delivered orders can be returned)
    if (order.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Check if return request already exists for entire order
    if (order.status === 'Return Request' || order.status === 'Returned') {
      return res.status(400).json({
        success: false,
        message: 'Return request already exists for this order'
      });
    }

    // Check if order is within return window (e.g., 7 days from delivery)
    const deliveryDate = order.orderTimeline.find(timeline => timeline.status === 'Delivered')?.timestamp;
    if (deliveryDate) {
      const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
      if (daysSinceDelivery > 7) {
        return res.status(400).json({
          success: false,
          message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
        });
      }
    }

    // Handle individual item returns vs entire order return
    if (items && Array.isArray(items) && items.length > 0) {
      // Individual item return(s)
      let returnedItemsCount = 0;
      let returnDescription = '';
      
      for (const returnItem of items) {
        const orderItem = order.orderedItems.id(returnItem.itemId);
        if (orderItem && orderItem.status === 'Active') {
          orderItem.status = 'Return Request';
          orderItem.returnReason = returnItem.reason || reason || 'Return requested by customer';
          orderItem.returnRequestedAt = new Date();
          returnedItemsCount++;
          
          if (returnDescription) {
            returnDescription += ', ';
          }
          returnDescription += orderItem.product.productName;
        }
      }

      if (returnedItemsCount === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid items found for return'
        });
      }

      // Check if all active items are now being returned
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
      
      if (activeItems.length === 0 && returnRequestItems.length > 0) {
        // All items are being returned
        order.status = 'Return Request';
        order.returnReason = `Individual items return: ${returnDescription}`;
      } else {
        // Partial return - keep order as delivered but mark items
        order.returnReason = `Partial return requested: ${returnDescription}`;
      }

      order.returnRequestedAt = new Date();

      // Add to order timeline
      order.orderTimeline.push({
        status: returnedItemsCount === order.orderedItems.length ? 'Return Request' : 'Partial Return Request',
        description: `Return requested for items: ${returnDescription}`,
        timestamp: new Date()
      });

      await order.save();

      res.status(200).json({
        success: true,
        message: `Return request submitted for ${returnedItemsCount} item(s). Admin will review your request.`
      });

    } else {
      // Entire order return (legacy support)
      order.status = 'Return Request';
      order.returnReason = reason || 'Return requested by customer';
      order.returnRequestedAt = new Date();

      // Add to order timeline
      order.orderTimeline.push({
        status: 'Return Request',
        description: `Return requested: ${reason || 'Return requested by customer'}`,
        timestamp: new Date()
      });

      await order.save();

      res.status(200).json({
        success: true,
        message: 'Return request submitted successfully. Admin will review your request.'
      });
    }

  } catch (error) {
    console.error('Error requesting return:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting return request'
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

    // Check if payment is completed before allowing invoice download
    if (order.paymentStatus !== 'Completed') {
      return res.status(403).json({
        success: false,
        message: 'Invoice is only available for completed payments. Please complete your payment first.'
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



// Request return for individual item
const requestIndividualItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.userId;
    const { reason } = req.body;

    // Individual item return request received

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be returned (only delivered orders can be returned)
    if (order.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
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

    // Check if item can be returned
    if (orderItem.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Item is already cancelled, returned, or has a return request'
      });
    }

    // Check if order is within return window (e.g., 7 days from delivery)
    const deliveryDate = order.orderTimeline.find(timeline => timeline.status === 'Delivered')?.timestamp;
    if (deliveryDate) {
      const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
      if (daysSinceDelivery > 7) {
        return res.status(400).json({
          success: false,
          message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
        });
      }
    }

    // Update item status to Return Request
    orderItem.status = 'Return Request';
    orderItem.returnReason = reason || 'Return requested by customer';
    orderItem.returnRequestedAt = new Date();

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Individual Item Return Request',
      description: `Return requested for item: ${orderItem.product.productName} - ${reason || 'Return requested by customer'}`,
      timestamp: new Date()
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: `Return request submitted successfully for "${orderItem.product.productName}". Admin will review your request.`,
      itemName: orderItem.product.productName,
      returnAmount: orderItem.totalPrice
    });

  } catch (error) {
    console.error('Error requesting individual item return:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting return request'
    });
  }
};

module.exports = {
  loadOrderList,
  loadOrderDetails,
  cancelOrderItem,
  cancelEntireOrder,
  requestReturn,
  requestIndividualItemReturn,
  downloadInvoice
};