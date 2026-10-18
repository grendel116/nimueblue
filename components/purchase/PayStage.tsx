import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { theme } from "@/constants/theme";
import {
  confirmPurchaseIntent,
  formatMoney,
  isCheckoutCompleteUrl,
  MIRLO_STRIPE_PUBLISHABLE_KEY,
  type DeferredQuote,
} from "@/queries/listener";
import type { PayStageProps } from "./useCheckout";
import { Loading, SecondaryButton } from "./ui";

function generateInAppStripeHtml(deferred: DeferredQuote, guestEmail?: string): string {
  const amountFormatted = formatMoney(deferred.amount, deferred.currency);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      background-color: ${theme.colors.background};
      color: ${theme.colors.textPrimary};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 16px;
    }
    h2 { font-size: 18px; margin: 0 0 4px 0; color: ${theme.colors.textPrimary}; }
    p { font-size: 14px; margin: 0 0 16px 0; color: ${theme.colors.textSecondary}; }
    #payment-element { margin-bottom: 16px; min-height: 180px; }
    #error-message { color: ${theme.colors.danger}; font-size: 13px; margin-bottom: 12px; }
    button {
      width: 100%;
      background-color: ${theme.colors.primary};
      color: ${theme.colors.background};
      font-weight: 700;
      font-size: 16px;
      padding: 14px;
      border: none;
      border-radius: ${theme.radius.md}px;
      cursor: pointer;
      box-shadow: 0 4px 12px ${theme.colors.primaryGlow};
    }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
  </style>
</head>
<body>
  <h2>Complete Your Purchase</h2>
  <p>Paying ${amountFormatted} to ${deferred.artistName}</p>
  <form id="payment-form">
    <div id="payment-element"></div>
    <div id="error-message"></div>
    <button id="submit-btn" type="submit" disabled>Loading payment options...</button>
  </form>

  <script>
    const stripe = Stripe('${MIRLO_STRIPE_PUBLISHABLE_KEY}', {
      stripeAccount: '${deferred.stripeAccountId}'
    });

    const appearance = {
      theme: 'night',
      variables: {
        colorPrimary: '${theme.colors.primary}',
        colorBackground: '${theme.colors.surfaceElevated}',
        colorText: '${theme.colors.textPrimary}',
        colorDanger: '${theme.colors.danger}',
        borderRadius: '${theme.radius.md}px',
        spacingUnit: '4px'
      }
    };

    const elements = stripe.elements({
      mode: '${deferred.mode || "payment"}',
      amount: ${deferred.amount || 100},
      currency: '${(deferred.currency || "usd").toLowerCase()}',
      appearance: appearance
    });

    const paymentElement = elements.create('payment', { layout: 'accordion' });
    paymentElement.mount('#payment-element');

    const submitBtn = document.getElementById('submit-btn');
    paymentElement.on('ready', () => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pay ${amountFormatted}';
    });

    const form = document.getElementById('payment-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
      const errorDiv = document.getElementById('error-message');
      errorDiv.textContent = '';

      const { error: submitError } = await elements.submit();
      if (submitError) {
        errorDiv.textContent = submitError.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Pay ${amountFormatted}';
        return;
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'request_client_secret' }));
    });

    window.confirmWithSecret = async (clientSecret) => {
      const isSetup = '${deferred.mode}' === 'setup' || clientSecret.startsWith('seti_');
      const res = isSetup
        ? await stripe.confirmSetup({
            elements,
            clientSecret,
            confirmParams: {
              return_url: 'https://mirlo.space',
            },
            redirect: 'if_required'
          })
        : await stripe.confirmPayment({
            elements,
            clientSecret,
            confirmParams: {
              return_url: 'https://mirlo.space',
              receipt_email: '${guestEmail || ""}'
            },
            redirect: 'if_required'
          });

      if (res.error) {
        document.getElementById('error-message').textContent = res.error.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Pay ${amountFormatted}';
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'paid' }));
      }
    };
  </script>
</body>
</html>`;
}

export function PayStage({
  checkoutUrl,
  deferred,
  guestEmail,
  onPaid,
  onCancel,
}: PayStageProps) {
  const webViewRef = useRef<WebView>(null);

  const proceed = (url: string) => {
    if (!isCheckoutCompleteUrl(url)) return true;
    onPaid();
    return false;
  };

  const handleMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "paid") {
        onPaid();
      } else if (data.type === "request_client_secret" && deferred) {
        const res = await confirmPurchaseIntent({
          checkoutId: deferred.checkoutId,
          amount: deferred.amount,
          email: guestEmail,
        });
        if (res?.clientSecret) {
          webViewRef.current?.injectJavaScript(
            `window.confirmWithSecret('${res.clientSecret}'); true;`
          );
        }
      }
    } catch (err) {
      console.error("Error processing webview message:", err);
    }
  };

  const source = deferred
    ? {
        html: generateInAppStripeHtml(deferred, guestEmail),
        baseUrl: "https://mirlo.space",
      }
    : { uri: checkoutUrl || "https://mirlo.space" };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={source}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={(request) => proceed(request.url)}
        onNavigationStateChange={(state) => proceed(state.url)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <Loading label="Opening checkout..." />
          </View>
        )}
        style={styles.webview}
      />
      <View style={styles.footer}>
        <SecondaryButton label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  footer: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.surfaceCardBorder,
  },
});
