
const User = require('../models/user-schema');


//For admin
const isAdminAuthenticated = async (req, res, next) => {
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
};



const isUserAuthenticated = async (req, res, next) => {
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

    // Blocked or invalid user
    req.session.destroy((err) => {
      if (err) console.error('Error destroying session:', err);
    });
    res.clearCookie('connect.sid');
    return res.redirect('/login?blocked=true');
  } catch (error) {
    console.error('User Auth Middleware Error:', error);
    return res.status(500).render('error', { message: 'Authentication error' });
  }
};



const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};


module.exports = {
  isAdminAuthenticated,
  isUserAuthenticated,
  noCache,
}
