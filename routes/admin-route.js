const express = require("express");
const adminRoute = express.Router();

const adminController = require("../controllers/admin/admin-auth-controller");
const getUsersController = require("../controllers/admin/get-usersController");
const getCategoryController = require("../controllers/admin/get-categoryController")

const { isAdminAuthenticated, isAdminNotAuthenticated, preventCache } = require("../middlewares/admin-middleware");

adminRoute.get("/admin-login", isAdminNotAuthenticated, preventCache, adminController.getAdminLogin);
adminRoute.post("/admin-login", isAdminNotAuthenticated, adminController.postAdminLogin);

adminRoute.use(isAdminAuthenticated);
adminRoute.use(preventCache);

//Admin Dashboard
adminRoute.get("/admin-dashboard", adminController.getAdminDashboard);
adminRoute.get("/admin-logout", adminController.logoutAdminDashboard);

//User Management
adminRoute.get("/get-user", getUsersController.getUsers);
adminRoute.get("/api/users", getUsersController.getUsersApi);
adminRoute.get("/api/users/:id", getUsersController.getUserById);
adminRoute.put("/api/users/:id/block", getUsersController.blockUser);
adminRoute.put("/api/users/:id/unblock", getUsersController.unblockUser);


//Category Management
adminRoute.get('/get-categories',getCategoryController.getCategory);




module.exports = adminRoute;