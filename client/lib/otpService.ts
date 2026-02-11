const OTPIQ_API_KEY = sk_live_e5c14cde0e1c442de063021bd51854666db7621e'sk_live_YOUR_FULL_KEY_HERE'; //6db7621e
const OTPIQ_API_URL = 'https://api.otpiq.com/api/sms';

export const sendOTP = async (phoneNumber: string): Promise<{ success: boolean; code?: string; error?: string }> => {
  try {
    // Generate 6-digit OTP
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const response = await fetch(OTPIQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OTPIQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber: phoneNumber, // مثال: "+9647700000000"
        smsType: 'otp', // أو 'verification' حسب الشركة
        verificationCode: verificationCode,
        customMessage: `رمز التحقق الخاص بك في OnWay هو: ${verificationCode}`,
        senderId: 'OnWay', // اسم المرسل
        provider: 'whatsapp', // أو 'sms' حسب الشركة
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return { 
        success: true, 
        code: verificationCode // نحفظه للتحقق لاحقاً
      };
    } else {
      console.error('OTP Send Error:', data);
      return { 
        success: false, 
        error: data.message || 'فشل إرسال رمز التحقق' 
      };
    }
  } catch (error) {
    console.error('OTP Service Error:', error);
    return { 
      success: false, 
      error: 'حدث خطأ في الاتصال' 
    };
  }
};

export const verifyOTP = (enteredCode: string, sentCode: string): boolean => {
  return enteredCode === sentCode;
};
