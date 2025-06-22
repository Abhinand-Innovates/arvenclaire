
const User = require('../models/user-schema');


const authMiddleware = {

  
  //For admin
  isAdminAuthenticated : async (req, res, next) => {
  try {
    // Check if admin session exists
    if (req.session && req.session.admin_id) {
      const admin = await User.findById(req.session.admin_id);

      // Validate admin user and ensure they are not blocked
      if (admin && admin.isAdmin && !admin.isBlocked) {
        res.locals.admin = admin; // Pass admin to views
        return next();
      }
    }

    // Not authenticated or invalid session
    return res.redirect('/admin-login');
  } catch (error) {
    console.error('Admin Auth Middleware Error:', error);
    return res.status(500).render('error', { message: 'Authentication error' });
  }
},



//For user
isUserAuthenticated : async (req, res, next) => {
  try {
    // Support both normal and Google login
    const userId = req.session.userId || req.session.googleUserId;

    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId);

    // Check if user exists and is not blocked
    if (user && !user.isBlocked) {
      res.locals.user = user; // Make user data available in views
      return next();
    }

    // Blocked or invalid user - clear session and redirect
    req.session.destroy((err) => {
      if (err) console.error('Error destroying session:', err);
    });
    res.clearCookie('connect.sid');
    return res.redirect('/login?blocked=true');
  } catch (error) {
    console.error('User Auth Middleware Error:', error);
    return res.status(500).render('error', { message: 'Authentication error' });
  }
},



// Middleware to redirect authenticated users away from login/signup pages
redirectIfAuthenticated : async (req, res, next) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    
    if (userId) {
      const user = await User.findById(userId);
      
      // If user exists and is not blocked, redirect to dashboard
      if (user && !user.isBlocked) {
        return res.redirect('/dashboard');
      }
      
      // If user is blocked or doesn't exist, clear session and continue
      req.session.destroy((err) => {
        if (err) console.error('Error destroying session:', err);
      });
      res.clearCookie('connect.sid');
    }
    
    next();
  } catch (error) {
    console.error('Redirect Auth Middleware Error:', error);
    next(); // Continue to login/signup page on error
  }
},



// Enhanced session validation middleware
validateSession : async (req, res, next) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    
    if (userId) {
      const user = await User.findById(userId);
      
      // If user doesn't exist or is blocked, clear session
      if (!user || user.isBlocked) {
        req.session.destroy((err) => {
          if (err) console.error('Error destroying session:', err);
        });
        res.clearCookie('connect.sid');
        
        // Set user context to null for views
        res.locals.user = null;
        return next();
      }
      
      // Valid session - set user context
      res.locals.user = user;
    } else {
      res.locals.user = null;
    }
    
    next();
  } catch (error) {
    console.error('Session Validation Error:', error);
    res.locals.user = null;
    next();
  }
},



preventCache : (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  }
};



module.exports = authMiddleware;
