const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/admin-controller");


router.get("/admin/login",adminController.loadAdminLogin)

module.exports = router;