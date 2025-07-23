# ARVENCLAIRE E-commerce Platform

A full-featured e-commerce web application built with Node.js, Express.js, MongoDB, and EJS templating engine.

## 🚀 Features

### User Features
- **Authentication & Authorization**
  - User registration and login
  - Google OAuth integration
  - OTP verification for email
  - Password reset functionality
  - Session management with security

- **Product Management**
  - Browse products with advanced filtering
  - Product search functionality
  - Product reviews and ratings
  - Wishlist management
  - Featured products display

- **Shopping Experience**
  - Shopping cart functionality
  - Secure checkout process
  - Multiple payment options (Razorpay integration)
  - Order tracking and management
  - Invoice generation (PDF)

- **User Profile**
  - Profile management with photo upload
  - Address management
  - Order history
  - Wallet system
  - Referral program

- **Additional Features**
  - Coupon system
  - Return/refund requests
  - Email notifications
  - Responsive design

### Admin Features
- Product management (CRUD operations)
- Category and brand management
- Order management
- User management
- Coupon management
- Sales analytics and reporting

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Template Engine**: EJS
- **Authentication**: Passport.js (Local & Google OAuth)
- **Payment Gateway**: Razorpay
- **File Upload**: Multer with Sharp for image processing
- **Email Service**: Nodemailer
- **PDF Generation**: PDFKit
- **Session Management**: Express-session
- **Validation**: Express-validator
- **Security**: bcrypt for password hashing

## 📋 Prerequisites

Before running this application, make sure you have the following installed:

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn package manager

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ARVENCLAIRE
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory with the following variables:
   ```env
   PORT=3001
   MONGODB_URI=your_mongodb_connection_string
   NODEMAILER_EMAIL=your_email@gmail.com
   NODEMAILER_PASSWORD=your_app_password
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret
   PORTLINK=your_domain_url
   ```

4. **Start the application**
   ```bash
   npm start
   ```

   The application will be available at `http://localhost:3001`

## 📁 Project Structure

```
ARVENCLAIRE/
├── config/                 # Configuration files
│   ├── db.js              # Database connection
│   ├── multer-config.js   # File upload configuration
│   └── passport.js        # Passport authentication config
├── controllers/           # Route controllers
│   ├── admin/            # Admin controllers
│   └── user/             # User controllers
├── middleware/           # Custom middleware
├── models/              # Database schemas
├── public/              # Static files (CSS, JS, images)
├── routes/              # Route definitions
│   ├── admin-route.js   # Admin routes
│   └── user-route.js    # User routes
├── utils/               # Utility functions
├── validator/           # Validation schemas
├── views/               # EJS templates
│   ├── admin/          # Admin views
│   └── user/           # User views
├── server.js           # Main application file
└── package.json        # Dependencies and scripts
```

## 🔐 Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3001) |
| `MONGODB_URI` | MongoDB connection string |
| `NODEMAILER_EMAIL` | Email for sending notifications |
| `NODEMAILER_PASSWORD` | App password for email service |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RAZORPAY_KEY_ID` | Razorpay payment gateway key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay payment gateway secret |
| `PORTLINK` | Production domain URL |

## 🚦 API Endpoints

### User Routes
- `GET /` - Landing page
- `GET /signup` - User registration page
- `GET /login` - User login page
- `GET /dashboard` - User dashboard
- `GET /shop` - Product listing
- `GET /product/:id` - Product details
- `GET /cart` - Shopping cart
- `GET /checkout` - Checkout page
- `GET /orders` - Order history
- `GET /profile` - User profile
- `GET /wishlist` - User wishlist
- `GET /wallet` - User wallet

### Admin Routes
- Admin panel with full CRUD operations for products, categories, users, and orders

## 🔒 Security Features

- Password hashing with bcrypt
- Session-based authentication
- CSRF protection
- Input validation and sanitization
- Secure cookie configuration
- Rate limiting on sensitive routes
- User session management

## 📱 Responsive Design

The application is fully responsive and works seamlessly across:
- Desktop computers
- Tablets
- Mobile devices

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 👨‍💻 Author

**Abhinand S**

## 🐛 Bug Reports

If you find any bugs or issues, please report them by creating an issue in the repository.

## 📞 Support

For support and questions, please contact the development team or create an issue in the repository.

---

**Note**: Make sure to configure all environment variables properly before running the application. The application requires active MongoDB, email service, and payment gateway configurations to function correctly.