import { paymentReturnPath } from '@/lib/payment-return';
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return paymentReturnPath(path);
}
