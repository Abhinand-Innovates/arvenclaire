const express = require("express");
const app = express();
const bodyParser = require('body-parser');
const path = require("path");
const mongoose = require ("mongoose");
const cookieParser = require("cookie-parser");
const passport = require("./config/passport");
const env = require("dotenv").config();
const port = process.env.PORT || 3001;
const userRoute = require("./routes/user-route")
const adminRoute = require("./routes/admin-route")
const db = require("./config/db");
db();

const session = require('express-session');

app.use(session({
  secret: 'your_secret_key', 
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  },
  name: 'sessionId' // Custom session name
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(bodyParser.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine","ejs");
app.set("views",[path.join(__dirname,"views/user"),path.join(__dirname,"views/admin")])


app.use("/",adminRoute);
app.use("/",userRoute);


// Catch 404 and render error page
app.use((req, res, next) => {
  res.status(404).render('error', {
    status: 404,
    message: 'Page not found',
    error: {}
  });
}); 



app.listen(port,() => {
    console.log("server is running http://localhost:3001")
})




