import React, { useState, useRef } from 'react';
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
  PhoneLogin: { userType: 'customer' | 'driver' };
  OtpVerification: { 
    phoneNumber: string; 
    userType: 'customer' | 'driver';
    sentCode: string;
  };
  MainTabs: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PhoneLoginRouteProp = RouteProp<RootStackParamList, 'PhoneLogin'>;

export default function PhoneLoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PhoneLoginRouteProp>();
  const userType = route.params?.userType || 'customer';

  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleContinue = async () => {
    // Validate phone number
    if (phoneNumber.length < 10) {
      Alert.alert('خطأ', 'الرجاء إدخال رقم هاتف صحيح');
      return;
    }

    setLoading(true);

    // تخطي OTP مؤقتاً - للتجربة بدون سيرفر
    const fakeCode = '123456';

    setTimeout(() => {
      setLoading(false);
      Alert.alert('تم', 'تم إنشاء رمز تحقق تجريبي: 123456');

      navigation.navigate('OtpVerification', { 
        phoneNumber: `+964${phoneNumber}`,
        userType,
        sentCode: fakeCode,
      });
    }, 1000);
  };

  const handleGuestMode = () => {
    navigation.navigate('MainTabs');
  };

  const formatPhoneNumber = (text: string) => {
    // Remove non-numeric characters
    const cleaned = text.replace(/\D/g, '');
    // Limit to 10 digits
    return cleaned.substring(0, 10);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#FFFFFF', '#FFF5F0']}
          style={styles.gradient}
        >
          {/* Back Button */}
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backIcon}>→</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#FF6B35', '#FF8C61']}
                style={styles.iconGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.headerIcon}>
                  {userType === 'customer' ? '📱' : '🚗'}
                </Text>
              </LinearGradient>
            </View>

            <Text style={styles.title}>مرحباً بك في أون وي</Text>
            <Text style={styles.subtitle}>
              {userType === 'customer' 
                ? 'أدخل رقم هاتفك للبدء في التسوق أو التوصيل'
                : 'أدخل رقم هاتفك للانضمام كسائق'}
            </Text>
          </View>

          {/* Phone Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <View style={styles.countryCode}>
                <Text style={styles.flag}>🇮🇶</Text>
                <Text style={styles.code}>+964</Text>
              </View>

              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="780 000 0000"
                placeholderTextColor="#BDC3C7"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
                maxLength={10}
                textAlign="right"
                autoFocus
              />
            </View>

            {phoneNumber.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setPhoneNumber('')}
              >
                <Text style={styles.clearIcon}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={[
              styles.continueButton,
              phoneNumber.length < 10 && styles.continueButtonDisabled,
            ]}
            onPress={handleContinue}
            disabled={phoneNumber.length < 10 || loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={
                phoneNumber.length < 10
                  ? ['#BDC3C7', '#95A5A6']
                  : ['#FF6B35', '#FF8C61']
              }
              style={styles.continueGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.continueText}>متابعة</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Guest Mode */}
          {userType === 'customer' && (
            <TouchableOpacity
              style={styles.guestButton}
              onPress={handleGuestMode}
            >
              <Text style={styles.guestText}>المتابعة كضيف</Text>
            </TouchableOpacity>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              بالمتابعة، أنت توافق على{' '}
              <Text style={styles.link}>شروط الخدمة</Text>
              {'\n'}و
              <Text style={styles.link}> سياسة الخصوصية</Text>
            </Text>
          </View>
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
    marginBottom: 50,
  },
  iconContainer: {
    marginBottom: 30,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  headerIcon: {
    fontSize: 60,
  },
  title: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 28,
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
    paddingHorizontal: 20,
  },
  inputContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ECF0F1',
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#ECF0F1',
    gap: 8,
  },
  flag: {
    fontSize: 24,
  },
  code: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: '#2C3E50',
  },
  input: {
    flex: 1,
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 18,
    color: '#2C3E50',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  clearButton: {
    position: 'absolute',
    left: 30,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECF0F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearIcon: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  continueButton: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  continueButtonDisabled: {
    shadowOpacity: 0.1,
    elevation: 2,
  },
  continueGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  continueText: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  guestButton: {
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  guestText: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: '#FF6B35',
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  footerText: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: '#95A5A6',
    textAlign: 'center',
    lineHeight: 20,
  },
  link: {
    color: '#FF6B35',
    textDecorationLine: 'underline',
  },
});
