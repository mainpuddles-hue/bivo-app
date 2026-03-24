import { Alert } from 'react-native'
import type { TFunction } from './format'

export function showError(t: TFunction, messageKey: string, params?: Record<string, string | number>) {
  Alert.alert(t('common.error'), t(messageKey, params))
}

export function showSuccess(t: TFunction, messageKey: string, params?: Record<string, string | number>) {
  Alert.alert(t('common.success'), t(messageKey, params))
}
