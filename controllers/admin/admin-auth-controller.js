const User = require("../../models/user-schema")
const bcrypt = require("bcrypt");

const getAdminLogin = async (req, res) => {
  try {
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

    const admin = await User.findOne({ email, isAdmin: true });

    if (!admin) {
      return res.status(401).json({ success: false, message: "Administrator not found" });
    }

    if (admin.isBlocked) {
      return res.status(403).json({ success: false, message: "This admin account has been blocked" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    req.session.admin_id = admin._id;

    return res.status(200).json({
      success: true,
      message: "Welcome Admin",
      redirectTo: '/admin-dashboard',
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ success: false, message: "Admin login error" });
  }
};



const getAdminDashboard = async (req, res) => {
  try {
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
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).send('Something went wrong.');
      }

      res.clearCookie('connect.sid', { path: '/' });  // Ensure correct cookie name and path
      return res.redirect('/admin-login');
    });
  } catch (error) {
    console.error('Error in AdminLogout:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};



module.exports = { 
  getAdminLogin, 
  postAdminLogin, 
  getAdminDashboard, 
  logoutAdminDashboard 
};