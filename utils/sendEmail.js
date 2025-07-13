const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();


const sendEmail = async (email, otp, purpose = "account verification") => {
  try {
    // Define purpose-specific content
    const purposeConfig = {
      "signup": {
        title: "Account Registration",
        description: "complete your account registration",
        action: "sign up"
      },
      "forgot password": {
        title: "Password Reset",
        description: "reset your password",
        action: "password reset"
      },
      "change email": {
        title: "Email Change",
        description: "change your email address",
        action: "email change"
      },
      "account verification": {
        title: "Account Verification",
        description: "verify your account",
        action: "account verification"
      }
    };

    const config = purposeConfig[purpose.toLowerCase()] || purposeConfig["account verification"];

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: `"Arvenclaire Support" <${process.env.NODEMAILER_EMAIL}>`,
      to: email,
      subject: `This is your One-Time Password for Arvenclaire - ${config.title}`,
      text: `
Hello,

Thank you for choosing Arvenclaire.

Your One-Time Password for ${config.action} is: ${otp}

Please use this code to ${config.description}. Do not share this OTP with anyone.

If you didn't request this, please ignore this email.

Thanks,
Arvenclaire Support Team
      `,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OTP Verification - Arvenclaire</title>
</head>
<body style="margin: 0; padding: 20px; background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); padding: 40px 30px; text-align: center; border-bottom: 2px solid #e9ecef;">
            <h1 style="color: #000000; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 1px;">ARVENCLAIRE</h1>
            <p style="color: #000000; margin: 12px 0 0 0; font-size: 18px; font-weight: 500;">${config.title}</p>
            <p style="color: #6c757d; margin: 8px 0 0 0; font-size: 14px;">Secure verification for your account</p>
        </div>

        <!-- Content -->
        <div style="padding: 50px 40px; background-color: #ffffff;">
            <p style="color: #000000; font-size: 18px; margin: 0 0 20px 0;">Hello,</p>
            
            <p style="color: #000000; font-size: 16px; margin: 0 0 25px 0; line-height: 1.6;">Thank you for choosing <strong>Arvenclaire</strong>.</p>
            
            <p style="color: #000000; font-size: 16px; margin: 0 0 20px 0; line-height: 1.6;">We received a request to ${config.description} for your Arvenclaire account. To ensure your account security, please verify this action using the code below.</p>
            
            <p style="color: #000000; font-size: 16px; margin: 0 0 15px 0; font-weight: bold;">Purpose: ${config.action}</p>
            
            <p style="color: #000000; font-size: 16px; margin: 0 0 30px 0; line-height: 1.6;">Your One-Time Password to ${config.description} is:</p>
            
            <!-- OTP Display -->
            <div style="text-align: center; margin: 40px 0;">
                <div style="background: linear-gradient(135deg, #000000 0%, #2c2c2c 100%); color: #ffffff; font-size: 36px; font-weight: bold; padding: 25px 35px; border-radius: 12px; display: inline-block; letter-spacing: 8px; box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2); border: 3px solid #ffffff;">${otp}</div>
            </div>
            
            <p style="color: #d32f2f; font-size: 16px; margin: 30px 0 20px 0; text-align: center; font-weight: bold;">⏰ This code will expire in <strong style="color: #c62828;">30 seconds</strong> - Please enter it quickly!</p>
            
            <p style="color: #000000; font-size: 16px; margin: 0 0 25px 0; line-height: 1.6;">Please enter this code in the app to verify your account.</p>
            
            <p style="color: #000000; font-size: 16px; margin: 0 0 15px 0; font-weight: bold;">How to use this code:</p>
            <p style="color: #000000; font-size: 16px; margin: 0 0 8px 0; line-height: 1.6;">1. Return to the Arvenclaire application</p>
            <p style="color: #000000; font-size: 16px; margin: 0 0 8px 0; line-height: 1.6;">2. Enter the 6-digit code exactly as shown above</p>
            <p style="color: #000000; font-size: 16px; margin: 0 0 25px 0; line-height: 1.6;">3. Complete your ${config.action} process</p>
            
            <p style="color: #000000; font-size: 16px; margin: 0 0 10px 0; font-weight: bold;">🔒 Security Notice:</p>
            <p style="color: #000000; font-size: 16px; margin: 0 0 40px 0; line-height: 1.6;">If you didn't request this ${config.action}, please ignore this email and consider changing your password for security.</p>
            
            <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #e9ecef;">
                <p style="color: #000000; font-size: 16px; margin: 0 0 5px 0;">Thanks,</p>
                <p style="color: #000000; font-size: 16px; font-weight: bold; margin: 0;">Arvenclaire Support Team</p>
            </div>
        </div>

        <!-- Footer -->
        <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 30px; text-align: center; border-top: 2px solid #dee2e6;">
            <p style="color: #6c757d; font-size: 13px; margin: 0 0 8px 0;">© 2024 Arvenclaire. All rights reserved.</p>
            <p style="color: #6c757d; font-size: 12px; margin: 0;">This is an automated message, please do not reply to this email.</p>
        </div>
    </div>

    <!-- Mobile Responsive Styles -->
    <style>
        @media only screen and (max-width: 600px) {
            body {
                padding: 10px !important;
            }
            .email-container {
                margin: 0 !important;
                border-radius: 8px !important;
            }
            .content-padding {
                padding: 30px 25px !important;
            }
            .otp-code {
                font-size: 28px !important;
                letter-spacing: 4px !important;
                padding: 20px 25px !important;
            }
        }
    </style>
</body>
</html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return info.accepted.length > 0;

  } catch (error) {
    console.error("Error sending email:", error.message);
    return false;
  }
};



module.exports = sendEmail;