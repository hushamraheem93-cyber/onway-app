export type RootStackParamList = {
  Onboarding: undefined;
  PhoneLogin: { userType?: 'customer' | 'driver' };
  OtpVerification: { 
    phoneNumber: string; 
    userType: 'customer' | 'driver';
    sentCode: string; // أضف هذا
  };
  // ... باقي الـ types
};
