
const User = require('../models/user-schema');



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

module.exports = isAdminAuthenticated;
