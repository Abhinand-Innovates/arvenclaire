const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config();

const sendEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      }
    })

    transporter.verify((error, success) => {
  if (error) {
    console.log("Transporter verification error:", error);
  } else {
    console.log("Server is ready to send emails");
  }
});


    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`,
    })
    return info.accepted.length > 0;

  } catch (error) {
    console.log("err sending email", error.message);
    return false;
  }
}

module.exports = sendEmail;