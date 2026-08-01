import { useSignUp } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthShell } from "../../components/auth/auth-shell";
import { Button, Field, Text } from "../../components/ui";
import { useTheme } from "../../theme";

export default function SignUpScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSignUp() {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setAwaitingCode(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create that account.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/track");
      } else {
        setError("That code didn't work. Check the email and try again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      tagline={
        awaitingCode
          ? `We sent a six-digit code to ${email}.`
          : "Decide how your week should go, then see how it went."
      }
    >
      {awaitingCode ? (
        <>
          <Field value={code} onChangeText={setCode} placeholder="Verification code" keyboardType="numeric" mono />
          {error ? (
            <Text role="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Verify" onPress={onVerify} loading={loading} disabled={!code} />
        </>
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <Field value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
            <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
          </View>
          {error ? (
            <Text role="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Sign up" onPress={onSignUp} loading={loading} disabled={!email || !password} />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.xs }}>
            <Text role="label" tone="muted">
              Already have an account?
            </Text>
            <Link href="/sign-in">
              <Text role="label" color={colors.text}>
                Sign in
              </Text>
            </Link>
          </View>
        </>
      )}
    </AuthShell>
  );
}
