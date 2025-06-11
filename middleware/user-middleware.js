const User = require("../models/user-schema");


//Checks user status
const checkUserBlocked = async (req, res, next) => {
  try {
    // Skip check if user is not logged in
    if (!req.session.userId) {
      return next();
    }

    // Get user from database
    const user = await User.findById(req.session.userId);

    // If user doesn't exist or is blocked
    if (!user || user.isBlocked) {
      // Clear the session
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
      });

      // Clear any cookies
      res.clearCookie('connect.sid');

      // If it's an AJAX request, return JSON response
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({
          success: false,
          blocked: true,
          message: 'Your account has been blocked. Please contact support.',
          redirect: '/login'
        });
      }

      // For regular requests, redirect to login with message
      req.flash = req.flash || function() {}; // Fallback if flash is not available
      return res.redirect('/login?blocked=true');
    }

    // User is valid, continue
    next();

  } catch (error) {
    console.error('Error checking user blocked status:', error);
    
    // Clear session on error
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
    });

    // If it's an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({
        success: false,
        message: 'Authentication error. Please login again.',
        redirect: '/login'
      });
    }

    // Redirect to login
    res.redirect('/login');
  }
};


//Makes that user data available in all views (EJS pages)
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


module.exports = { 
  checkUserBlocked, 
  addUserContext 
};
