const Wishlist = require('../../models/wishlist-schema');
const User = require('../../models/user-schema');
const { applyBestOffersToProducts } = require('../../utils/offer-utils');


// Load wishlist listing page
const loadWishlist = async (req, res) => {
  try {
    const userId = req.session.userId;

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
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

        return isValid;
      });

      // Apply offer calculations to wishlist products
      if (wishlistProducts.length > 0) {
        const products = wishlistProducts.map(item => item.productId);
        const productsWithOffers = await applyBestOffersToProducts(products);
        
        // Map back to wishlist structure
        wishlistProducts = wishlistProducts.map((item, index) => ({
          ...item.toObject(),
          productId: productsWithOffers[index]
        }));
      }
    }

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
    const userId = req.session.userId;
    const { productId } = req.body;

    // Check if user is authenticated
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Check if productId is provided
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
        code: 'MISSING_PRODUCT_ID'
      });
    }

    // Find or create user's wishlist
    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
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
      return res.status(400).json({
        success: false,
        message: 'Product is already in your wishlist',
        code: 'ALREADY_IN_WISHLIST'
      });
    }

    // Add product to wishlist
    wishlist.products.push({
      productId: productId,
      addedOn: new Date()
    });

    const savedWishlist = await wishlist.save();

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
    const userId = req.session.userId;

    if (!userId) {
      return res.json({ count: 0 });
    }

    const wishlist = await Wishlist.findOne({ userId });
    const count = wishlist ? wishlist.products.length : 0;

    res.json({ count });

  } catch (error) {
    console.error('Error getting wishlist count:', error);
    res.json({ count: 0 });
  }
};



// Bulk transfer all wishlist items to cart
const bulkTransferToCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const Cart = require('../../models/cart-schema');
    const Product = require('../../models/product-schema');

    // Get user's wishlist with populated product data
    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'products.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!wishlist || !wishlist.products.length) {
      return res.status(400).json({
        success: false,
        message: 'Your wishlist is empty'
      });
    }

    // Filter available products
    const availableProducts = wishlist.products.filter(item => {
      const product = item.productId;
      return product &&
             !product.isDeleted &&
             product.isListed &&
             !product.isBlocked &&
             product.category &&
             !product.category.isDeleted &&
             product.category.isListed &&
             product.quantity > 0;
    });

    if (availableProducts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No available products in your wishlist to add to cart'
      });
    }

    // Find or create user's cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        items: []
      });
    }

    const results = {
      added: [],
      skipped: [],
      errors: []
    };

    // Process each available product
    for (const wishlistItem of availableProducts) {
      const product = wishlistItem.productId;

      try {
        // Check if product already exists in cart
        const existingItemIndex = cart.items.findIndex(
          item => item.productId.toString() === product._id.toString()
        );

        if (existingItemIndex > -1) {
          // Update existing item
          const existingItem = cart.items[existingItemIndex];
          const newQuantity = existingItem.quantity + 1;

          if (newQuantity > product.quantity) {
            results.skipped.push({
              productName: product.productName,
              reason: `Only ${product.quantity} available in stock. You already have ${existingItem.quantity} in your cart.`
            });
            continue;
          }

          if (newQuantity > 5) {
            results.skipped.push({
              productName: product.productName,
              reason: `Maximum limit reached! You can only add up to 5 items per product. You currently have ${existingItem.quantity} in your cart.`
            });
            continue;
          }

          existingItem.quantity = newQuantity;
          existingItem.price = product.salePrice;
          existingItem.totalPrice = product.salePrice * newQuantity;
        } else {
          // Add new item
          cart.items.push({
            productId: product._id,
            quantity: 1,
            price: product.salePrice,
            totalPrice: product.salePrice
          });
        }

        results.added.push({
          productName: product.productName,
          productId: product._id
        });

      } catch (error) {
        results.errors.push({
          productName: product.productName,
          reason: 'Failed to add to cart'
        });
      }
    }

    // Save cart if any items were added
    if (results.added.length > 0) {
      await cart.save();

      // Remove successfully added items from wishlist
      const addedProductIds = results.added.map(item => item.productId);
      await Wishlist.updateOne(
        { userId },
        { $pull: { products: { productId: { $in: addedProductIds } } } }
      );
    }

    // Get updated counts
    const updatedWishlist = await Wishlist.findOne({ userId });
    const wishlistCount = updatedWishlist ? updatedWishlist.products.length : 0;

    const updatedCart = await Cart.findOne({ userId });
    const cartCount = updatedCart ? updatedCart.items.reduce((total, item) => total + item.quantity, 0) : 0;

    // Prepare response message
    let message = '';
    if (results.added.length > 0) {
      message = `${results.added.length} item(s) added to cart successfully`;
      if (results.skipped.length > 0) {
        message += `. ${results.skipped.length} item(s) were skipped due to stock or quantity limits`;
      }
      if (results.errors.length > 0) {
        message += `. ${results.errors.length} item(s) failed to add`;
      }
    } else {
      message = 'No items could be added to cart';
    }

    res.status(200).json({
      success: results.added.length > 0,
      message,
      results,
      counts: {
        wishlist: wishlistCount,
        cart: cartCount
      }
    });

  } catch (error) {
    console.error('Error in bulk transfer to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Error transferring items to cart'
    });
  }
};


module.exports = {
  loadWishlist,
  addToWishlist,
  removeFromWishlist,
  getWishlistCount,
  bulkTransferToCart
};
