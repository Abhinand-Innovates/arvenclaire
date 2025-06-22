const Cart = require('../../models/cart-schema');
const Address = require('../../models/address-schema');
const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-schema');
const { calculateFinalPrice, calculateItemTotal, calculateItemDiscount, syncAllCartPrices, calculateCartSummary } = require('../../utils/price-calculator');

// Load checkout page
const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user data
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    // Filter out items with unavailable products and sync prices
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    // Sync cart prices with current product data before checkout using utility function
    const priceUpdatesNeeded = syncAllCartPrices(cartItems);

    // Save updated prices to database if needed
    if (priceUpdatesNeeded) {
      await cart.save();
    }

    if (cartItems.length === 0) {
      return res.redirect('/cart');
    }

    // Check for out-of-stock items
    const outOfStockItems = cartItems.filter(item => item.productId.quantity === 0);
    if (outOfStockItems.length > 0) {
      req.session.checkoutError = 'Some items in your cart are out of stock. Please remove them to proceed.';
      return res.redirect('/cart');
    }

    // Get user's addresses
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    // Calculate order summary with subtotal based on regular prices
    let subtotal = 0; // Based on regular prices (before discount)
    let totalDiscount = 0; // Difference between regular and sale prices
    let amountAfterDiscount = 0; // Amount customer actually pays (after discount)

    cartItems.forEach(item => {
      const regularPrice = item.productId.regularPrice;
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      // Subtotal based on regular prices
      subtotal += regularPrice * quantity;
      
      // Calculate discount
      const itemDiscount = calculateItemDiscount(regularPrice, salePrice, quantity);
      totalDiscount += itemDiscount;
      
      // Amount customer actually pays for this item
      const itemFinalAmount = calculateItemTotal(salePrice, quantity);
      amountAfterDiscount += itemFinalAmount;
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50; // Free shipping based on amount after discount
    const finalAmount = amountAfterDiscount + shippingCharges; // Final amount = amount after discount + shipping

    // Check for address success message from session
    const addressSuccess = req.session.addressSuccess;
    if (addressSuccess) {
      delete req.session.addressSuccess; // Clear the message after reading
    }

    res.render('checkout', {
      user,
      cartItems,
      addresses,
      orderSummary: {
        subtotal,
        totalDiscount,
        shippingCharges,
        finalAmount
      },
      addressSuccess,
      title: 'Checkout'
    });

  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', { message: 'Error loading checkout page' });
  }
};



// Process order placement
const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { selectedAddressId, paymentMethod = 'Cash on Delivery' } = req.body;

    // Validate address selection
    if (!selectedAddressId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a delivery address'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Filter available items and validate stock
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    // Final stock validation
    for (const item of cartItems) {
      if (item.productId.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.productId.productName}`
        });
      }
    }

    // Get selected address
    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc.address.id(selectedAddressId);
    
    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Selected address not found'
      });
    }

    // Calculate order totals with subtotal based on regular prices
    let subtotal = 0; // Based on regular prices (before discount)
    let totalDiscount = 0; // Difference between regular and sale prices
    let amountAfterDiscount = 0; // Amount customer actually pays (after discount)
    const orderedItems = [];

    cartItems.forEach(item => {
      const regularPrice = item.productId.regularPrice;
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      // Subtotal based on regular prices
      subtotal += regularPrice * quantity;
      
      // Calculate discount
      const itemDiscount = calculateItemDiscount(regularPrice, salePrice, quantity);
      totalDiscount += itemDiscount;
      
      // Amount customer actually pays for this item
      const itemFinalAmount = calculateItemTotal(salePrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: salePrice, // Store sale price as the price
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50; // Free shipping based on amount after discount
    const finalAmount = amountAfterDiscount + shippingCharges; // Final amount = amount after discount + shipping

    // Create order
    const order = new Order({
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: totalDiscount,
      shippingCharges,
      finalAmount,
      shippingAddress: {
        addressType: selectedAddress.addressType,
        name: selectedAddress.name,
        city: selectedAddress.city,
        landMark: selectedAddress.landMark,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        phone: selectedAddress.phone,
        altPhone: selectedAddress.altPhone
      },
      paymentMethod,
      orderTimeline: [{
        status: 'Pending',
        description: 'Order placed successfully'
      }]
    });

    await order.save();

    // Update product quantities
    for (const item of cartItems) {
      await Product.findByIdAndUpdate(
        item.productId._id,
        { $inc: { quantity: -item.quantity } }
      );
    }

    // Clear cart
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } }
    );

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Error placing order. Please try again.'
    });
  }
};



// Load order success page
const loadOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId;

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.redirect('/orders');
    }

    const user = await User.findById(userId).select('fullname email profilePhoto');

    res.render('order-success', {
      user,
      order,
      title: 'Order Confirmed'
    });

  } catch (error) {
    console.error('Error loading order success:', error);
    res.status(500).render('error', { message: 'Error loading order confirmation' });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  loadOrderSuccess
};
