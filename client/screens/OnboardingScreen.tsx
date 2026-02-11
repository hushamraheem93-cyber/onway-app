import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

const { width, height } = Dimensions.get('window');

type RootStackParamList = {
  UserType: undefined;
  PhoneLogin: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const slides = [
  {
    id: 1,
    title: 'اطلب ما تريد',
    description: 'آلاف المنتجات من متاجر موثوقة في انتظارك',
    icon: '🛒',
    gradient: ['#FF6B35', '#FF8C61'],
  },
  {
    id: 2,
    title: 'توصيل سريع',
    description: 'نوصل طلبك لباب بيتك في أسرع وقت ممكن',
    icon: '🚚',
    gradient: ['#FF8C61', '#FFB088'],
  },
  {
    id: 3,
    title: 'تتبع طلبك',
    description: 'تابع طلبك لحظة بلحظة حتى يصلك',
    icon: '📍',
    gradient: ['#FFB088', '#FFD4B5'],
  },
];

export default function OnboardingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const handleNext = () => {
    if (currentPage < slides.length - 1) {
      pagerRef.current?.setPage(currentPage + 1);
    } else {
      navigation.navigate('UserType');
    }
  };

  const handleSkip = () => {
    navigation.navigate('UserType');
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#FFFFFF', '#FFF5F0']}
        style={styles.gradient}
      >
        {/* Skip Button */}
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>تخطي</Text>
        </TouchableOpacity>

        {/* Pager */}
        <PagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
        >
          {slides.map((slide) => (
            <View key={slide.id} style={styles.slide}>
              <LinearGradient
                colors={slide.gradient}
                style={styles.iconContainer}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.icon}>{slide.icon}</Text>
              </LinearGradient>

              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>
            </View>
          ))}
        </PagerView>

        {/* Dots Indicator */}
        <View style={styles.dotsContainer}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentPage === index && styles.activeDot,
              ]}
            />
          ))}
        </View>

        {/* Next/Start Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#FF6B35', '#FF8C61']}
            style={styles.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.buttonText}>
              {currentPage === slides.length - 1 ? 'ابدأ الآن' : 'التالي'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
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
  },
  skipButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  skipText: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 16,
    color: '#666',
  },
  pager: {
    flex: 1,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 60,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  icon: {
    fontSize: 100,
  },
  title: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 32,
    color: '#2C3E50',
    marginBottom: 20,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 18,
    color: '#7F8C8D',
    textAlign: 'center',
    lineHeight: 28,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DDD',
  },
  activeDot: {
    width: 24,
    backgroundColor: '#FF6B35',
  },
  button: {
    marginHorizontal: 20,
    marginBottom: 40,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
});
