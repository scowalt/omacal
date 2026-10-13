//! Native timing is a provider/write fact; presentation belongs to an interval.
//! Google OOO uses dateTime even when it blocks complete local calendar days.

use crate::{date_in_zone, Interval};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Presentation {
    Timed,
    AllDay { start_date: String, end_date_exclusive: String, timezone: String },
}

impl Presentation {
    pub fn is_all_day(&self) -> bool {
        matches!(self, Self::AllDay { .. })
    }

    /// Existing UI/detail dates have an inclusive last day, unlike storage
    /// and provider endpoints. Adapt here, once, using civil-day arithmetic.
    pub fn inclusive_dates(&self) -> Option<(String, String)> {
        let Self::AllDay { start_date, end_date_exclusive, .. } = self else { return None };
        let last = end_date_exclusive.parse::<jiff::civil::Date>().ok()
            .and_then(|d| d.yesterday().ok())
            .map_or_else(|| start_date.clone(), |d| d.to_string());
        Some((start_date.clone(), last))
    }

    pub fn timezone(&self) -> Option<&str> {
        match self {
            Self::AllDay { timezone, .. } => Some(timezone),
            Self::Timed => None,
        }
    }
}

/// Present the actual interval, never a master's cached classification.
/// Native all-day keeps calendar-zone semantics, including legacy fallbacks.
pub fn presentation(
    native_all_day: bool,
    google_event_type: Option<&str>,
    interval: Interval,
    event_timezone: &str,
    calendar_timezone: &str,
) -> Presentation {
    if native_all_day {
        return Presentation::AllDay {
            start_date: date_in_zone(interval.start_ms, calendar_timezone),
            end_date_exclusive: date_in_zone(interval.end_ms, calendar_timezone),
            timezone: calendar_timezone.to_string(),
        };
    }
    if google_event_type != Some("outOfOffice") || interval.end_ms <= interval.start_ms {
        return Presentation::Timed;
    }
    let zone = if event_timezone.is_empty() { calendar_timezone } else { event_timezone };
    // Fail closed for OOO: UTC fallbacks could invent whole authored days.
    let Ok(start) = jiff::Timestamp::from_millisecond(interval.start_ms).and_then(|t| t.in_tz(zone)) else {
        return Presentation::Timed;
    };
    let Ok(end) = jiff::Timestamp::from_millisecond(interval.end_ms).and_then(|t| t.in_tz(zone)) else {
        return Presentation::Timed;
    };
    if start.time() != jiff::civil::Time::midnight()
        || end.time() != jiff::civil::Time::midnight()
        || end.date() <= start.date()
    {
        return Presentation::Timed;
    }
    Presentation::AllDay {
        start_date: start.date().to_string(),
        end_date_exclusive: end.date().to_string(),
        timezone: zone.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn out_of_office_midnights_present_october_16_through_20_without_changing_instants() {
        let iv = Interval { start_ms: 1792123200000, end_ms: 1792555200000 };
        let shown = presentation(false, Some("outOfOffice"), iv, "America/New_York", "Pacific/Auckland");
        assert_eq!(shown.inclusive_dates(), Some(("2026-10-16".into(), "2026-10-20".into())));
        assert_eq!(shown.timezone(), Some("America/New_York"));
        assert_eq!((iv.start_ms, iv.end_ms), (1792123200000, 1792555200000));
    }

    #[test]
    fn only_identified_ooo_complete_local_days_qualify_including_dst() {
        let ms = |s: &str| s.parse::<jiff::Timestamp>().unwrap().as_millisecond();
        let iv = Interval { start_ms: 1792123200000, end_ms: 1792555200000 };
        for kind in [None, Some("default"), Some("focusTime"), Some("futureType"), Some("outofoffice")] {
            assert_eq!(presentation(false, kind, iv, "America/New_York", "UTC"), Presentation::Timed, "{kind:?}");
        }
        for (start, end, qualifies) in [
            ("2026-03-08T00:00:00-05:00", "2026-03-09T00:00:00-04:00", true),
            ("2026-11-01T00:00:00-04:00", "2026-11-02T00:00:00-05:00", true),
            ("2026-03-08T00:00:00-05:00", "2026-03-09T01:00:00-04:00", false),
            ("2026-11-01T00:00:00-04:00", "2026-11-01T23:00:00-05:00", false),
            ("2026-10-16T09:00:00-04:00", "2026-10-21T09:00:00-04:00", false),
            ("2026-10-16T00:00:00.001-04:00", "2026-10-21T00:00:00-04:00", false),
            ("2026-10-16T00:00:00-04:00", "2026-10-16T00:00:00-04:00", false),
            ("2026-10-21T00:00:00-04:00", "2026-10-16T00:00:00-04:00", false),
        ] {
            let interval = Interval { start_ms: ms(start), end_ms: ms(end) };
            assert_eq!(presentation(false, Some("outOfOffice"), interval, "America/New_York", "UTC").is_all_day(), qualifies,
                "{start} → {end}");
        }
        assert_eq!(presentation(false, Some("outOfOffice"), iv, "Unknown/Zone", "UTC"), Presentation::Timed);
        assert!(presentation(false, Some("outOfOffice"), iv, "", "America/New_York").is_all_day());
        assert_eq!(presentation(false, Some("outOfOffice"), Interval { start_ms: i64::MIN, end_ms: i64::MAX }, "UTC", "UTC"), Presentation::Timed);
    }

    #[test]
    fn native_all_day_keeps_calendar_dates_and_its_existing_fallback() {
        let iv = Interval { start_ms: 1792123200000, end_ms: 1792555200000 };
        assert_eq!(presentation(true, None, iv, "Pacific/Auckland", "America/New_York").inclusive_dates(),
            Some(("2026-10-16".into(), "2026-10-20".into())));
        assert!(presentation(true, None, iv, "UTC", "Unknown/Zone").is_all_day());
    }
}
