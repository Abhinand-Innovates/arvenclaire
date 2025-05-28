
const User = require("../models/user-schema");

const userMiddleware = async (req, res, next) => {
  res.locals.user = null;

  if (req.isAuthenticated() && req.user) {
    res.locals.user = req.user;
    
   
    if (!req.session.user_id) {
      req.session.user_id = req.user._id;
    }
  } 
  
  if (req.session && req.session.user_id) {
    try {
      const user = await User.findById(req.session.user_id);
      res.locals.user = user;
    } catch (error) {
      console.log("Error fetching user:", error);
    }
  }
  
  next();
};



// Middleware to restrict blocked users
const restrictBlockedUser = async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No active session",
      });
    }

    const user = await User.findById(req.session.userId);
    if (user && user.isBlocked) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destruction error:", err);
          return res.status(500).json({
            success: false,
            message: "Server error during session cleanup",
          });
        }
        res.clearCookie("connect.sid");
        return res.redirect("/login");
      });
    } else {
      next();
    }
  } catch (error) {
    console.error("Error in restrictBlockedUser middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


module.exports = {

  userMiddleware,
  restrictBlockedUser,
}