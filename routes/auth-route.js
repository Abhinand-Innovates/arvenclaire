const express = require ("express");
const router = express.Router();
const passport = require("passport");
const authController = require("../controllers/auth/auth-controller");



router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}));
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/signup"}),(req,res) => {
    req.session.userId = req.user._id;
    res.redirect("/dashboard");
});


router.get("/",authController.loadLanding);
router.get("/signup",authController.loadSignup);
router.get("/login",authController.loadLogin);
router.post("/signup",authController.signup);

router.get("/verify-otp",authController.loadOtpPage);
router.post("/verify-otp",authController.verifyOtp);
router.post("/resend-otp",authController.resendOtp);
router.post("/login",authController.login);
router.get("/dashboard",authController.loadDashboard);

router.get("/forgot-password",authController.loadForgotPassword);
router.post('/forgot-password',authController.verifyForgotPasswordEmail );

router.get("/forgot-verify-otp",authController.loadForgotVerifyOtp);
router.post("/forgot-verify-otp",authController.verifyForgotPasswordOtp);
router.post("/resend-forgot-verify-otp",authController.resendForgotPasswordOtp);
router.get("/new-password",authController.loadNewPassword);
router.post("/reset-password",authController.resetPassword);









module.exports = router;