/**
 * Centralized AsyncStorage key registry.
 *
 * ALL AsyncStorage keys should be defined here to:
 * - Prevent key collisions
 * - Make it easy to find all persisted data
 * - Support bulk clear on logout/account delete
 *
 * Convention: SCREAMING_SNAKE_CASE
 */
export const STORAGE_KEYS = {
  // Auth & session
  AUTH_TOKEN: 'sb-wfsghkseyyxkkalcqtzq-auth-token',
  PUSH_TOKEN: 'push_token',
  ONBOARDING_COMPLETE: 'onboarding_complete',

  // User preferences
  THEME_MODE: 'bivo_theme_mode',
  LOCALE: 'bivo_locale',
  LANG_AUTO_SET: 'bivo_lang_auto_set',
  NOTIFICATION_PREFS_CACHE: 'bivo_notification_prefs',
  UNSUPPORTED_DISMISSED: 'bivo_unsupported_dismissed',

  // Feed & content
  FEED_CACHE: 'bivo_feed_cache',
  HIDDEN_POSTS: 'bivo_hidden_posts',
  PINNED_CONVERSATIONS: 'pinned_conversations',
  DIGEST_DISMISSED: 'digest_dismissed',
  WELCOME_TOAST_SHOWN: 'welcome_toast_shown',
  POST_DRAFT: 'tackbird_post_draft',

  // Search
  SEARCH_HISTORY: 'bivo-search-history',
  SAVED_SEARCHES: 'bivo-saved-searches',

  // Engagement
  STREAK_CACHE: 'bivo_streak_date',
  RETENTION_TRACKED: 'bivo_retention_last_tracked',

  // Rate limiting
  RATE_LIMIT_PREFIX: 'rate_limit_',

  // Feature flags
  FEATURE_FLAGS_CACHE: 'bivo_feature_flags',

  // Review prompt
  REVIEW_LAST_PROMPT: 'bivo_review_last_prompt',
  REVIEW_PROMPT_COUNT: 'bivo_review_prompt_count',
  REVIEW_YEAR_START: 'bivo_review_year_start',

  // Analytics
  ONBOARDING_FUNNEL: 'bivo_onboarding_funnel',
} as const

