import * as MailComposer from 'expo-mail-composer';

/**
 * NOTE ON TYPES BELOW:
 * Player/OrderItem here are the "receipt" shapes this service works with —
 * flat and simple, not the full app types (which have ids, orders arrays,
 * etc). HomeScreen.tsx maps its Player[]/OrderItem[] into these shapes
 * before calling sendReceiptEmail. If you rename fields here, update the
 * mapping in HomeScreen.tsx too.
 */
export interface Player {
  name: string;
  paid: boolean;
  amount: number;
}

export interface OrderItem {
  name: string;
  price: number;
  paid: boolean;
}

export interface SessionReceipt {
  sessionTitle: string;
  ownerEmail: string;
  courtFee: number;
  players: Player[];
  orderItems: OrderItem[];
  total: number;
}

function formatCurrency(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

function buildReceiptText(receipt: SessionReceipt): string {
  const lines: string[] = [];
  lines.push(`Mt Pickle Park — ${receipt.sessionTitle}`);
  lines.push('');
  lines.push(`Court fee: ${formatCurrency(receipt.courtFee)}`);
  lines.push('');

  lines.push('Players:');
  for (const p of receipt.players) {
    lines.push(`  - ${p.name}: ${formatCurrency(p.amount)} (${p.paid ? 'PAID' : 'UNPAID'})`);
  }

  if (receipt.orderItems.length > 0) {
    lines.push('');
    lines.push('Food & drink orders:');
    for (const item of receipt.orderItems) {
      lines.push(`  - ${item.name}: ${formatCurrency(item.price)} (${item.paid ? 'PAID' : 'UNPAID'})`);
    }
  }

  lines.push('');
  lines.push(`Total: ${formatCurrency(receipt.total)}`);

  return lines.join('\n');
}

export type SendResult = 'sent' | 'saved' | 'undetermined';

/**
 * Opens the device's native mail app, pre-filled with the receipt, so the
 * user can review and hit Send themselves. Requires a configured mail
 * account on the device (Mail app on iOS, Gmail/Outlook/etc on Android).
 * No backend, no API key.
 */
export async function sendReceiptEmail(receipt: SessionReceipt): Promise<SendResult> {
  const isAvailable = await MailComposer.isAvailableAsync();
  if (!isAvailable) {
    throw new Error(
      'No email app is set up on this device. Add a mail account in your phone Settings first.'
    );
  }

  const message = buildReceiptText(receipt);

  const result = await MailComposer.composeAsync({
    recipients: [receipt.ownerEmail],
    subject: `Mt Pickle Park Receipt — ${receipt.sessionTitle}`,
    body: message,
  });

  if (result.status === 'cancelled') {
    throw new Error('Email was cancelled.');
  }

  return result.status as SendResult;
}
