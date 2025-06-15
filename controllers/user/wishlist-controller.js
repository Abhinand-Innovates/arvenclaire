const Wishlist = require('../../models/wishlist-schema');
const User = require('../../models/user-schema');
const Product = require('../../models/product-schema');

// Load wishlist listing page
const loadWishlist = async (req, res) => {
  try {
    console.log('=== LOAD WISHLIST DEBUG ===');
    const userId = req.session.userId;
    console.log('Loading wishlist for userId:', userId);

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      console.log('User not found, redirecting to login');
      return res.redirect('/login');
    }

    // Get user's wishlist with populated product data
    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      })
      .sort({ 'products.addedOn': -1 });

    console.log('Raw wishlist from database:', wishlist);
    console.log('Wishlist products count:', wishlist ? wishlist.products.length : 0);

    // Filter out products that are no longer available
    let wishlistProducts = [];
    if (wishlist && wishlist.products) {
      wishlistProducts = wishlist.products.filter(item => {
        const product = item.productId;
        const isValid = product &&
               !product.isDeleted &&
               product.isListed &&
               !product.isBlocked &&
               product.category &&
               !product.category.isDeleted &&
               product.category.isListed;

        if (!isValid) {
          console.log('Filtering out invalid product:', product ? product._id : 'null product');
        }
        return isValid;
      });
    }

    console.log('Filtered wishlist products count:', wishlistProducts.length);

    res.render('wishlist', {
      user,
      wishlist: { products: wishlistProducts },
      title: 'My Wishlist'
    });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.status(500).render('error', { message: 'Error loading wishlist' });
  }
};

// Add product to wishlist
const addToWishlist = async (req, res) => {
  try {
    console.log('=== ADD TO WISHLIST DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Session userId:', req.session.userId);
    console.log('Product from middleware:', req.product ? req.product._id : 'No product');

    const userId = req.session.userId;
    const { productId } = req.body;

    // Debug: Check if user is authenticated
    if (!userId) {
      console.log('ERROR: No userId in session');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Debug: Check if productId is provided
    if (!productId) {
      console.log('ERROR: No productId in request body');
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
        code: 'MISSING_PRODUCT_ID'
      });
    }

    console.log('Processing wishlist for userId:', userId, 'productId:', productId);

    // Product availability is already checked by middleware
    const product = req.product;

    // Find or create user's wishlist
    let wishlist = await Wishlist.findOne({ userId });
    console.log('Existing wishlist found:', wishlist ? 'Yes' : 'No');

    if (!wishlist) {
      console.log('Creating new wishlist for user:', userId);
      wishlist = new Wishlist({
        userId,
        products: []
      });
    }

    // Check if product is already in wishlist
    const existingProduct = wishlist.products.find(
      item => item.productId.toString() === productId
    );

    if (existingProduct) {
      console.log('Product already in wishlist');
      return res.status(400).json({
        success: false,
        message: 'Product is already in your wishlist',
        code: 'ALREADY_IN_WISHLIST'
      });
    }

    // Add product to wishlist
    console.log('Adding product to wishlist...');
    wishlist.products.push({
      productId: productId,
      addedOn: new Date()
    });

    console.log('Saving wishlist to database...');
    const savedWishlist = await wishlist.save();
    console.log('Wishlist saved successfully:', savedWishlist._id);
    console.log('Total products in wishlist:', savedWishlist.products.length);

    res.json({
      success: true,
      message: 'Product added to wishlist successfully',
      wishlistCount: savedWishlist.products.length
    });

  } catch (error) {
    console.error('Error adding to wishlist:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to wishlist',
      code: 'SERVER_ERROR'
    });
  }
};

// Remove product from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { productId } = req.body;

    const wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found',
        code: 'WISHLIST_NOT_FOUND'
      });
    }

    // Remove product from wishlist
    wishlist.products = wishlist.products.filter(
      item => item.productId.toString() !== productId
    );

    await wishlist.save();

    res.json({
      success: true,
      message: 'Product removed from wishlist successfully',
      wishlistCount: wishlist.products.length
    });

  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from wishlist',
      code: 'SERVER_ERROR'
    });
  }
};

// Get wishlist count for navbar
const getWishlistCount = async (req, res) => {
  try {
    console.log('=== GET WISHLIST COUNT DEBUG ===');
    const userId = req.session.userId;
    console.log('Getting count for userId:', userId);

    if (!userId) {
      console.log('No userId, returning count 0');
      return res.json({ count: 0 });
    }

    const wishlist = await Wishlist.findOne({ userId });
    const count = wishlist ? wishlist.products.length : 0;
    console.log('Wishlist count:', count);

    res.json({ count });

  } catch (error) {
    console.error('Error getting wishlist count:', error);
    res.json({ count: 0 });
  }
};


module.exports = {
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistCount
};
