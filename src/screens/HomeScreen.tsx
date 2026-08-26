import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppColors } from '../colors';
import { OrderItem, Player, amountDue, amountPaid, grandTotal, isFullyPaid, orderTotal } from '../types';
import { formatCurrency } from '../utils/currency';
import { loadSettings } from '../services/settingsService';
import { sendReceiptEmail } from '../services/emailService';
import { usePaymentLog } from '../context/PaymentLogContext';
import { usePlayers } from '../context/PlayersContext';
import { PaymentLineItem, PaymentStatus } from '../payment';
import PlayerCard from '../components/PlayerCard';
import SummaryStat from '../components/SummaryStat';
import AddPlayerModal from '../components/AddPlayerModal';
import AddOrderModal from '../components/AddOrderModal';
import PaymentCalculatorModal from '../components/PaymentCalculatorModal';

export default function HomeScreen({
  onOpenSettings,
  onOpenHistory,
  onOpenBooking,
}: {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenBooking: () => void;
}) {
  const { setPlayerPayment, setPlayerItemPaid, renamePlayerItem, payments, loading: paymentLogLoading } = usePaymentLog();
  // Players now live in a persisted context (mirrors PaymentLogContext) so
  // they survive navigating to Payment History and back — previously this
  // was local useState, which got wiped whenever HomeScreen unmounted.
  const { players, setPlayers, loading: playersLoading } = usePlayers();
  const [sending, setSending] = useState(false);

  const [addPlayerVisible, setAddPlayerVisible] = useState(false);
  const [addOrderPlayerId, setAddOrderPlayerId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<{ playerId: string; order: OrderItem } | null>(null);
  const [paymentPlayerId, setPaymentPlayerId] = useState<string | null>(null);

  const total = players.reduce((sum, p) => sum + grandTotal(p), 0);
  const unpaidCount = players.filter((p) => !isFullyPaid(p)).length;

  const updatePlayer = (id: string, updater: (p: Player) => Player) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  };

  const handleAddPlayer = (player: Player) => {
    setPlayers((prev) => [...prev, player]);
    setAddPlayerVisible(false);
  };

  const handleAddOrder = (item: OrderItem) => {
    if (!addOrderPlayerId) return;
    updatePlayer(addOrderPlayerId, (p) => {
      // If this player already has an unpaid order for the exact same item
      // (same name + same price), just bump its quantity instead of adding
      // another stacked row for the same thing.
      const match = p.orders.find(
        (o) =>
          !o.isPaid &&
          o.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
          o.price === item.price
      );
      if (match) {
        return {
          ...p,
          orders: p.orders.map((o) =>
            o.id === match.id ? { ...o, quantity: o.quantity + item.quantity } : o
          ),
        };
      }
      return { ...p, orders: [...p.orders, item] };
    });
    setAddOrderPlayerId(null);
  };

  // Edits an existing order's name/price/quantity in place (used by the
  // pencil button on each order row) rather than deleting and re-adding it.
  const handleEditOrder = (updated: OrderItem) => {
    if (!editOrder) return;
    const { playerId, order: previousOrder } = editOrder;
    const player = players.find((p) => p.id === playerId);

    // If this order was already marked paid, but the edit changes what's
    // actually owed (price and/or quantity), whatever was collected before
    // no longer covers the new total. Flip it back to unpaid instead of
    // silently keeping it marked paid — otherwise bumping a ₱5 paid item up
    // to ₱10 would report the full ₱10 as collected even though only ₱5
    // ever actually changed hands. A pure rename/typo fix (amount
    // unchanged) still keeps its paid status as-is.
    const amountChanged = orderTotal(updated) !== orderTotal(previousOrder);
    const staysPaid = previousOrder.isPaid && !amountChanged;
    const finalOrder: OrderItem = { ...updated, isPaid: staysPaid };

    updatePlayer(playerId, (p) => ({
      ...p,
      orders: p.orders.map((o) => (o.id === updated.id ? finalOrder : o)),
    }));

    if (player && previousOrder.isPaid) {
      const updatedPlayer: Player = {
        ...player,
        orders: player.orders.map((o) => (o.id === updated.id ? finalOrder : o)),
      };

      if (staysPaid) {
        // Same amount, only the name changed — keep the log's line in
        // sync with the edit.
        renamePlayerItem(playerId, `${previousOrder.name} x${previousOrder.quantity}`, {
          key: `${updated.name} x${updated.quantity}`,
          description: `${player.name} — ${updated.name} x${updated.quantity}`,
          amount: orderTotal(updated),
          method: 'Cash',
        });
      } else {
        // The amount changed — remove the now-stale "paid" line from the
        // log. The order goes back to showing as due for its new total,
        // same as any other unpaid order, until it's actually collected.
        setPlayerItemPaid(
          playerId,
          {
            key: `${previousOrder.name} x${previousOrder.quantity}`,
            description: `${player.name} — ${previousOrder.name} x${previousOrder.quantity}`,
            amount: orderTotal(previousOrder),
            method: 'Cash',
          },
          false,
          amountDue(updatedPlayer)
        );
      }
    }

    setEditOrder(null);
  };

  const removeOrder = (playerId: string, orderId: string) => {
    updatePlayer(playerId, (p) => ({
      ...p,
      orders: p.orders.filter((o) => o.id !== orderId),
    }));
  };

  // Manually tapping the PAID chip (outside the cash calculator) is still a
  // real payment — e.g. paid via GCash — so it gets logged too, but only
  // going unpaid -> paid. Un-marking something isn't a new payment.
  const toggleCourtFeePaid = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const willBePaid = !player.courtFeePaid;
    const updatedPlayer: Player = { ...player, courtFeePaid: willBePaid };

    updatePlayer(playerId, () => updatedPlayer);

    // Keep the player's log row in sync in both directions: marking paid
    // adds this line (once — it's a no-op if already logged), un-marking
    // removes it. This is what stops the same item from ever being
    // double-added if you flip the chip on/off/on again.
    //
    // remainingDue is computed from the player's FULL updated state, not
    // just this one item — that's what stops the log row from flipping to
    // "PAID" just because one item got checked off while others are still
    // owed.
    setPlayerItemPaid(
      playerId,
      {
        key: 'Court fee',
        description: `${player.name} — Court fee`,
        amount: player.courtFee,
        method: 'Cash',
      },
      willBePaid,
      amountDue(updatedPlayer)
    );
  };

  const toggleOrderPaid = (playerId: string, order: OrderItem) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const willBePaid = !order.isPaid;
    const updatedPlayer: Player = {
      ...player,
      orders: player.orders.map((o) => (o.id === order.id ? { ...o, isPaid: willBePaid } : o)),
    };

    updatePlayer(playerId, () => updatedPlayer);

    setPlayerItemPaid(
      playerId,
      {
        key: `${order.name} x${order.quantity}`,
        description: `${player.name} — ${order.name} x${order.quantity}`,
        amount: orderTotal(order),
        method: 'Cash',
      },
      willBePaid,
      amountDue(updatedPlayer)
    );
  };

  const deletePlayer = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    Alert.alert(
      'Remove this player?',
      `${player ? player.name : 'This player'} and their orders/payment status will be removed from the session. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setPlayers((prev) => prev.filter((p) => p.id !== playerId)),
        },
      ]
    );
  };

  const clearAllPlayers = () => {
    if (players.length === 0) return;
    Alert.alert(
      'Clear all players?',
      'This removes every player and their orders/payment status from the session. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => setPlayers([]),
        },
      ]
    );
  };

  const confirmPayment = (received: number) => {
    if (!paymentPlayerId) return;
    const player = players.find((p) => p.id === paymentPlayerId);
    if (!player) return;
    const due = amountDue(player);
    const isFullPayment = received >= due;
    // Whether this player already has SOMETHING paid — either from an
    // earlier partial cash collection, or from tapping a PAID chip by hand
    // (e.g. court fee paid, orders still open). If so, "failed" is the
    // wrong word even when this particular attempt collects ₱0 — nothing
    // was lost, there's just still a balance. "Failed" is reserved for a
    // player who has truly never had anything collected.
    const alreadyPaidSomething = amountPaid(player) > 0;
    // Not fully paid isn't automatically "pending" — if nothing at all was
    // ever handed over (they forgot their wallet, didn't bring money, and
    // nothing else on their tab is paid either), that's worth logging as
    // "failed" rather than lumping it in with "gave some cash but came up
    // short" (pending).
    const status: PaymentStatus = isFullPayment
      ? 'paid'
      : received > 0 || alreadyPaidSomething
        ? 'pending'
        : 'failed';
    const change = isFullPayment ? received - due : 0;

    // Figure out what was actually still owed BEFORE this payment, so the
    // log description matches what was really collected — not a hardcoded
    // "Court fee & orders" every time.
    const wasCourtFeeUnpaid = !player.courtFeePaid;
    const unpaidOrders = player.orders.filter((o) => !o.isPaid);
    const hadUnpaidOrders = unpaidOrders.length > 0;
    let description = `${player.name} — Payment`;
    if (wasCourtFeeUnpaid && hadUnpaidOrders) {
      description = `${player.name} — Court fee & orders`;
    } else if (wasCourtFeeUnpaid) {
      description = `${player.name} — Court fee`;
    } else if (hadUnpaidOrders) {
      description = `${player.name} — Orders`;
    }

    // The actual line items this payment covers, each with its own price,
    // so history can show a full breakdown instead of just the rolled-up
    // description above.
    const items: PaymentLineItem[] = [
      ...(wasCourtFeeUnpaid ? [{ description: 'Court fee', amount: player.courtFee }] : []),
      ...unpaidOrders.map((o) => ({ description: `${o.name} x${o.quantity}`, amount: orderTotal(o) })),
    ];

    // Only mark court fee/orders as actually paid once the full amount due
    // has been collected — a short or failed attempt leaves them unpaid so
    // the remaining balance still shows up correctly next time.
    if (isFullPayment) {
      updatePlayer(paymentPlayerId, (p) => ({
        ...p,
        courtFeePaid: true,
        orders: p.orders.map((o) => ({ ...o, isPaid: true })),
      }));
    }
    setPaymentPlayerId(null);

    // This is the main "cash register" payment path. It always REPLACES
    // this player's current log row (paid, pending, or failed) with the
    // freshly computed totals rather than adding a new one — so going
    // short, failing, then topping up later, then finishing it off all
    // update the same entry. A second, independent row only appears once
    // this one has been explicitly removed from Payment History.
    if (due > 0) {
      setPlayerPayment(paymentPlayerId, {
        description,
        amount: isFullPayment ? due : received,
        method: 'Cash',
        status,
        items,
      });
    }

    if (isFullPayment) {
      Alert.alert(
        change > 0 ? 'Paid!' : 'Paid in full',
        change > 0 ? `Change for ${player.name}: ${formatCurrency(change)}` : 'No change due.'
      );
    } else if (status === 'pending') {
      const remaining = due - received;
      Alert.alert(
        'Logged as Pending',
        `${player.name} still owes ${formatCurrency(remaining)}. You can come back and finish collecting later — it'll update this same entry.`
      );
    } else {
      Alert.alert(
        'Marked as Failed',
        `${player.name} didn't have any money on them this time. Logged as failed — try collecting again anytime, it'll update this same entry.`
      );
    }
  };

  const collectPayment = (player: Player) => {
    if (amountDue(player) <= 0) {
      Alert.alert('Nothing to collect', `${player.name} has nothing left to pay.`);
      return;
    }
    setPaymentPlayerId(player.id);
  };

  const finishSession = async () => {
    if (players.length === 0) {
      Alert.alert('No players', 'Add at least one player first.');
      return;
    }

   const proceedWithSend = async () => {
  setSending(true);
  try {
    const settings = await loadSettings();
    if (!settings.ownerEmail) {
      Alert.alert('Settings needed', "Please set up receipt settings first (gear icon).");
      return;
    }

    // Each player keeps their own court fee + their own orders nested
    // together, so the receipt can print one block per person instead of
    // a shared list where everyone's orders get mixed together.
    const receiptPlayers = players.map((p) => ({
      name: p.name,
      courtFee: p.courtFee,
      courtFeePaid: p.courtFeePaid,
      orders: p.orders.map((o) => ({
        name: `${o.name} x${o.quantity}`,
        price: orderTotal(o),
        paid: o.isPaid,
      })),
    }));

    // Get today's payments from the payment log
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todaysPayments = payments.filter(
      (p) => p.date.startsWith(today) && p.status === 'paid'
    );

    const result = await sendReceiptEmail({
      sessionTitle: settings.sessionTitle,
      ownerEmail: settings.ownerEmail,
      players: receiptPlayers,
      total,
      date: new Date().toISOString(),
      payments: todaysPayments,
    });
    // The mail app opens for the user to review/send — 'sent' means they hit
    // send, 'saved' means they saved a draft, 'undetermined' (Android) means
    // the mail app opened but we don't get told what happened next.
    const titleByResult: Record<string, string> = {
      sent: 'Receipt sent ✅',
      saved: 'Receipt saved as draft',
      undetermined: 'Mail app opened',
    };
    const messageByResult: Record<string, string> = {
      sent: `Sent to ${settings.ownerEmail}`,
      saved: 'You can send it later from your mail app.',
      undetermined: 'Finish sending it from your mail app.',
    };
    Alert.alert(
      titleByResult[result] ?? 'Receipt ready',
      messageByResult[result] ?? 'Check your mail app to finish sending.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Clear session', onPress: () => setPlayers([]) },
      ]
    );
  } catch (e: any) {
    const errorMessage = e?.message ?? String(e);
    console.error('❌ finishSession error:', errorMessage);
    // Check if it's the Expo Go limitation
    if (errorMessage.includes('not available') || errorMessage.includes('Expo Go') || errorMessage.includes('development build') || errorMessage.includes('ExpoMailComposer')) {
      Alert.alert(
        'Email not available in Expo Go',
        'The email feature requires a development build. Please build the app with "eas build" or "expo run:android/ios" to test email sending. For now, you can manually copy the receipt data.',
        [{ text: 'OK', style: 'default' }]
      );
    } else {
      Alert.alert('Failed to send receipt', errorMessage);
    }
  } finally {
    setSending(false);
  }
};
 

    if (unpaidCount > 0) {
      Alert.alert(
        'Unpaid players remain',
        `${unpaidCount} player(s) still have something unpaid (court fee and/or orders). Send the receipt anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send Anyway', onPress: proceedWithSend },
        ]
      );
      return;
    }

    await proceedWithSend();
  };

  const addOrderPlayer = players.find((p) => p.id === addOrderPlayerId) ?? null;
  const paymentPlayer = players.find((p) => p.id === paymentPlayerId) ?? null;

  // Both contexts read from AsyncStorage on mount — without this, the list
  // would briefly render "No players yet" before the real data pops in,
  // looking like the session got wiped.
  if (playersLoading || paymentLogLoading) {
    return (
      <View style={[styles.screen, styles.loadingScreen]}>
        <ActivityIndicator size="large" color={AppColors.forestGreen} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <Pressable
            onPress={onOpenBooking}
            hitSlop={15}
            style={styles.historyButton}
            accessibilityLabel="Court reservations"
            accessibilityRole="button"
          >
            <Text style={styles.historyButtonText}>📅</Text>
          </Pressable>
          <Pressable
            onPress={onOpenHistory}
            hitSlop={15}
            style={styles.historyButton}
            accessibilityLabel="Payment history"
            accessibilityRole="button"
          >
            <Text style={styles.historyButtonText}>📋</Text>
          </Pressable>
          <Image source={require('../../assets/mt_pickle_logo.jpg')} style={styles.logo} />
          <View>
            <Text style={styles.appBarTitle}>Mt Pickle Park</Text>
            <Text style={styles.appBarSubtitle}>SESSION TRACKER</Text>
          </View>
        </View>
        <View style={styles.appBarRight}>
          <Pressable onPress={onOpenSettings} hitSlop={10} accessibilityLabel="Settings" accessibilityRole="button">
            <Text style={styles.gearIcon}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryBar}>
        <SummaryStat label="Players" value={`${players.length}`} />
        <SummaryStat
          label="Not Fully Paid"
          value={`${unpaidCount}`}
          valueColor={unpaidCount > 0 ? AppColors.gold : '#fff'}
        />
        <SummaryStat label="Total" value={formatCurrency(total)} valueColor={AppColors.gold} />
      </View>

      {players.length > 0 && (
        <View style={styles.clearAllRow}>
          <Pressable
            onPress={clearAllPlayers}
            hitSlop={8}
            accessibilityLabel="Clear all players"
            accessibilityRole="button"
          >
            <Text style={styles.clearAllText}>Clear All</Text>
          </Pressable>
        </View>
      )}

      {players.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No players yet. Tap + to add one.</Text>
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 140 }}
          renderItem={({ item }) => (
            <PlayerCard
              player={item}
              onToggleCourtFeePaid={() => toggleCourtFeePaid(item.id)}
              onToggleOrderPaid={(order) => toggleOrderPaid(item.id, order)}
              onAddOrder={() => setAddOrderPlayerId(item.id)}
              onEditOrder={(order) => setEditOrder({ playerId: item.id, order })}
              onRemoveOrder={(orderId) => removeOrder(item.id, orderId)}
              onDeletePlayer={() => deletePlayer(item.id)}
              onCollectPayment={() => collectPayment(item)}
            />
          )}
        />
      )}

      <View style={styles.fabColumn}>
        <Pressable
          onPress={sending ? undefined : finishSession}
          style={[styles.fabExtended, sending && { opacity: 0.7 }]}
          accessibilityLabel="Finish session and send receipt"
          accessibilityRole="button"
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.fabExtendedIcon}>✓</Text>
          )}
          <Text style={styles.fabExtendedLabel}>{sending ? 'Sending...' : 'Finish Session'}</Text>
        </Pressable>

        <Pressable
          onPress={() => setAddPlayerVisible(true)}
          style={styles.fabAdd}
          accessibilityLabel="Add player"
          accessibilityRole="button"
        >
          <Text style={styles.fabAddIcon}>＋</Text>
        </Pressable>
      </View>

      <AddPlayerModal
        visible={addPlayerVisible}
        onCancel={() => setAddPlayerVisible(false)}
        onSubmit={handleAddPlayer}
      />

      <AddOrderModal
        visible={addOrderPlayer !== null || editOrder !== null}
        editingItem={editOrder?.order ?? null}
        onCancel={() => {
          setAddOrderPlayerId(null);
          setEditOrder(null);
        }}
        onSubmit={editOrder ? handleEditOrder : handleAddOrder}
      />

      {paymentPlayer && (
        <PaymentCalculatorModal
          visible={paymentPlayer !== null}
          amountDue={amountDue(paymentPlayer)}
          playerName={paymentPlayer.name}
          alreadyPaidSomething={amountPaid(paymentPlayer) > 0}
          onCancel={() => setPaymentPlayerId(null)}
          onConfirm={confirmPayment}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.background },
  loadingScreen: { justifyContent: 'center', alignItems: 'center' },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppColors.forestGreen,
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  appBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 6 },
  appBarTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  appBarSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 1.2 },
  gearIcon: { color: '#fff', fontSize: 22 },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyButton: { padding: 8, marginRight: 8 },
  historyButtonText: { fontSize: 22 },
  historyButtonLeft: { marginRight: 8 },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: AppColors.forestGreen,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 3,
    borderBottomColor: AppColors.gold,
  },
  clearAllRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  clearAllText: { color: AppColors.crimsonRed, fontSize: 13, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 14 },
  fabColumn: { position: 'absolute', right: 16, bottom: 24, alignItems: 'flex-end', gap: 12 },
  fabExtended: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppColors.forestGreen,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabExtendedIcon: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  fabExtendedLabel: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fabAdd: {
    backgroundColor: AppColors.crimsonRed,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabAddIcon: { color: '#fff', fontSize: 26, fontWeight: 'bold' },
});
