const generateCouponCode = (prefix = '', length = 8) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix;
    
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return result;
};

const generateWelcomeCouponCode = () => {
    return generateCouponCode('WELCOME', 6);
};

const generateReferralRewardCouponCode = () => {
    return generateCouponCode('REFER', 6);
};

module.exports = {
    generateCouponCode,
    generateWelcomeCouponCode,
    generateReferralRewardCouponCode
};