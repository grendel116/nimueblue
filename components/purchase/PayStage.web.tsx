import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { theme } from "@/constants/theme";
import {
  confirmPurchaseIntent,
  formatMoney,
  MIRLO_STRIPE_PUBLISHABLE_KEY,
  type DeferredQuote,
} from "@/queries/listener";
import type { PayStageProps } from "./useCheckout";
import { Card, Loading, PrimaryButton, SecondaryButton } from "./ui";

function InAppCheckoutForm({
  deferred,
  guestEmail,
  onPaid,
  onCancel,
}: {
  deferred: DeferredQuote;
  guestEmail?: string;
  onPaid: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [ready, setReady] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setErrorMessage(undefined);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message || "Please check your payment details.");
        setSubmitting(false);
        return;
      }

      // Step 2: Retrieve clientSecret from Mirlo backend
      const purchaseRes = await confirmPurchaseIntent({
        checkoutId: deferred.checkoutId,
        amount: deferred.amount,
        email: guestEmail,
      });

      if (!purchaseRes?.clientSecret) {
        throw new Error("Could not initialize payment session with Mirlo.");
      }

      // Step 3: Confirm payment (or setup intent for recurring subscriptions) directly with Stripe
      const isSetup = deferred.mode === "setup" || purchaseRes.clientSecret.startsWith("seti_");
      const res = isSetup
        ? await stripe.confirmSetup({
            elements,
            clientSecret: purchaseRes.clientSecret,
            confirmParams: {
              return_url: window.location.href,
            },
            redirect: "if_required",
          })
        : await stripe.confirmPayment({
            elements,
            clientSecret: purchaseRes.clientSecret,
            confirmParams: {
              return_url: window.location.href,
              receipt_email: guestEmail,
            },
            redirect: "if_required",
          });

      if (res.error) {
        setErrorMessage(res.error.message || "Payment failed. Please try again.");
        setSubmitting(false);
      } else {
        onPaid();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Payment failed. Please try again.");
      setSubmitting(false);
    }
  };

  const amountFormatted = formatMoney(deferred.amount, deferred.currency);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Complete Your Purchase</Text>
        <Text style={styles.subtitle}>
          Paying {amountFormatted} to {deferred.artistName}
        </Text>
      </View>

      <View style={styles.elementsContainer}>
        {!ready && (
          <View style={styles.loadingWrapper}>
            <Loading label="Preparing secure checkout..." />
          </View>
        )}
        <PaymentElement
          options={{ layout: "accordion" }}
          onReady={() => setReady(true)}
          onLoadError={(e) => setErrorMessage(e.error.message)}
        />
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={submitting ? "Processing Payment..." : `Pay ${amountFormatted}`}
          busy={submitting}
          disabled={!stripe || !elements || !ready || submitting}
          onPress={handlePay}
        />
        <SecondaryButton label="Cancel" disabled={submitting} onPress={onCancel} />
      </View>
    </Card>
  );
}

export function PayStage({ checkoutUrl, deferred, guestEmail, onPaid, onCancel }: PayStageProps) {
  const stripePromise = useMemo(() => {
    if (!deferred?.stripeAccountId) return null;
    return loadStripe(MIRLO_STRIPE_PUBLISHABLE_KEY, {
      stripeAccount: deferred.stripeAccountId,
    });
  }, [deferred?.stripeAccountId]);

  const options: StripeElementsOptions | undefined = useMemo(() => {
    if (!deferred) return undefined;
    return {
      mode: deferred.mode === "setup" ? "setup" : "payment",
      amount: deferred.amount || 100,
      currency: (deferred.currency || "usd").toLowerCase(),
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: theme.colors.primary,
          colorBackground: theme.colors.surfaceElevated,
          colorText: theme.colors.textPrimary,
          colorDanger: theme.colors.danger,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          borderRadius: `${theme.radius.md}px`,
          spacingUnit: "4px",
        },
        rules: {
          ".Input": {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.surfaceCardBorder,
            color: theme.colors.textPrimary,
            boxShadow: "none",
          },
          ".Input:focus": {
            borderColor: theme.colors.primary,
            boxShadow: `0 0 0 1px ${theme.colors.primary}`,
          },
          ".Label": {
            color: theme.colors.textSecondary,
            fontWeight: "500",
            fontSize: "13px",
            marginBottom: "4px",
          },
          ".Tab": {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.surfaceCardBorder,
            color: theme.colors.textSecondary,
          },
          ".Tab--selected": {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.primary,
            color: theme.colors.textPrimary,
          },
          ".TabIcon--selected": {
            fill: theme.colors.primary,
          },
          ".Block": {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.surfaceCardBorder,
          },
        },
      },
    };
  }, [deferred]);

  if (deferred && stripePromise && options) {
    return (
      <View style={styles.container}>
        <Elements stripe={stripePromise} options={options}>
          <InAppCheckoutForm
            deferred={deferred}
            guestEmail={guestEmail}
            onPaid={onPaid}
            onCancel={onCancel}
          />
        </Elements>
      </View>
    );
  }

  // Fallback if deferred quote wasn't generated
  return (
    <View style={styles.container}>
      <Card>
        <Loading label="Opening checkout..." />
        {checkoutUrl ? (
          <SecondaryButton
            label="Open Checkout"
            onPress={() => window.open(checkoutUrl, "_blank")}
          />
        ) : null}
        <SecondaryButton label="Cancel" onPress={onCancel} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontFamily: theme.typography.h1.fontFamily,
    fontSize: theme.typography.h1.fontSize,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: theme.typography.body.fontFamily,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
  },
  elementsContainer: {
    minHeight: 180,
    marginVertical: 12,
  },
  loadingWrapper: {
    paddingVertical: 24,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    marginVertical: 8,
  },
  actions: {
    gap: 10,
    marginTop: 16,
  },
});
