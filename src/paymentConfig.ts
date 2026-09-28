// Optional extra GCash details shown under the QR on the "Reservation
// confirmed" screen. The QR image itself is  assets/gcash_qr.jpg  (replace
// that file to change it - same name, or update the require() in
// ReservationConfirmedModal.tsx).
//
// The QR screenshot already shows a partly hidden name/number, so these are
// left blank. Fill them in only if you want them printed in plain text too.
// Leave a field as '' to hide that line.
export const GCASH = {
  accountName: '', // e.g. 'Nestor D.'
  number: '', // e.g. '0998 385 1234'
};
