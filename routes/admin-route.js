const express = require("express");
const adminRoute = express.Router();

const adminController = require("../controllers/admin/admin-auth-controller");
const getUsersController = require("../controllers/admin/get-usersController");
const getCategoryController = require("../controllers/admin/get-categoryController");
const productController = require("../controllers/admin/product-controller");
const orderController = require("../controllers/admin/order-controller");
const returnController = require("../controllers/admin/return-controller");
const { productUpload, handleMulterError } = require("../config/multer-config");

const couponController = require("../controllers/admin/coupon-controller");
const salesReportController = require("../controllers/admin/sales-report-controller");
const { isAdminAuthenticated, preventCache, redirectIfAdminAuthenticated } = require('../middleware/auth-middleware');

//Admin Login - with cache prevention for proper session handling and redirect if already authenticated
adminRoute.get("/admin-login", preventCache, redirectIfAdminAuthenticated, adminController.getAdminLogin);
adminRoute.post("/admin-login", redirectIfAdminAuthenticated, adminController.postAdminLogin);


//Admin Dashboard
adminRoute.get("/admin-dashboard", isAdminAuthenticated, preventCache, adminController.getAdminDashboard);
adminRoute.get("/admin-logout", isAdminAuthenticated, preventCache, adminController.logoutAdminDashboard);


//User Management
adminRoute.get("/get-user", isAdminAuthenticated, preventCache, getUsersController.getUsers);
adminRoute.get("/get-users", isAdminAuthenticated, preventCache, getUsersController.getUsersApi);
adminRoute.get("/get-users/:id", isAdminAuthenticated, preventCache, getUsersController.getUserById);
adminRoute.put("/get-users/:id/block", isAdminAuthenticated, preventCache, getUsersController.blockUser);
adminRoute.put("/get-users/:id/unblock", isAdminAuthenticated, preventCache, getUsersController.unblockUser);


// Category Management
adminRoute.get('/get-category', isAdminAuthenticated, preventCache, getCategoryController.renderCategoryManagementPage);
adminRoute.get('/get-categories', isAdminAuthenticated, preventCache, getCategoryController.getAllCategoriesAPI);
adminRoute.post('/get-categories', isAdminAuthenticated, preventCache, getCategoryController.addCategoryAPI);
adminRoute.put('/get-categories/:id', isAdminAuthenticated, preventCache, getCategoryController.updateCategoryAPI);
adminRoute.patch('/get-categories/:id/offer', isAdminAuthenticated, preventCache, getCategoryController.updateCategoryOfferAPI);
adminRoute.patch('/get-categories/:id/status', isAdminAuthenticated, preventCache, getCategoryController.toggleCategoryStatusAPI);
adminRoute.delete('/get-categories/:id', isAdminAuthenticated, preventCache, getCategoryController.deleteCategoryAPI);

// Product Management Routes
adminRoute.get('/get-product', isAdminAuthenticated, preventCache, productController.getProducts);
adminRoute.get('/add-product', isAdminAuthenticated, preventCache, productController.getAddProduct);
adminRoute.get('/edit-product/:id', isAdminAuthenticated, preventCache, productController.getEditProduct);


// Product API Routes
adminRoute.post('/api/products', isAdminAuthenticated, preventCache, productController.addProduct);
adminRoute.get('/api/products/:id', isAdminAuthenticated, preventCache, productController.getProductById);
adminRoute.put('/api/products/:id', isAdminAuthenticated, preventCache, productUpload.array('productImages', 10), handleMulterError, productController.updateProduct);
adminRoute.delete('/api/products/:id', isAdminAuthenticated, preventCache, productController.deleteProduct);
adminRoute.patch('/api/products/:id/status', isAdminAuthenticated, preventCache, productController.toggleProductStatus);

// API for user dashboard
adminRoute.get('/api/products-for-user', isAdminAuthenticated, preventCache, productController.getProductsForUser);

// Order Management Routes
adminRoute.get('/get-orders', isAdminAuthenticated, preventCache, orderController.getOrders);
adminRoute.get('/get-orders/:id/details', isAdminAuthenticated, preventCache, orderController.getOrderDetailsPage);
adminRoute.get('/get-orders/:id', isAdminAuthenticated, preventCache, orderController.getOrderById);
adminRoute.patch('/get-orders/:id/status', isAdminAuthenticated, preventCache, orderController.updateOrderStatus);



adminRoute.get('/return-requests', isAdminAuthenticated, preventCache, returnController.getReturnRequests);
adminRoute.get('/get-return-request-count', isAdminAuthenticated, preventCache, orderController.getReturnRequestCount);
adminRoute.post('/return-requests/:id/approve', isAdminAuthenticated, preventCache, returnController.approveReturnRequest);
adminRoute.post('/return-requests/:id/reject', isAdminAuthenticated, preventCache, returnController.rejectReturnRequest);


// Coupon Management
adminRoute.get("/coupons", isAdminAuthenticated, preventCache, couponController.getCouponsPage);
adminRoute.get("/add-coupon", isAdminAuthenticated, preventCache, couponController.getAddCouponPage);
adminRoute.post("/add-coupon", isAdminAuthenticated, preventCache, couponController.addCoupon);
adminRoute.get("/edit-coupon/:id", isAdminAuthenticated, preventCache, couponController.getEditCouponPage);
adminRoute.post("/edit-coupon/:id", isAdminAuthenticated, preventCache, couponController.updateCoupon);
adminRoute.put("/edit-coupon/:id", isAdminAuthenticated, preventCache, couponController.updateCoupon);
adminRoute.patch("/coupon/:id/status", isAdminAuthenticated, preventCache, couponController.toggleCouponStatus);
adminRoute.delete("/delete-coupon/:id", isAdminAuthenticated, preventCache, couponController.deleteCoupon);

// Sales Report Management
adminRoute.get("/sales-report", isAdminAuthenticated, preventCache, salesReportController.getSalesReport);
adminRoute.get("/sales-report/export-pdf", isAdminAuthenticated, preventCache, salesReportController.exportPDF);
adminRoute.get("/sales-report/export-excel", isAdminAuthenticated, preventCache, salesReportController.exportExcel);

module.exports = adminRoute;