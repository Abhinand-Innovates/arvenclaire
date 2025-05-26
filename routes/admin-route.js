const express = require ("express");
const adminRoute = express.Router();
const adminController = require("../controllers/admin/admin-controller");

const { isAdminAuthenticated, isAdminNotAuthenticated, preventCache } = require('../middlewares/admin-middleware');

adminRoute.get('/admin-login', isAdminNotAuthenticated, preventCache, adminController.getAdminLogin);
adminRoute.post('/admin-login', isAdminNotAuthenticated, adminController.postAdminLogin);

adminRoute.use(isAdminAuthenticated);
adminRoute.use(preventCache);

adminRoute.get('/admin-dashboard', adminController.getAdminDashboard);
adminRoute.get('/admin-logout', adminController.logoutAdminDashboard);


module.exports = adminRoute;