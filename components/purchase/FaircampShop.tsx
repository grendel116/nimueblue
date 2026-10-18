import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Markdown from "react-native-markdown-display";
import { theme } from "@/constants/theme";
import { formatMoney, toCents } from "@/queries/listener";
import {
  fetchFaircampDownloadFormats,
  type FaircampDownloadFormat,
  type FaircampShop as Shop,
} from "@/queries/fairplayer";
import { saveFaircampZip } from "@/scripts/faircampDownload";
import { openInBrowser } from "@/scripts/openInBrowser";
import { priceChips, toAmountText } from "./helpers";
import { AmountField, ErrorText, Field, Notice, PrimaryButton, SecondaryButton, styles as ui } from "./ui";

type Step = { name: "start" } | { name: "pay"; cents: number } | { name: "formats"; formats: FaircampDownloadFormat[] };

// A Faircamp release's downloads drawn in the sheet, one step at a time like Mirlo's checkout:
// free releases go straight to formats, paid ones ask a price and the payment first, code
// releases ask the code, and external ones list the artist's stores
export function FaircampShop({ album, onOpen }: { album: AlbumProps; onOpen: (url: string) => void }) {
  const artistName = album.artist?.name || "the artist";
  const shop = album.faircampShop;

  if (!shop) {
    return (
      <Notice
        icon="cloud-download-outline"
        title="No Downloads"
        body={`${artistName} doesn't offer downloads of this release.`}
      />
    );
  }

  if (shop.mode === "external") {
    return (
      <>
        <Text style={ui.body}>{artistName} sells downloads of this release on these stores.</Text>
        {shop.links.map((link, index) =>
          index === 0 ? (
            <PrimaryButton key={link.url} label={link.label} icon="open-outline" onPress={() => onOpen(link.url)} />
          ) : (
            <SecondaryButton key={link.url} label={link.label} icon="open-outline" onPress={() => onOpen(link.url)} />
          ),
        )}
      </>
    );
  }

  return <FaircampCheckout artistName={artistName} shop={shop} />;
}

function FaircampCheckout({ artistName, shop }: { artistName: string; shop: Exclude<Shop, { mode: "external" }> }) {
  const [step, setStep] = useState<Step>({ name: "start" });
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Reads the downloads page; a wrong code or a dead page shows `failure`
  const openFormats = async (downloadsUrl: string, failure: string) => {
    setBusy(true);
    setProblem(undefined);
    try {
      const formats = await fetchFaircampDownloadFormats(downloadsUrl);
      if (formats.length === 0) throw new Error(failure);
      setStep({ name: "formats", formats });
    } catch {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  const unreachable = "Couldn't load the downloads. Try again.";

  if (step.name === "formats") return <FormatStep formats={step.formats} />;

  if (shop.mode === "free") {
    return (
      <>
        <Text style={ui.body}>{artistName} shares this release as a free download.</Text>
        <ErrorText message={problem} />
        <PrimaryButton
          label="Download"
          icon="arrow-down-circle-outline"
          busy={busy}
          onPress={() => openFormats(shop.downloadsUrl, unreachable)}
        />
      </>
    );
  }

  if (shop.mode === "code") {
    return (
      <CodeStep
        info={shop.info}
        busy={busy}
        problem={problem}
        onUnlock={(code) =>
          openFormats(
            `${shop.codePrefix}${encodeURIComponent(code)}${shop.codeSuffix}`,
            "That code didn't work. Check it for typos.",
          )
        }
      />
    );
  }

  if (step.name === "pay") {
    return (
      <PayStep
        artistName={artistName}
        cents={step.cents}
        currency={shop.price.currency}
        info={shop.info}
        busy={busy}
        problem={problem}
        onContinue={() => openFormats(shop.downloadsUrl, unreachable)}
        onBack={() => setStep({ name: "start" })}
      />
    );
  }

  return (
    <PriceStep
      artistName={artistName}
      price={shop.price}
      busy={busy}
      problem={problem}
      onProblem={setProblem}
      onPrice={(cents) => (cents === 0 ? openFormats(shop.downloadsUrl, unreachable) : setStep({ name: "pay", cents }))}
    />
  );
}

function PriceStep({
  artistName,
  price,
  busy,
  problem,
  onProblem,
  onPrice,
}: {
  artistName: string;
  price: Extract<Shop, { mode: "paycurtain" }>["price"];
  busy: boolean;
  problem?: string;
  onProblem: (problem: string | undefined) => void;
  onPrice: (cents: number) => void;
}) {
  const minimum = Math.round(price.minimum * 100);
  const maximum = price.maximum !== undefined ? Math.round(price.maximum * 100) : undefined;
  const fixed = maximum === minimum;
  const [amount, setAmount] = useState(minimum > 0 ? toAmountText(minimum) : "");

  const confirm = () => {
    const cents = fixed ? minimum : amount.trim() ? toCents(amount.trim()) : 0;
    if (Number.isNaN(cents) || cents < 0) return onProblem("Enter an amount");
    if (cents < minimum) return onProblem(`The minimum is ${formatMoney(minimum, price.currency)}`);
    if (maximum !== undefined && cents > maximum) {
      return onProblem(`The maximum is ${formatMoney(maximum, price.currency)}`);
    }
    onProblem(undefined);
    onPrice(cents);
  };

  return (
    <>
      {fixed ? (
        <Text style={[ui.sectionTitle, local.center]}>{formatMoney(minimum, price.currency)}</Text>
      ) : (
        <AmountField
          label="Name your price"
          value={amount}
          onChangeText={setAmount}
          currency={price.currency}
          minimum={minimum}
          chips={priceChips(minimum).filter((chip) => maximum === undefined || chip.cents <= maximum)}
        />
      )}
      {!fixed && maximum !== undefined ? (
        <Text style={ui.hint}>Up to {formatMoney(maximum, price.currency)}.</Text>
      ) : null}
      <ErrorText message={problem} />
      <PrimaryButton label="Continue" busy={busy} onPress={confirm} />
      <Text style={ui.hint}>Payment goes straight to {artistName}.</Text>
    </>
  );
}

function PayStep({
  artistName,
  cents,
  currency,
  info,
  busy,
  problem,
  onContinue,
  onBack,
}: {
  artistName: string;
  cents: number;
  currency: string;
  info: string;
  busy: boolean;
  problem?: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <>
      <Text style={[ui.sectionTitle, local.center]}>Pay {formatMoney(cents, currency)}</Text>
      <ArtistNote markdown={info || `Pay ${artistName} directly, then continue to your downloads.`} />
      <Pressable
        onPress={() => setConfirmed((c) => !c)}
        style={local.confirm}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
      >
        <Ionicons
          name={confirmed ? "checkbox" : "square-outline"}
          size={22}
          color={confirmed ? theme.colors.primary : theme.colors.textSecondary}
        />
        <Text style={local.confirmText}>I have made or arranged the payment</Text>
      </Pressable>
      <ErrorText message={problem} />
      <PrimaryButton
        label="Continue to Downloads"
        icon="arrow-down-circle-outline"
        disabled={!confirmed}
        busy={busy}
        onPress={onContinue}
      />
      <SecondaryButton label="Change Amount" onPress={onBack} />
    </>
  );
}

function CodeStep({
  info,
  busy,
  problem,
  onUnlock,
}: {
  info: string;
  busy: boolean;
  problem?: string;
  onUnlock: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <>
      {info ? <ArtistNote markdown={info} /> : null}
      <Field
        label="Download code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => code.trim() && onUnlock(code.trim())}
      />
      <ErrorText message={problem} />
      <PrimaryButton
        label="Unlock"
        icon="lock-open-outline"
        disabled={!code.trim()}
        busy={busy}
        onPress={() => onUnlock(code.trim())}
      />
    </>
  );
}

function FormatStep({ formats }: { formats: FaircampDownloadFormat[] }) {
  return (
    <>
      <Text style={[ui.sectionTitle, local.center]}>Choose a Format</Text>
      {formats.map((format) => (
        <PrimaryButton
          key={format.url}
          label={format.label}
          icon="arrow-down-circle-outline"
          onPress={() => saveFaircampZip(format.url)}
        />
      ))}
      <Text style={ui.hint}>Each format downloads as a zip.</Text>
    </>
  );
}

// The artist's own words from their Faircamp page: payment details or a note about codes
function ArtistNote({ markdown }: { markdown: string }) {
  return (
    <View style={local.note}>
      <Markdown
        onLinkPress={(url) => {
          openInBrowser(url);
          return false;
        }}
        style={{
          body: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 20 },
          link: { color: theme.colors.textCyan },
          paragraph: { marginTop: 0, marginBottom: 8 },
        }}
      >
        {markdown}
      </Markdown>
    </View>
  );
}

const local = StyleSheet.create({
  center: {
    textAlign: "center",
  },
  note: {
    padding: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCardBorder,
    backgroundColor: theme.colors.surface,
  },
  confirm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  confirmText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
});
