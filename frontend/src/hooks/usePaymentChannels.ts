/**
 * Shared hook for fetching and formatting wallet payment channels.
 * Replaces duplicated wallet channel queries and option mapping across
 * POSPage, OrderCreatePage, ExpenseCreatePage, and PurchaseDetailPage.
 */
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

interface ChannelOption {
  value: string
  label: string
}

const TYPE_EMOJI: Record<string, string> = {
  cash: '💵',
  bank_account: '🏦',
  promptpay: '📱',
  credit_card: '💳',
  e_wallet: '👛',
}

const DEFAULT_OPTIONS: ChannelOption[] = [
  { value: '_cash', label: '💵 เงินสด' },
  { value: '_transfer', label: '🏦 โอนเงิน' },
  { value: '_credit_card', label: '💳 บัตรเครดิต' },
  { value: '_qr_code', label: '📱 QR Code' },
]

export function usePaymentChannels() {
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['wallet-channels-active'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const options: ChannelOption[] = channels.length > 0
    ? channels.map((ch: any) => ({
        value: String(ch.id),
        label: `${TYPE_EMOJI[ch.type] || '📋'} ${ch.name}`,
      }))
    : DEFAULT_OPTIONS

  /** Parse a selected value back to { channelId, paymentMethod } */
  const parseSelection = (value: string | null) => {
    if (!value) return { channelId: null, paymentMethod: 'cash' }
    if (value.startsWith('_')) {
      return { channelId: null, paymentMethod: value.replace('_', '') }
    }
    const ch = channels.find((c: any) => String(c.id) === value)
    const method = ch?.type === 'bank_account' ? 'transfer'
      : ch?.type === 'promptpay' ? 'qr_code'
      : ch?.type || 'cash'
    return { channelId: Number(value), paymentMethod: method }
  }

  return { channels, options, isLoading, parseSelection }
}
