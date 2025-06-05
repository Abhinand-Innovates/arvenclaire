const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/user-controller");


// Google OAuth routes
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signup" }),
  (req, res) => {
    req.session.userId = req.user._id;
    res.redirect("/dashboard");
  }
);


// Public routes
router.get("/", userController.loadLanding);
router.get("/signup", userController.loadSignup);
router.get("/login", userController.loadLogin);
router.post("/signup", userController.signup);

router.get("/verify-otp", userController.loadOtpPage);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.post("/login", userController.login);

// Protected route: Dashboard
router.get("/dashboard",userController.loadDashboard);

// Forgot password routes
router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.verifyForgotPasswordEmail);

router.get("/forgot-verify-otp", userController.loadForgotVerifyOtp);
router.post("/forgot-verify-otp", userController.verifyForgotPasswordOtp);
router.post("/resend-forgot-verify-otp", userController.resendForgotPasswordOtp);
router.get("/new-password", userController.loadNewPassword);
router.post("/reset-password", userController.resetPassword);

router.get("/logout", userController.logout);

module.exports = router;