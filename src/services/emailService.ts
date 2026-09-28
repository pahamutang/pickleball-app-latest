import * as MailComposer from 'expo-mail-composer';
import { Linking, Platform } from 'react-native';
import { Payment } from '../payment';

/**
 * NOTE ON TYPES BELOW:
 * ReceiptPlayer/ReceiptOrderItem here are the "receipt" shapes this service
 * works with — flat and simple, not the full app types (which have ids,
 * etc). Each player carries their OWN court fee + their OWN orders nested
 * inside, so the receipt can print one block per player instead of one
 * shared "everyone's orders" list. HomeScreen.tsx maps its Player[] (with
 * per-player .orders) into this shape before calling sendReceiptEmail. If
 * you rename fields here, update the mapping in HomeScreen.tsx too.
 */
export interface ReceiptOrderItem {
  name: string;
  price: number;
  paid: boolean;
}

export interface ReceiptPlayer {
  name: string;
  courtFee: number;
  courtFeePaid: boolean;
  orders: ReceiptOrderItem[];
}

export interface SessionReceipt {
  sessionTitle: string;
  ownerEmail: string;
  players: ReceiptPlayer[];
  total: number;
  // New fields for date and payment history
  date?: string; // ISO string
  payments?: Payment[];
}

function formatCurrency(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

const RECEIPT_WIDTH = 34;

function divider(char: string = '-'): string {
  return char.repeat(RECEIPT_WIDTH);
}

function center(text: string): string {
  const space = Math.max(0, RECEIPT_WIDTH - text.length);
  const left = Math.floor(space / 2);
  return ' '.repeat(left) + text;
}

// Label on the left, amount right-aligned on the right — the classic
// receipt look. If the label is too long to leave room, amount just drops
// to its own line underneath instead of overlapping.
function row(label: string, amount: string): string {
  const space = RECEIPT_WIDTH - label.length - amount.length;
  if (space < 1) {
    return `${label}\n${' '.repeat(Math.max(0, RECEIPT_WIDTH - amount.length))}${amount}`;
  }
  return `${label}${' '.repeat(space)}${amount}`;
}

// Always a plain 12-hour clock (e.g. "10:30 AM") — explicitly forced with
// hour12: true so it never comes out as 24-hour time on devices whose
// locale/region defaults to that.
function formatTime12h(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildReceiptText(receipt: SessionReceipt): string {
  const lines: string[] = [];
  const sessionDate = receipt.date ? new Date(receipt.date) : new Date();

  lines.push(center('MT PICKLE PARK'));
  lines.push(center(receipt.sessionTitle));
  lines.push(divider('='));
  lines.push(center(formatDateLong(sessionDate)));
  lines.push(center(formatTime12h(sessionDate)));
  lines.push(divider('='));
  lines.push('');

  // One self-contained block per player: their court fee, then only THEIR
  // own orders, then their own subtotal. Nothing here is shared across
  // players, so someone who only paid the court fee never sees anyone
  // else's food/drink items.
  for (const p of receipt.players) {
    lines.push(p.name.toUpperCase());
    lines.push(divider());
    lines.push(row('Court fee', formatCurrency(p.courtFee)));
    lines.push(`  ${p.courtFeePaid ? '✓ PAID' : '✗ UNPAID'}`);

    if (p.orders.length > 0) {
      for (const item of p.orders) {
        lines.push(row(`  ${item.name}`, formatCurrency(item.price)));
        lines.push(`    ${item.paid ? '✓ PAID' : '✗ UNPAID'}`);
      }
    }

    const playerSubtotal =
      p.courtFee + p.orders.reduce((sum, item) => sum + item.price, 0);
    lines.push(divider());
    lines.push(row('Subtotal', formatCurrency(playerSubtotal)));
    lines.push('');
  }

  lines.push(divider('='));
  lines.push(row('GRAND TOTAL', formatCurrency(receipt.total)));
  lines.push(divider('='));

  // Add payment history for this session. `receipt.payments` is already
  // filtered down to "today" (local calendar date) by the caller
  // (HomeScreen.finishSession) before it ever gets here — this used to
  // re-filter with its OWN, different definition of "today"
  // (`new Date(p.date).toDateString()`, local, vs. the caller's old
  // UTC-based filter), and the two disagreeing boundaries could silently
  // drop legitimately-"today" payments from the receipt depending on the
  // time of day. Trusting the already-filtered list avoids re-introducing
  // that mismatch — there's no second, independent notion of "today" to
  // get out of sync with the caller's.
  if (receipt.payments && receipt.payments.length > 0) {
    lines.push('');
    lines.push(center('PAYMENT HISTORY (TODAY)'));
    lines.push(divider());

    const todaysPayments = receipt.payments;

    if (todaysPayments.length > 0) {
      for (const payment of todaysPayments) {
        const paymentTime = formatTime12h(new Date(payment.date));
        lines.push(row(`${paymentTime}  ${payment.description}`, ''));
        lines.push(row(`  ${payment.method} — ${payment.status.toUpperCase()}`, formatCurrency(payment.amount)));
      }

      const todaysTotal = todaysPayments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + p.amount, 0);
      lines.push(divider());
      lines.push(row("Today's Total Collected", formatCurrency(todaysTotal)));
    } else {
      lines.push('  No payments recorded for today.');
    }
  }

  lines.push('');
  lines.push(divider('='));

  return lines.join('\n');
}

export type SendResult = 'sent' | 'saved' | 'undetermined';

// expo-mail-composer's composeAsync() promise can hang forever on some
// Android devices — never resolving or rejecting. Race it against a
// timeout so the UI can't get stuck on "Sending..." indefinitely.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * Opens the device's native mail app, pre-filled with the receipt, so the
 * user can review and hit Send themselves. Requires a configured mail
 * account on the device (Mail app on iOS, Gmail/Outlook/etc on Android).
 * No backend, no API key.
 *
 * Android does NOT use MailComposer.composeAsync(). Android 15 has an OS
 * bug where showing the system app-chooser sheet (triggered by any
 * implicit mailto/send intent) crashes IntentResolver / ChooserActivityLauncher
 * — the crash happens inside the OS itself, below the JS layer, so it can't
 * be caught here; it just kills the flow and drops the user back to the
 * previous foreground app. Opening Gmail's own compose screen via its
 * dedicated googlegmail:// URL scheme skips the system chooser entirely and
 * avoids that crash. Plain mailto: is kept only as a last-resort fallback
 * for devices without Gmail installed.
 */
export async function sendReceiptEmail(receipt: SessionReceipt): Promise<SendResult> {
  const message = buildReceiptText(receipt);
  const subject = `Mt Pickle Park Receipt — ${receipt.sessionTitle}`;

  if (Platform.OS === 'android') {
    try {
      const gmailUrl =
        `googlegmail:///co?to=${encodeURIComponent(receipt.ownerEmail)}` +
        `&subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(message)}`;

      const canOpenGmail = await Linking.canOpenURL(gmailUrl);

      if (canOpenGmail) {
        await Linking.openURL(gmailUrl);
        return 'undetermined';
      }

      // Per RFC 6068 the address itself isn't percent-encoded (only the
      // query params are) — encoding it turns "@" into "%40", and some
      // Android mail apps' URI matchers only recognize a literal "@" here,
      // so an encoded address can make canOpenURL/openURL silently fail to
      // route to an installed mail app.
      const mailtoUrl =
        `mailto:${receipt.ownerEmail}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(message)}`;

      const canOpenMailto = await Linking.canOpenURL(mailtoUrl);

      if (!canOpenMailto) {
        throw new Error(
          'No email app is set up on this device. Add a mail account in your phone Settings first.'
        );
      }

      await Linking.openURL(mailtoUrl);
      return 'undetermined';
    } catch (error: any) {
      console.error('📧 sendReceiptEmail (android) error:', error);
      throw error;
    }
  }

  // Web (laptop browser): expo-mail-composer doesn't exist here, so open the
  // computer's default mail app with a mailto: link instead.
  if (Platform.OS === 'web') {
    const mailtoUrl =
      `mailto:${receipt.ownerEmail}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(message)}`;
    await Linking.openURL(mailtoUrl);
    return 'undetermined';
  }

  try {
    const isAvailable = await MailComposer.isAvailableAsync();

    if (!isAvailable) {
      throw new Error(
        'No email app is set up on this device. Add a mail account in your phone Settings first.'
      );
    }

    const result = await withTimeout(
      MailComposer.composeAsync({
        recipients: [receipt.ownerEmail],
        subject,
        body: message,
      }),
      20000,
      'The mail app took too long to respond. It may have opened in the background — check for it, then return here.'
    );

    if (result.status === 'cancelled') {
      throw new Error('Email was cancelled.');
    }

    return result.status as SendResult;
  } catch (error: any) {
    console.error('📧 sendReceiptEmail (ios) error:', error);
    throw error;
  }
}
