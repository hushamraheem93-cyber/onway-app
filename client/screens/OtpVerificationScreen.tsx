import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

type RootStackParamList = {
  OtpVerification: { 
    phoneNumber: string; 
    userType: 'customer' | 'driver';
    sentCode: string;
  };
  MainTabs: undefined;
  DriverHome: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type OtpVerificationRouteProp = RouteProp<RootStackParamList, 'OtpVerification'>;

const OTP_LENGTH = 6;
const RESEND_TIMEOUT = 60;

export default function OtpVerificationScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<OtpVerificationRouteProp>();
  const { phoneNumber, userType } = route.params;

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_TIMEOUT);
  const [canResend, setCanResend] = useState(false);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => {
        setResendTimer(resendTimer - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  const handleOtpChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');

    if (cleaned.length > 1) {
      const digits = cleaned.split('').slice(0, OTP_LENGTH);
      const newOtp = [...otp];
      digits.forEach((digit, i) => {
        if (index + i < OTP_LENGTH) {
          newOtp[index + i] = digit;
        }
      });
      setOtp(newOtp);

      const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
    } else {
      const newOtp = [...otp];
      newOtp[index] = cleaned;
      setOtp(newOtp);

      if (cleaned && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join('');

    if (otpCode.length !== OTP_LENGTH) {
      Alert.alert('خطأ', 'الرجاء إدخال رمز التحقق كاملاً');
      return;
    }

    setLoading(true);

    // تخطي التحقق - أي كود يشتغل للتجربة
    setTimeout(() => {
      setLoading(false);

      if (userType === 'customer') {
        navigation.navigate('MainTabs');
      } else {
        navigation.navigate('DriverHome');
      }
    }, 500);
  };

  const handleResend = async () => {
    if (!canResend) return;

    Alert.alert('تم', 'يمكنك إدخال أي رمز للتجربة');
    setResendTimer(RESEND_TIMEOUT);
    setCanResend(false);
    setOtp(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  useEffect(() => {
    if (otp.every(digit => digit !== '') && !loading) {
      handleVerify();
    }
  }, [otp]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#FFFFFF', '#FFF5F0']}
          style={styles.gradient}
        >
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backIcon}>→</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#FF6B35', '#FF8C61']}
                style={styles.iconGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.headerIcon}>📱</Text>
              </LinearGradient>
            </View>

            <Text style={styles.title}>التحقق من رقم الهاتف</Text>
            <Text style={styles.subtitle}>
              أدخل رمز التحقق{'\n'}
              <Text style={styles.phoneNumber}>{phoneNumber}</Text>
            </Text>
          </View>

          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <View key={index} style={styles.otpInputWrapper}>
                <TextInput
                  ref={(ref) => (inputRefs.current[index] = ref)}
                  style={[
                    styles.otpInput,
                    digit && styles.otpInputFilled,
                  ]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  textAlign="center"
                  selectTextOnFocus
                  autoFocus={index === 0}
                />
              </View>
            ))}
          </View>

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#FF6B35" size="large" />
              <Text style={styles.loadingText}>جاري التحقق...</Text>
            </View>
          )}

          <View style={styles.resendContainer}>
            {!canResend ? (
              <Text style={styles.timerText}>
                إعادة الإرسال بعد{' '}
                <Text style={styles.timerNumber}>{resendTimer}</Text>
                {' '}ثانية
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendText}>إعادة إرسال الرمز</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.editText}>تعديل رقم الهاتف</Text>
          </TouchableOpacity>

          {otp.some(digit => digit !== '') && !loading && (
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={handleVerify}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#FF6B35', '#FF8C61']}
                style={styles.verifyGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.verifyText}>تحقق</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </LinearGradient>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  gradient: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backIcon: {
    fontSize: 24,
    color: '#2C3E50',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 80,
    marginBottom: 60,
  },
  iconContainer: {
    marginBottom: 30,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  headerIcon: {
    fontSize: 50,
  },
  title: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 26,
    color: '#2C3E50',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 16,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 24,
  },
  phoneNumber: {
    fontFamily: 'Cairo_700Bold',
    color: '#FF6B35',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 40,
    gap: 12,
  },
  otpInputWrapper: {
    flex: 1,
    maxWidth: 50,
  },
  otpInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#ECF0F1',
    borderRadius: 12,
    height: 60,
    fontFamily: 'Cairo_700Bold',
    fontSize: 24,
    color: '#2C3E50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  otpInputFilled: {
    borderColor: '#FF6B35',
    backgroundColor: '#FFF5F0',
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  loadingText: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: '#FF6B35',
    marginTop: 12,
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  timerText: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 15,
    color: '#7F8C8D',
  },
  timerNumber: {
    fontFamily: 'Cairo_700Bold',
    color: '#FF6B35',
  },
  resendText: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 16,
    color: '#FF6B35',
    textDecorationLine: 'underline',
  },
  editButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  editText: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 15,
    color: '#7F8C8D',
    textDecorationLine: 'underline',
  },
  verifyButton: {
    marginHorizontal: 20,
    marginTop: 'auto',
    marginBottom: 40,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  verifyGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  verifyText: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
});
