import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  PhoneLogin: { userType: 'customer' | 'driver' };
  MainTabs: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function UserTypeScreen() {
  const navigation = useNavigation<NavigationProp>();

  const handleSelectUserType = (userType: 'customer' | 'driver') => {
    console.log('Selected user type:', userType); // للتأكد من الضغط
    navigation.navigate('PhoneLogin', { userType });
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#FFFFFF', '#FFF5F0']}
        style={styles.gradient}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoOn}>On</Text>
          <Text style={styles.logoWay}>Way</Text>
        </View>

        <Text style={styles.subtitle}>انضم إلينا كـ</Text>

        {/* Customer Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleSelectUserType('customer')}
        >
          <LinearGradient
            colors={['#FF6B35', '#FF8C61']}
            style={styles.card}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.cardContent}>
              <View style={styles.iconCircle}>
                <Text style={styles.cardIcon}>🛒</Text>
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.cardTitle}>عميل</Text>
                <Text style={styles.cardDescription}>
                  اطلب واحصل على توصيل سريع
                </Text>
              </View>
              <Text style={styles.arrow}>←</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Driver Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleSelectUserType('driver')}
        >
          <LinearGradient
            colors={['#2C3E50', '#34495E']}
            style={styles.card}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.cardContent}>
              <View style={styles.iconCircle}>
                <Text style={styles.cardIcon}>🚗</Text>
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.cardTitle}>سائق</Text>
                <Text style={styles.cardDescription}>
                  انضم كسائق واربح المال
                </Text>
              </View>
              <Text style={styles.arrow}>←</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          باختيارك لأحد الخيارات، أنت توافق على{'\n'}
          <Text style={styles.link}>شروط الخدمة</Text>
          {' و '}
          <Text style={styles.link}>سياسة الخصوصية</Text>
        </Text>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  gradient: {
    flex: 1,
    paddingHorizontal: 20,
  },
  logoContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginTop: 60,
    marginBottom: 20,
  },
  logoOn: {
    fontFamily: 'Kanit-Black',
    fontSize: 56,
    color: '#FF6B35',
    letterSpacing: -2,
  },
  logoWay: {
    fontFamily: 'Kanit-Black',
    fontSize: 56,
    color: '#2C3E50',
    letterSpacing: -2,
  },
  subtitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 24,
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 40,
  },
  card: {
    borderRadius: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  cardIcon: {
    fontSize: 36,
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 26,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardDescription: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  arrow: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 28,
    color: '#FFFFFF',
  },
  footer: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: '#95A5A6',
    textAlign: 'center',
    marginTop: 'auto',
    marginBottom: 30,
    lineHeight: 20,
  },
  link: {
    color: '#FF6B35',
    textDecorationLine: 'underline',
  },
});
