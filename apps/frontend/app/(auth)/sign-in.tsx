import { useSignIn, useSSO } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthShell } from "../../components/auth/auth-shell";
import { Button, Divider, Field, Text } from "../../components/ui";
import { useTheme } from "../../theme";

export default function SignInScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSignIn() {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/track");
        return;
      }
      // The account asks for a second step; Balance only offers the emailed code.
      await signIn.prepareSecondFactor({ strategy: "email_code" });
      setAwaitingCode(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That email and password didn't match.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    if (!isLoaded) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({ strategy: "email_code", code });
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

  async function onSSO(strategy: "oauth_google" | "oauth_apple") {
    setError(null);
    try {
      const { createdSessionId, setActive: setActiveSSO } = await startSSOFlow({ strategy });
      if (createdSessionId && setActiveSSO) {
        await setActiveSSO({ session: createdSessionId });
        router.replace("/track");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in didn't finish.");
    }
  }

  if (awaitingCode) {
    return (
      <AuthShell tagline={`We sent a code to ${email}.`}>
        <Field value={code} onChangeText={setCode} placeholder="Verification code" keyboardType="numeric" mono />
        {error ? (
          <Text role="label" tone="danger">
            {error}
          </Text>
        ) : null}
        <Button label="Verify" onPress={onVerify} loading={loading} disabled={!code} />
      </AuthShell>
    );
  }

  return (
    <AuthShell tagline="Pick up your week where you left it.">
      <View style={{ gap: spacing.sm }}>
        <Field value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
        <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
      </View>

      {error ? (
        <Text role="label" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button label="Sign in" onPress={onSignIn} loading={loading} disabled={!email || !password} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Divider />
        </View>
        <Text role="micro" tone="faint">
          or
        </Text>
        <View style={{ flex: 1 }}>
          <Divider />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button label="Continue with Google" variant="outline" onPress={() => onSSO("oauth_google")} />
        <Button label="Continue with Apple" variant="outline" onPress={() => onSSO("oauth_apple")} />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.xs }}>
        <Text role="label" tone="muted">
          New here?
        </Text>
        <Link href="/sign-up">
          <Text role="label" color={colors.text}>
            Create an account
          </Text>
        </Link>
      </View>
    </AuthShell>
  );
}
