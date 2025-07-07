const User = require("../models/user-schema");



//Handle google user and normal user 
const checkUserBlocked = async (req, res, next) => {
  try {
 
    const userId = req.session.userId || req.session.googleUserId;

    // If no session found, move to next
    if (!userId) 
      return next();

    // Fetch user from DB
    const user = await User.findById(userId);

    // If user doesn't exist or is blocked
    if (!user || user.isBlocked) {
      // Destroy session
      req.session.destroy((err) => {
        if (err) console.error('Error destroying session:', err);
      });

      // Clear session cookie
      res.clearCookie('connect.sid');

      // AJAX request handling
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({
          success: false,
          blocked: true,
          message: 'Your account has been blocked. Please contact support.',
          redirect: '/login'
        });
      }

      // Regular redirect
      req.flash = req.flash || function() {}; // fallback
      return res.redirect('/login?blocked=true');
    }

    // User valid
    return next();

  } catch (error) {
    console.error('Error checking user blocked status:', error);

    // Destroy session on error
    req.session.destroy((err) => {
      if (err) console.error('Error destroying session:', err);
    });

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({
        success: false,
        message: 'Authentication error. Please login again.',
        redirect: '/login'
      });
    }

    return res.redirect('/login');
  }
};



//Makes that user data available in all views (EJS pages)
const addUserContext = async (req, res, next) => {
  
  try {
    // Check if user is logged in
    if (req.session.userId) {
      // Get user data from database
      const userData = await User.findById(req.session.userId);

      // Get user's wishlist to determine which products are in wishlist
      const Wishlist = require("../models/wishlist-schema");
      const wishlist = await Wishlist.findOne({ userId: req.session.userId });
      const wishlistProductIds = wishlist ? wishlist.products.map(item => item.productId.toString()) : [];

      // Add user and wishlist data to res.locals so it's available in all views
      res.locals.user = userData;
      res.locals.userWishlistProductIds = wishlistProductIds;
    } else {
      // No user logged in
      res.locals.user = null;
      res.locals.userWishlistProductIds = [];
    }

    next();
  } catch (error) {
    console.error('Error in addUserContext middleware:', error);
    // Don't block the request, just set user to null
    res.locals.user = null;
    res.locals.userWishlistProductIds = [];
    next();
  }
};


module.exports = { 
  checkUserBlocked, 
  addUserContext,
};
