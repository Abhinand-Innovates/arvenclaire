const express = require ("express");
const adminRoute = express.Router();
const adminController = require("../controllers/admin/admin-controller");
const getUsersController = require("../controllers/admin/get-users")


const { isAdminAuthenticated, isAdminNotAuthenticated, preventCache } = require('../middlewares/admin-middleware');

adminRoute.get('/admin-login', isAdminNotAuthenticated, preventCache, adminController.getAdminLogin);
adminRoute.post('/admin-login', isAdminNotAuthenticated, adminController.postAdminLogin);

adminRoute.use(isAdminAuthenticated);
adminRoute.use(preventCache);

adminRoute.get('/admin-dashboard', adminController.getAdminDashboard);
adminRoute.get('/admin-logout', adminController.logoutAdminDashboard);

adminRoute.get("/get-user",getUsersController.getUsers)
adminRoute.put('/getUsers/:id/block',getUsersController.blockUser);
adminRoute.put('/getUsers/:id/unblock',getUsersController.unblockUser);





module.exports = adminRoute;