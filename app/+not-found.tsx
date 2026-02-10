import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { AlertCircle } from "lucide-react-native";
import Colors from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View style={styles.container}>
        <AlertCircle size={64} color={Colors.dark.textMuted} />
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.subtitle}>The page you are looking for does not exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to Home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: Colors.dark.background,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
    marginTop: 20,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  link: {
    marginTop: 24,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  linkText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
