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
  THEME_MODE: 'tackbird_theme_mode',
  LOCALE: 'tackbird_locale',
  LANG_AUTO_SET: 'tackbird_lang_auto_set',
  NOTIFICATION_PREFS_CACHE: 'tackbird_notification_prefs',
  UNSUPPORTED_DISMISSED: 'tackbird_unsupported_dismissed',

  // Feed & content
  FEED_CACHE: 'tackbird_feed_cache',
  HIDDEN_POSTS: 'tackbird_hidden_posts',
  PINNED_CONVERSATIONS: 'pinned_conversations',
  DIGEST_DISMISSED: 'digest_dismissed',

  // Search
  SEARCH_HISTORY: 'tackbird-search-history',
  SAVED_SEARCHES: 'tackbird-saved-searches',

  // Engagement
  STREAK_CACHE: 'tackbird_streak_date',
  RETENTION_TRACKED: 'tackbird_retention_last_tracked',

  // Rate limiting
  RATE_LIMIT_PREFIX: 'rate_limit_',

  // Feature flags
  FEATURE_FLAGS_CACHE: 'tackbird_feature_flags',

  // Review prompt
  REVIEW_LAST_PROMPT: 'tackbird_review_last_prompt',
  REVIEW_PROMPT_COUNT: 'tackbird_review_prompt_count',
  REVIEW_YEAR_START: 'tackbird_review_year_start',

  // Analytics
  ONBOARDING_FUNNEL: 'tackbird_onboarding_funnel',
} as const

