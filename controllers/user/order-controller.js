const Order = require('../../models/order-schema');
const User = require('../../models/user-schema');

// Load order listing page
const loadOrderList = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's orders (for future implementation)
    // const orders = await Order.find({ userId }).populate('orderedItems.product').sort({ createdAt: -1 });

    res.render('order-list', {
      user,
      // orders: orders || [],
      title: 'My Orders'
    });
  } catch (error) {
    console.error('Error loading order list:', error);
    res.status(500).render('error', { message: 'Error loading orders' });
  }
};


module.exports = {
  loadOrderList
};
