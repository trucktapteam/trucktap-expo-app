import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';
import { trackEvent } from '@/lib/analytics';
import { getClientRelease } from '@/lib/clientRelease';

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

// Replaces the old one-time-ever "review_prompt_shown" flag with a decision
// record, so re-eligibility can depend on *what* the owner chose last time,
// not just *whether* the card was ever shown.
const LAST_OUTCOME_KEY = 'review_prompt_last_outcome'; // 'dismissed' | 'rated'
const LAST_DECISION_AT_KEY = 'review_prompt_last_decision_at'; // ISO string
const SCORE_AT_DISMISSAL_KEY = 'review_prompt_score_at_dismissal'; // number string
const RATED_APP_VERSION_KEY = 'review_prompt_rated_app_version'; // marketing version string

const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ENGAGEMENT_SCORE = 10;
const MIN_PROMPT_DELAY_MS = 2000;
const MAX_PROMPT_DELAY_MS = 5000;

// "Maybe later": at least a 30-day cooldown, and even after that the owner
// must earn a fresh MIN_ENGAGEMENT_SCORE worth of engagement (the same bar
// as the very first prompt) since the dismissal - time alone never re-arms
// it, only cooldown-elapsed AND fresh-engagement-earned together do.
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// "Rate TruckTap": suppressed until either the app's marketing version
// changes (a new release shipped) or a long fallback window passes (~6
// months, for owners who don't update promptly) - whichever comes first.
const RATE_SUPPRESSION_FALLBACK_MS = 180 * 24 * 60 * 60 * 1000;

const EVENT_POINTS: Record<ReviewEngagementEvent, number> = {
  app_open: 1,
  truck_profile_view: 2,
  favorite_added: 3,
  navigate_click: 5,
};

let promptCheckInFlight = false;
let promptDelayHandle: ReturnType<typeof setTimeout> | null = null;
let engagementWriteQueue = Promise.resolve();

// The branded lead-in card (ReviewPromptLeadIn) registers itself here once,
// mounted globally like MajorReleaseAnnouncement. It is the only UI this
// module shows before calling the native store-review API.
type ReviewLeadInPresenter = (respond: (accepted: boolean) => void) => void;
let leadInPresenter: ReviewLeadInPresenter | null = null;

export const registerReviewLeadInPresenter = (presenter: ReviewLeadInPresenter) => {
  leadInPresenter = presenter;
  return () => {
    if (leadInPresenter === presenter) {
      leadInPresenter = null;
    }
  };
};

// Falls back to "accepted" (skip the card, go straight to the native prompt)
// if no presenter is mounted yet, so eligibility evaluation never silently
// drops an otherwise-eligible prompt due to a mount-order race.
const presentReviewLeadIn = (): Promise<boolean> => {
  if (!leadInPresenter) {
    return Promise.resolve(true);
  }
  const presenter = leadInPresenter;
  return new Promise<boolean>((resolve) => {
    presenter((accepted) => resolve(accepted));
  });
};

const devLog = (message: string, details?: Record<string, unknown>) => {
  if (__DEV__) {
    console.log(`[AppReviewPrompt] ${message}`, details ?? {});
  }
};

const getStoredScore = async () => {
  const storedScore = await AsyncStorage.getItem(ENGAGEMENT_SCORE_KEY);
  const parsedScore = storedScore ? Number.parseInt(storedScore, 10) : 0;
  return Number.isFinite(parsedScore) ? parsedScore : 0;
};

const getStoredNumber = async (key: string): Promise<number | null> => {
  const value = await AsyncStorage.getItem(key);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
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

type LastOutcome = 'dismissed' | 'rated' | null;

type LastDecision = {
  outcome: LastOutcome;
  decisionAt: Date | null;
  scoreAtDismissal: number | null;
  ratedAppVersion: string | null;
};

const getLastDecision = async (): Promise<LastDecision> => {
  const [outcomeRaw, decisionAtRaw, scoreAtDismissal, ratedAppVersion] = await Promise.all([
    AsyncStorage.getItem(LAST_OUTCOME_KEY),
    AsyncStorage.getItem(LAST_DECISION_AT_KEY),
    getStoredNumber(SCORE_AT_DISMISSAL_KEY),
    AsyncStorage.getItem(RATED_APP_VERSION_KEY),
  ]);

  const outcome: LastOutcome =
    outcomeRaw === 'dismissed' || outcomeRaw === 'rated' ? outcomeRaw : null;
  const parsedDecisionAt = decisionAtRaw ? new Date(decisionAtRaw) : null;
  const decisionAt =
    parsedDecisionAt && !Number.isNaN(parsedDecisionAt.getTime()) ? parsedDecisionAt : null;

  return { outcome, decisionAt, scoreAtDismissal, ratedAppVersion };
};

// Returns true while a prior decision still blocks the prompt from
// reappearing. Both branches require every one of their conditions to be
// satisfied together - neither elapsed time alone nor score alone is ever
// sufficient on its own.
const isSuppressedByPriorDecision = (
  decision: LastDecision,
  currentScore: number,
  now: Date
): boolean => {
  if (!decision.outcome) return false;

  if (decision.outcome === 'rated') {
    const { appVersion: currentAppVersion } = getClientRelease();
    const versionChanged = Boolean(
      decision.ratedAppVersion && currentAppVersion && decision.ratedAppVersion !== currentAppVersion
    );
    const fallbackWindowElapsed = Boolean(
      decision.decisionAt && now.getTime() - decision.decisionAt.getTime() >= RATE_SUPPRESSION_FALLBACK_MS
    );
    return !versionChanged && !fallbackWindowElapsed;
  }

  // decision.outcome === 'dismissed'
  const cooldownElapsed = Boolean(
    decision.decisionAt && now.getTime() - decision.decisionAt.getTime() >= DISMISS_COOLDOWN_MS
  );
  const freshEngagementEarned = currentScore - (decision.scoreAtDismissal ?? 0) >= MIN_ENGAGEMENT_SCORE;
  return !(cooldownElapsed && freshEngagementEarned);
};

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
    const [firstSeenDate, lastDecision] = await Promise.all([
      getFirstSeenDate(now),
      getLastDecision(),
    ]);
    const accountAgeMs = now.getTime() - firstSeenDate.getTime();

    devLog('eligibility check', {
      score,
      firstSeenDate: firstSeenDate.toISOString(),
      accountAgeDays: (accountAgeMs / MIN_ACCOUNT_AGE_MS) * 7,
      lastDecision,
    });

    if (accountAgeMs <= MIN_ACCOUNT_AGE_MS || score < MIN_ENGAGEMENT_SCORE) {
      return;
    }

    if (isSuppressedByPriorDecision(lastDecision, score, now)) {
      return;
    }

    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) {
      devLog('native review prompt unavailable');
      return;
    }

    trackEvent({
      event_type: 'review_prompt_shown',
      truck_id: options.truckId ?? null,
      user_id: options.userId ?? null,
      metadata: {
        engagement_score: score,
        first_seen_date: firstSeenDate.toISOString(),
        prior_outcome: lastDecision.outcome,
      },
    });

    const accepted = await presentReviewLeadIn();
    const decisionAt = new Date();

    if (accepted) {
      // expo-store-review's requestReview() presents the native OS sheet but
      // does not report back whether the person actually submitted a
      // rating (iOS and Android both withhold that outcome from apps) - we
      // only ever know that the owner chose to invoke it, never the result.
      await StoreReview.requestReview();

      const { appVersion } = getClientRelease();
      await Promise.all([
        AsyncStorage.setItem(LAST_OUTCOME_KEY, 'rated'),
        AsyncStorage.setItem(LAST_DECISION_AT_KEY, decisionAt.toISOString()),
        appVersion
          ? AsyncStorage.setItem(RATED_APP_VERSION_KEY, appVersion)
          : AsyncStorage.removeItem(RATED_APP_VERSION_KEY),
      ]);
    } else {
      await Promise.all([
        AsyncStorage.setItem(LAST_OUTCOME_KEY, 'dismissed'),
        AsyncStorage.setItem(LAST_DECISION_AT_KEY, decisionAt.toISOString()),
        AsyncStorage.setItem(SCORE_AT_DISMISSAL_KEY, String(score)),
      ]);
    }
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
