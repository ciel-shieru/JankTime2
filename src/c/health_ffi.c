#include <pebble.h>
#include <stdint.h>
#include <stdbool.h>
#include <time.h>

#define HEALTH_SAMPLE_CAPACITY 16
#define HEALTH_HISTORY_RECORDS 120
#define HEALTH_LOOKBACK_SECONDS (2 * 60 * 60)

enum {
  METRIC_STEP_COUNT = 0,
  METRIC_TOTAL_SLEEP_MINUTES = 1,
  METRIC_RESTFUL_SLEEP_MINUTES = 2,
  METRIC_CURRENT_HEART_RATE = 3,
};

static int32_t s_metric_values[4] = { -1, -1, -1, -1 };
static int32_t s_heart_samples[HEALTH_SAMPLE_CAPACITY];
static int32_t s_heart_sample_count = 0;
static HealthMinuteData s_history[HEALTH_HISTORY_RECORDS];

int32_t health_refresh(void) {
  s_metric_values[METRIC_STEP_COUNT] = -1;
  s_metric_values[METRIC_TOTAL_SLEEP_MINUTES] = -1;
  s_metric_values[METRIC_RESTFUL_SLEEP_MINUTES] = -1;
  s_metric_values[METRIC_CURRENT_HEART_RATE] = -1;
  s_heart_sample_count = 0;

#if defined(PBL_HEALTH)
  const time_t now = time(NULL);
  const time_t start_of_today = time_start_of_today();
  const HealthServiceAccessibilityMask steps_access =
      health_service_metric_accessible(HealthMetricStepCount, start_of_today, now);
  if (steps_access & HealthServiceAccessibilityMaskAvailable) {
    const HealthValue steps = health_service_sum_today(HealthMetricStepCount);
    if (steps >= 0) s_metric_values[METRIC_STEP_COUNT] = (int32_t)steps;
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

  time_t history_start = now - HEALTH_LOOKBACK_SECONDS;
  time_t history_end = now;
  const uint32_t history_count = health_service_get_minute_history(
      s_history, HEALTH_HISTORY_RECORDS, &history_start, &history_end);
  int32_t valid_count = 0;
  for (uint32_t i = 0; i < history_count && i < HEALTH_HISTORY_RECORDS; i++) {
    if (s_history[i].is_invalid) continue;
    const int32_t bpm = (int32_t)s_history[i].heart_rate_bpm;
    if (bpm < 20 || bpm > 240) continue;
    // Compact valid values in place; destination is never ahead of source.
    s_history[valid_count].heart_rate_bpm = (uint8_t)bpm;
    valid_count++;
  }

  if (valid_count > 0) {
    const int32_t newest_index = valid_count - 1;
    s_metric_values[METRIC_CURRENT_HEART_RATE] = (int32_t)s_history[newest_index].heart_rate_bpm;
    const int32_t output_count = valid_count < HEALTH_SAMPLE_CAPACITY
        ? valid_count : HEALTH_SAMPLE_CAPACITY;
    for (int32_t i = 0; i < output_count; i++) {
      const int32_t source_index = output_count == 1 ? newest_index : (i * newest_index) / (output_count - 1);
      s_heart_samples[i] = (int32_t)s_history[source_index].heart_rate_bpm;
    }
    s_heart_sample_count = output_count;
  } else {
    const HealthValue current = health_service_peek_current_value(HealthMetricHeartRateBPM);
    if (current >= 20 && current <= 240) s_metric_values[METRIC_CURRENT_HEART_RATE] = (int32_t)current;
  }
#endif

  return 1;
}

int32_t health_metric(int32_t metric) {
  if (metric < METRIC_STEP_COUNT || metric > METRIC_CURRENT_HEART_RATE) return -1;
  return s_metric_values[metric];
}

int32_t health_sample_count(void) {
  return s_heart_sample_count;
}

int32_t health_sample(int32_t index) {
  if (index < 0 || index >= s_heart_sample_count || index >= HEALTH_SAMPLE_CAPACITY) return -1;
  return s_heart_samples[index];
}
