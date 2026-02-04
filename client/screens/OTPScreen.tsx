import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth } from "@/context/AuthContext";

type Props = NativeStackScreenProps<RootStackParamList, "OTPScreen">;

const OTPScreen = ({ route }: Props) => {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const phoneNumber = route.params?.phoneNumber || "";

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    if (text && index < 3) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length === 4) {
      setIsLoading(true);
      try {
        await login(phoneNumber);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleResend = () => {
    if (canResend) {
      setTimer(60);
      setCanResend(false);
      setOtp(["", "", "", ""]);
      inputs.current[0]?.focus();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <LinearGradient colors={["#FF8C00", "#FF6B00"]} style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container, { paddingTop: insets.top + 40 }]}
      >
        <Text style={styles.title}>تأكيد الرمز</Text>
        <Text style={styles.subtitle}>أدخل الرمز المرسل إلى هاتفك</Text>
        {phoneNumber ? (
          <Text style={styles.phoneText}>{phoneNumber}</Text>
        ) : null}

        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              style={styles.otpInput}
              keyboardType="number-pad"
              maxLength={1}
              onChangeText={(text) => handleChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              ref={(ref) => { inputs.current[index] = ref; }}
              value={digit}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.verifyButton,
            (otp.join("").length < 4 || isLoading) && styles.verifyButtonDisabled,
          ]}
          onPress={handleVerify}
          disabled={otp.join("").length < 4 || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FF6B00" size="small" />
          ) : (
            <Text style={styles.verifyText}>تأكيد</Text>
          )}
        </TouchableOpacity>

        <View style={styles.resendContainer}>
          {canResend ? (
            <TouchableOpacity onPress={handleResend}>
              <Text style={styles.resendLink}>إعادة إرسال الرمز</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.timerText}>
              إعادة الإرسال خلال {formatTime(timer)}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFF",
    marginBottom: 10,
    fontFamily: "Cairo_700Bold",
  },
  subtitle: {
    fontSize: 16,
    color: "#FFF",
    textAlign: "center",
    marginBottom: 10,
    opacity: 0.9,
    fontFamily: "Cairo_400Regular",
  },
  phoneText: {
    fontSize: 18,
    color: "#FFF",
    fontWeight: "bold",
    marginBottom: 30,
    fontFamily: "Cairo_700Bold",
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "80%",
    marginBottom: 40,
  },
  otpInput: {
    width: 65,
    height: 65,
    backgroundColor: "#FFF",
    borderRadius: 15,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "bold",
    color: "#FF6B00",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  verifyButton: {
    backgroundColor: "#FFF",
    width: "100%",
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  verifyButtonDisabled: {
    opacity: 0.7,
  },
  verifyText: {
    color: "#FF6B00",
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "Cairo_700Bold",
  },
  resendContainer: {
    marginTop: 10,
    alignItems: "center",
  },
  timerText: {
    color: "#FFF",
    fontSize: 14,
    opacity: 0.8,
    fontFamily: "Cairo_400Regular",
  },
  resendLink: {
    color: "#FFF",
    fontWeight: "bold",
    textDecorationLine: "underline",
    fontSize: 15,
    fontFamily: "Cairo_700Bold",
  },
});

export default OTPScreen;
