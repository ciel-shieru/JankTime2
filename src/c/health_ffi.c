#include <pebble.h>
#include <stdint.h>
#include <stdbool.h>
#include <time.h>

#define HEALTH_SAMPLE_CAPACITY 16
#define HEALTH_HISTORY_RECORDS 120
#define DEFAULT_HEALTH_HISTORY_MINUTES 120
#define MIN_HEALTH_HISTORY_MINUTES 5
#define MAX_HEALTH_HISTORY_MINUTES (24 * 60)

enum {
  METRIC_STEP_COUNT = 0,
  METRIC_TOTAL_SLEEP_MINUTES = 1,
  METRIC_RESTFUL_SLEEP_MINUTES = 2,
  METRIC_CURRENT_HEART_RATE = 3,
  METRIC_IS_SLEEPING = 4,
};

static int32_t s_metric_values[5] = { -1, -1, -1, -1, -1 };
static int32_t s_heart_samples[HEALTH_SAMPLE_CAPACITY];
static int32_t s_heart_sample_count = 0;
static uint8_t s_valid_heart_rates[MAX_HEALTH_HISTORY_MINUTES];
static HealthMinuteData s_history[HEALTH_HISTORY_RECORDS];

int32_t health_refresh(int32_t history_minutes) {
  s_metric_values[METRIC_STEP_COUNT] = -1;
  s_metric_values[METRIC_TOTAL_SLEEP_MINUTES] = -1;
  s_metric_values[METRIC_RESTFUL_SLEEP_MINUTES] = -1;
  s_metric_values[METRIC_CURRENT_HEART_RATE] = -1;
  s_metric_values[METRIC_IS_SLEEPING] = -1;
  s_heart_sample_count = 0;

#if defined(PBL_HEALTH)
  const time_t now = time(NULL);
  const time_t activity_start = now - (24 * 60 * 60);
  const HealthActivityMask sleep_activities =
      HealthActivitySleep | HealthActivityRestfulSleep;
  const HealthServiceAccessibilityMask activity_access =
      health_service_any_activity_accessible(sleep_activities, activity_start, now);
  if (activity_access & HealthServiceAccessibilityMaskAvailable) {
    const HealthActivityMask active_activities = health_service_peek_current_activities();
    s_metric_values[METRIC_IS_SLEEPING] =
        (active_activities & sleep_activities) != 0 ? 1 : 0;
  }

  // Step totals are not displayed in low-power mode; avoid querying them while
  // the local HealthService activity state says the user is asleep.
  if (s_metric_values[METRIC_IS_SLEEPING] != 1) {
    const time_t start_of_today = time_start_of_today();
    const HealthServiceAccessibilityMask steps_access =
        health_service_metric_accessible(HealthMetricStepCount, start_of_today, now);
    if (steps_access & HealthServiceAccessibilityMaskAvailable) {
      const HealthValue steps = health_service_sum_today(HealthMetricStepCount);
      if (steps >= 0) s_metric_values[METRIC_STEP_COUNT] = (int32_t)steps;
    }
  }

  const time_t sleep_start = now - (24 * 60 * 60);
  const HealthServiceAccessibilityMask total_access =
      health_service_metric_accessible(HealthMetricSleepSeconds, sleep_start, now);
  if (total_access & HealthServiceAccessibilityMaskAvailable) {
    const HealthValue seconds = health_service_sum(HealthMetricSleepSeconds, sleep_start, now);
    if (seconds >= 0) s_metric_values[METRIC_TOTAL_SLEEP_MINUTES] = (int32_t)((seconds + 30) / 60);
  }
  const HealthServiceAccessibilityMask restful_access =
      health_service_metric_accessible(HealthMetricSleepRestfulSeconds, sleep_start, now);
  if (restful_access & HealthServiceAccessibilityMaskAvailable) {
    const HealthValue seconds = health_service_sum(HealthMetricSleepRestfulSeconds, sleep_start, now);
    if (seconds >= 0) s_metric_values[METRIC_RESTFUL_SLEEP_MINUTES] = (int32_t)((seconds + 30) / 60);
  }

  if (history_minutes < MIN_HEALTH_HISTORY_MINUTES ||
      history_minutes > MAX_HEALTH_HISTORY_MINUTES) {
    history_minutes = DEFAULT_HEALTH_HISTORY_MINUTES;
  }

  // Query chronologically with a fixed work buffer. HealthService updates the
  // returned end timestamp to the end of the last record; resume there to avoid
  // allocating a full 24-hour HealthMinuteData array.
  const time_t history_end = now;
  time_t query_start = history_end - ((time_t)history_minutes * 60);
  int32_t valid_count = 0;
  while (query_start < history_end && valid_count < history_minutes) {
    const time_t previous_start = query_start;
    time_t returned_start = query_start;
    time_t returned_end = history_end;
    const uint32_t history_count = health_service_get_minute_history(
        s_history, HEALTH_HISTORY_RECORDS, &returned_start, &returned_end);
    if (history_count == 0) break;

    for (uint32_t i = 0; i < history_count && i < HEALTH_HISTORY_RECORDS &&
         valid_count < history_minutes; i++) {
      if (s_history[i].is_invalid) continue;
      const int32_t bpm = (int32_t)s_history[i].heart_rate_bpm;
      if (bpm < 20 || bpm > 240) continue;
      s_valid_heart_rates[valid_count++] = (uint8_t)bpm;
    }

    if (returned_end <= previous_start) break;
    query_start = returned_end;
  }

  const HealthValue current_bpm = health_service_peek_current_value(HealthMetricHeartRateBPM);
  if (current_bpm >= 20 && current_bpm <= 240) {
    s_metric_values[METRIC_CURRENT_HEART_RATE] = (int32_t)current_bpm;
  }

  if (valid_count > 0) {
    const int32_t newest_index = valid_count - 1;
    if (s_metric_values[METRIC_CURRENT_HEART_RATE] < 20 ||
        s_metric_values[METRIC_CURRENT_HEART_RATE] > 240) {
      // Use the newest history value only when HealthService has no current value.
      s_metric_values[METRIC_CURRENT_HEART_RATE] = (int32_t)s_valid_heart_rates[newest_index];
    }
    const int32_t output_count = valid_count < HEALTH_SAMPLE_CAPACITY
        ? valid_count : HEALTH_SAMPLE_CAPACITY;
    for (int32_t i = 0; i < output_count; i++) {
      const int32_t source_index = output_count == 1 ? newest_index : (i * newest_index) / (output_count - 1);
      s_heart_samples[i] = (int32_t)s_valid_heart_rates[source_index];
    }
    s_heart_sample_count = output_count;
  }
#endif

  return 1;
}

int32_t health_metric(int32_t metric) {
  if (metric < METRIC_STEP_COUNT || metric > METRIC_IS_SLEEPING) return -1;
  return s_metric_values[metric];
}

int32_t health_sample_count(void) {
  return s_heart_sample_count;
}

int32_t health_sample(int32_t index) {
  if (index < 0 || index >= s_heart_sample_count || index >= HEALTH_SAMPLE_CAPACITY) return -1;
  return s_heart_samples[index];
}
