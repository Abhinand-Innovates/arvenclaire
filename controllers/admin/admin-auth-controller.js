const User = require("../../models/user-schema")
const bcrypt = require("bcrypt");

const getAdminLogin = async (req, res) => {
  try {
    // Check if admin is already logged in
    if (req.session && req.session.admin_id) {
      const admin = await User.findById(req.session.admin_id);
      
      // If admin exists and is not blocked, redirect to dashboard
      if (admin && admin.isAdmin && !admin.isBlocked) {
        return res.redirect('/admin-dashboard');
      }
      
      // If admin is blocked or doesn't exist, clear session and continue to login
      req.session.destroy((err) => {
        if (err) console.error('Error destroying admin session:', err);
      });
      res.clearCookie('connect.sid');
    }
    
    res.render("admin-login");
  } catch (error) {
    console.error("Error loading admin login page:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


const postAdminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find admin by email
    const admin = await User.findOne({ 
      email: email.toLowerCase().trim(), 
      isAdmin: true 
    });

    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    if (admin.isBlocked) {
      return res.status(403).json({ 
        success: false, 
        message: "This admin account has been blocked" 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // Regenerate session for security
    // req.session.regenerate((err) => {
    //   if (err) {
    //     console.error('Admin session regeneration error:', err);
    //     return res.status(500).json({
    //       success: false,
    //       message: "Login failed. Please try again.",
    //     });
    //   }

      // Set admin session data
      req.session.admin_id = admin._id;
      req.session.admin_email = admin.email;
      req.session.loginTime = new Date();

      // Save session before responding
      req.session.save((err) => {
        if (err) {
          console.error('Admin session save error:', err);
          return res.status(500).json({
            success: false,
            message: "Login failed. Please try again.",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Welcome Admin",
          redirectTo: '/admin-dashboard',
        });
      });


  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Admin login error" 
    });
  }
};



const getAdminDashboard = async (req, res) => {
  try {
    // This check is redundant since isAdminAuthenticated middleware handles it,
    // but keeping for extra safety
    if (!req.session.admin_id) {
      return res.redirect('/admin-login');
    }

    // Admin data is already available in res.locals.admin from middleware
    return res.render('admin-dashboard', {
      admin: res.locals.admin
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load Dashboard",
    });
  }
};


const logoutAdminDashboard = async (req, res) => {
  try {
    // Check if there's an active admin session
    if (!req.session.admin_id) {
      return res.redirect('/admin-login');
    }

    // Destroy session and clear cookies
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying admin session:', err);
        return res.status(500).json({
          success: false,
          message: "Failed to logout, Please try again",
        });
      }

      // Clear all session-related cookies
      res.clearCookie('connect.sid');
      
      // Also clear any other potential session cookies
      if (req.cookies) {
        Object.keys(req.cookies).forEach(cookieName => {
          res.clearCookie(cookieName);
        });
      }

      return res.redirect('/admin-login');
    });

  } catch (error) {
    console.error('Error in AdminLogout:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal Server Error' 
    });
  }
};



module.exports = { 
  getAdminLogin, 
  postAdminLogin, 
  getAdminDashboard, 
  logoutAdminDashboard 
};