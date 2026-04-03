import { memo } from 'react'
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import type { ForumCategory } from './ForumPostCard'

// ── Category definitions ──
export interface ForumCategoryDef {
  key: ForumCategory
  labelKey: string
  color: string
}

export const FORUM_CATEGORY_DEFS: ForumCategoryDef[] = [
  { key: 'vinkit', labelKey: 'forum.tips', color: '#4CAF6A' },
  { key: 'kysymykset', labelKey: 'forum.questions', color: '#3B7DD8' },
  { key: 'tapahtumat', labelKey: 'forum.events', color: '#2B8A62' },
  { key: 'uutiset', labelKey: 'forum.news', color: '#8E44AD' },
]

interface ForumCreateModalProps {
  visible: boolean
  onClose: () => void
  onPublish: (title: string, content: string, category: ForumCategory) => void
  publishing: boolean
  // Form state managed by parent
  title: string
  onTitleChange: (text: string) => void
  content: string
  onContentChange: (text: string) => void
  selectedCategory: ForumCategory | null
  onCategoryChange: (cat: ForumCategory | null) => void
}

function ForumCreateModalInner({
  visible,
  onClose,
  onPublish,
  publishing,
  title,
  onTitleChange,
  content,
  onContentChange,
  selectedCategory,
  onCategoryChange,
}: ForumCreateModalProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()

  const handlePublish = () => {
    if (!selectedCategory) return
    onPublish(title, content, selectedCategory)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        {/* Modal header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {t('forum.createTitle')}
          </Text>
          <Pressable
            onPress={handlePublish}
            disabled={publishing}
            style={[styles.publishBtn, { backgroundColor: colors.primary, opacity: publishing ? 0.6 : 1 }]}
          >
            {publishing ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.publishBtnText, { color: colors.primaryForeground }]}>
                {t('forum.publish')}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Category picker */}
        <View style={styles.modalSection}>
          <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>
            {t('forum.selectCategory')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChips}
          >
            {FORUM_CATEGORY_DEFS.map((cat) => {
              const isActive = selectedCategory === cat.key
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => onCategoryChange(cat.key)}
                  style={[
                    styles.categoryChip,
                    isActive
                      ? { backgroundColor: cat.color }
                      : { backgroundColor: isDark ? colors.card : colors.muted },
                  ]}
                >
                  <Text style={[
                    styles.categoryChipText,
                    { color: isActive ? colors.primaryForeground : colors.mutedForeground },
                    isActive && { fontFamily: fonts.bodySemi },
                  ]}>
                    {t(cat.labelKey)}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        {/* Title input */}
        <View style={styles.modalSection}>
          <TextInput
            style={[styles.titleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            placeholder={t('forum.postTitle')}
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={onTitleChange}
            maxLength={200}
            autoFocus
          />
        </View>

        {/* Content input */}
        <View style={[styles.modalSection, { flex: 1 }]}>
          <TextInput
            style={[styles.contentInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            placeholder={t('forum.postContent')}
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={onContentChange}
            multiline
            textAlignVertical="top"
            maxLength={5000}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export const ForumCreateModal = memo(ForumCreateModalInner)

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 56, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, lineHeight: 23, flex: 1,
    textAlign: 'center', paddingHorizontal: 8,
  },
  modalSection: {
    paddingHorizontal: 16, paddingTop: 14,
  },
  modalLabel: {
    fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 17, marginBottom: 8,
  },
  publishBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
    minWidth: 80, alignItems: 'center',
  },
  publishBtnText: {
    fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20,
  },
  categoryChips: {
    gap: 8, paddingRight: 4,
  },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  categoryChipText: {
    fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17,
  },
  titleInput: {
    fontSize: 16, fontFamily: fonts.headingSemi, borderRadius: 12,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    letterSpacing: -0.16,
  },
  contentInput: {
    flex: 1, fontSize: 14, fontFamily: fonts.body, borderRadius: 12,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    lineHeight: 20, minHeight: 160,
  },
})
