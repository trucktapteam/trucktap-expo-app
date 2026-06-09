import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';
import { trackEvent } from '@/lib/analytics';

type ReviewEngagementEvent =
  | 'app_open'
  | 'truck_profile_view'
  | 'favorite_added'
  | 'navigate_click';

type RecordReviewEngagementOptions = {
  truckId?: string | null;
  userId?: string | null;
  shouldEvaluate?: boolean;
};

const ENGAGEMENT_SCORE_KEY = 'engagement_score';
const FIRST_SEEN_DATE_KEY = 'first_seen_date';
const REVIEW_PROMPT_SHOWN_KEY = 'review_prompt_shown';

const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ENGAGEMENT_SCORE = 10;
const MIN_PROMPT_DELAY_MS = 2000;
const MAX_PROMPT_DELAY_MS = 5000;

const EVENT_POINTS: Record<ReviewEngagementEvent, number> = {
  app_open: 1,
  truck_profile_view: 2,
  favorite_added: 3,
  navigate_click: 5,
};

let promptCheckInFlight = false;
let promptDelayHandle: ReturnType<typeof setTimeout> | null = null;
let engagementWriteQueue = Promise.resolve();

const devLog = (message: string, details?: Record<string, unknown>) => {
  if (__DEV__) {
    console.log(`[AppReviewPrompt] ${message}`, details ?? {});
  }
};

const getStoredBoolean = async (key: string) => {
  const value = await AsyncStorage.getItem(key);
  return value === 'true';
};

const getStoredScore = async () => {
  const storedScore = await AsyncStorage.getItem(ENGAGEMENT_SCORE_KEY);
  const parsedScore = storedScore ? Number.parseInt(storedScore, 10) : 0;
  return Number.isFinite(parsedScore) ? parsedScore : 0;
};

const getFirstSeenDate = async (now: Date) => {
  const storedFirstSeenDate = await AsyncStorage.getItem(FIRST_SEEN_DATE_KEY);
  if (storedFirstSeenDate) {
    const parsedDate = new Date(storedFirstSeenDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  await AsyncStorage.setItem(FIRST_SEEN_DATE_KEY, now.toISOString());
  return now;
};

const getPromptDelayMs = () =>
  MIN_PROMPT_DELAY_MS + Math.floor(Math.random() * (MAX_PROMPT_DELAY_MS - MIN_PROMPT_DELAY_MS + 1));

const evaluateReviewPromptEligibility = async (
  score: number,
  options: RecordReviewEngagementOptions
) => {
  if (Platform.OS === 'web' || promptCheckInFlight) {
    return;
  }

  promptCheckInFlight = true;

  try {
    const now = new Date();
    const [firstSeenDate, reviewPromptShown] = await Promise.all([
      getFirstSeenDate(now),
      getStoredBoolean(REVIEW_PROMPT_SHOWN_KEY),
    ]);
    const accountAgeMs = now.getTime() - firstSeenDate.getTime();

    devLog('eligibility check', {
      score,
      firstSeenDate: firstSeenDate.toISOString(),
      accountAgeDays: accountAgeMs / MIN_ACCOUNT_AGE_MS * 7,
      reviewPromptShown,
    });

    if (
      reviewPromptShown ||
      accountAgeMs <= MIN_ACCOUNT_AGE_MS ||
      score < MIN_ENGAGEMENT_SCORE
    ) {
      return;
    }

    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) {
      devLog('native review prompt unavailable');
      return;
    }

    await AsyncStorage.setItem(REVIEW_PROMPT_SHOWN_KEY, 'true');
    trackEvent({
      event_type: 'review_prompt_shown',
      truck_id: options.truckId ?? null,
      user_id: options.userId ?? null,
      metadata: {
        engagement_score: score,
        first_seen_date: firstSeenDate.toISOString(),
      },
    });

    await StoreReview.requestReview();
  } catch (error) {
    devLog('eligibility check failed', { error });
  } finally {
    promptCheckInFlight = false;
  }
};

export const recordReviewEngagement = async (
  event: ReviewEngagementEvent,
  options: RecordReviewEngagementOptions = {}
) => {
  const recordEngagement = async () => {
    try {
      const now = new Date();
      await getFirstSeenDate(now);

      const currentScore = await getStoredScore();
      const nextScore = currentScore + EVENT_POINTS[event];
      await AsyncStorage.setItem(ENGAGEMENT_SCORE_KEY, String(nextScore));

      devLog('recorded engagement', {
        event,
        points: EVENT_POINTS[event],
        previousScore: currentScore,
        nextScore,
        shouldEvaluate: options.shouldEvaluate !== false,
      });

      if (options.shouldEvaluate === false) {
        return;
      }

      if (promptDelayHandle) {
        clearTimeout(promptDelayHandle);
      }

      promptDelayHandle = setTimeout(() => {
        promptDelayHandle = null;
        void evaluateReviewPromptEligibility(nextScore, options);
      }, getPromptDelayMs());
    } catch (error) {
      devLog('failed to record engagement', { event, error });
    }
  };

  engagementWriteQueue = engagementWriteQueue.then(recordEngagement, recordEngagement);
  return engagementWriteQueue;
};
