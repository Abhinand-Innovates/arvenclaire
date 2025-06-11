const express = require("express");
const adminRoute = express.Router();

const adminController = require("../controllers/admin/admin-auth-controller");
const getUsersController = require("../controllers/admin/get-usersController");
const getCategoryController = require("../controllers/admin/get-categoryController");
const productController = require("../controllers/admin/product-controller");
const { productUpload, handleMulterError } = require("../config/multer-config");

const { isAdminAuthenticated, noCache } = require('../middleware/auth-middleware');

//Admin Login
adminRoute.get("/admin-login",adminController.getAdminLogin);
adminRoute.post("/admin-login",adminController.postAdminLogin);


//Admin Dashboard
adminRoute.get("/admin-dashboard", isAdminAuthenticated, noCache, adminController.getAdminDashboard);
adminRoute.get("/admin-logout", isAdminAuthenticated, noCache, adminController.logoutAdminDashboard);


//User Management
adminRoute.get("/get-user", isAdminAuthenticated, noCache, getUsersController.getUsers);
adminRoute.get("/get-users", isAdminAuthenticated, noCache, getUsersController.getUsersApi);
adminRoute.get("/get-users/:id", isAdminAuthenticated, noCache, getUsersController.getUserById);
adminRoute.put("/get-users/:id/block", isAdminAuthenticated, noCache, getUsersController.blockUser);
adminRoute.put("/get-users/:id/unblock", isAdminAuthenticated, noCache, getUsersController.unblockUser);


// Category Management
adminRoute.get('/get-category', isAdminAuthenticated, noCache, getCategoryController.renderCategoryManagementPage);
adminRoute.get('/get-categories', isAdminAuthenticated, noCache, getCategoryController.getAllCategoriesAPI);
adminRoute.post('/get-categories', isAdminAuthenticated, noCache, getCategoryController.addCategoryAPI);
adminRoute.put('/get-categories/:id', isAdminAuthenticated, noCache, getCategoryController.updateCategoryAPI);
adminRoute.patch('/get-categories/:id/status', isAdminAuthenticated, noCache, getCategoryController.toggleCategoryStatusAPI);

// Product Management Routes
adminRoute.get('/get-product', isAdminAuthenticated, noCache, productController.getProducts);
adminRoute.get('/add-product', isAdminAuthenticated, noCache, productController.getAddProduct);
adminRoute.get('/edit-product/:id', isAdminAuthenticated, noCache, productController.getEditProduct);


// Product API Routes
adminRoute.post('/api/products', isAdminAuthenticated, noCache, productUpload.array('productImages', 10), handleMulterError, productController.addProduct);
adminRoute.get('/api/products/:id', isAdminAuthenticated, noCache, productController.getProductById);
adminRoute.put('/api/products/:id', isAdminAuthenticated, noCache, productUpload.array('productImages', 10), handleMulterError, productController.updateProduct);
adminRoute.delete('/api/products/:id', isAdminAuthenticated, noCache, productController.deleteProduct);
adminRoute.patch('/api/products/:id/status', isAdminAuthenticated, noCache, productController.toggleProductStatus);

// API for user dashboard
adminRoute.get('/api/products-for-user', isAdminAuthenticated, noCache, productController.getProductsForUser);




module.exports = adminRoute;