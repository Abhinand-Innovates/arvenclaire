const Wishlist = require('../../models/wishlist-schema');
const User = require('../../models/user-schema');

// Load wishlist listing page
const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's wishlist (for future implementation)
    // const wishlist = await Wishlist.findOne({ userId }).populate('products.productId').sort({ 'products.addedOn': -1 });

    res.render('wishlist', {
      user,
      // wishlist: wishlist || { products: [] },
      title: 'My Wishlist'
    });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.status(500).render('error', { message: 'Error loading wishlist' });
  }
};

module.exports = {
  loadWishlist
};
