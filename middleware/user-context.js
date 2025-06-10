const User = require("../models/user-schema");

/**
 * Middleware to add user context to all routes
 * This ensures that the user object is available in all views for the dropdown
 */
const addUserContext = async (req, res, next) => {
  try {
    // Check if user is logged in
    if (req.session.userId) {
      // Get user data from database
      const userData = await User.findById(req.session.userId);

      // Add user to res.locals so it's available in all views
      res.locals.user = userData;
    } else {
      // No user logged in
      res.locals.user = null;
    }

    next();
  } catch (error) {
    console.error('Error in addUserContext middleware:', error);
    // Don't block the request, just set user to null
    res.locals.user = null;
    next();
  }
};

module.exports = addUserContext;
