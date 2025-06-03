const express = require("express");
const adminRoute = express.Router();

const adminController = require("../controllers/admin/admin-auth-controller");
const getUsersController = require("../controllers/admin/get-usersController");
const getCategoryController = require("../controllers/admin/get-categoryController")
const getProductController = require("../controllers/admin/get-product-controller");

//Admin Login
adminRoute.get("/admin-login",adminController.getAdminLogin);
adminRoute.post("/admin-login",adminController.postAdminLogin);


//Admin Dashboard
adminRoute.get("/admin-dashboard", adminController.getAdminDashboard);
adminRoute.get("/admin-logout", adminController.logoutAdminDashboard);


//User Management
adminRoute.get("/get-user", getUsersController.getUsers);
adminRoute.get("/get-users", getUsersController.getUsersApi);
adminRoute.get("/get-users/:id", getUsersController.getUserById);
adminRoute.put("/get-users/:id/block", getUsersController.blockUser);
adminRoute.put("/get-users/:id/unblock", getUsersController.unblockUser);


// Category Management
adminRoute.get('/get-category', getCategoryController.renderCategoryManagementPage);
adminRoute.get('/get-categories', getCategoryController.getAllCategoriesAPI);
adminRoute.post('/get-categories', getCategoryController.addCategoryAPI);
adminRoute.put('/get-categories/:id', getCategoryController.updateCategoryAPI);
adminRoute.patch('/get-categories/:id/status', getCategoryController.toggleCategoryStatusAPI);


//Product Management
adminRoute.get('/get-product', getProductController.loadGetProducts);
adminRoute.get('/add-product', getProductController.loadNewProduct);



module.exports = adminRoute;