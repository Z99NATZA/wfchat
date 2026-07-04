use axum::http::{HeaderMap, HeaderValue};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    session::session_id_from_headers,
};

const DEFAULT_WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone, Debug)]
pub struct RateLimiter {
    inner: Arc<Mutex<RateLimiterState>>,
    policies: RateLimitPolicies,
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new(RateLimitPolicies::default())
    }
}

impl RateLimiter {
    pub fn new(policies: RateLimitPolicies) -> Self {
        Self {
            inner: Arc::new(Mutex::new(RateLimiterState::default())),
            policies,
        }
    }

    pub fn check(&self, family: RateLimitFamily, identity: RateLimitIdentity) -> AppResult<()> {
        let policy = self.policies.policy_for(family);
        let now = Instant::now();
        let mut state = self.inner.lock().map_err(|_| AppError::RateLimited)?;

        state.retain_active(now);

        let key = RateLimitKey { family, identity };
        let bucket = state.buckets.entry(key).or_insert_with(|| RateLimitBucket {
            window_started_at: now,
            count: 0,
        });

        if now.duration_since(bucket.window_started_at) >= policy.window {
            bucket.window_started_at = now;
            bucket.count = 0;
        }

        if bucket.count >= policy.max_requests {
            return Err(AppError::RateLimited);
        }

        bucket.count += 1;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug)]
pub struct RateLimitPolicies {
    chat_messages: RateLimitPolicy,
    assistant_speech: RateLimitPolicy,
    user_transcription: RateLimitPolicy,
    image_upload: RateLimitPolicy,
}

impl Default for RateLimitPolicies {
    fn default() -> Self {
        Self {
            chat_messages: RateLimitPolicy::per_minute(20),
            assistant_speech: RateLimitPolicy::per_minute(10),
            user_transcription: RateLimitPolicy::per_minute(6),
            image_upload: RateLimitPolicy::per_minute(12),
        }
    }
}

impl RateLimitPolicies {
    pub fn with_family_limit(mut self, family: RateLimitFamily, policy: RateLimitPolicy) -> Self {
        match family {
            RateLimitFamily::ChatMessages => self.chat_messages = policy,
            RateLimitFamily::AssistantSpeech => self.assistant_speech = policy,
            RateLimitFamily::UserTranscription => self.user_transcription = policy,
            RateLimitFamily::ImageUpload => self.image_upload = policy,
        }
        self
    }

    fn policy_for(&self, family: RateLimitFamily) -> RateLimitPolicy {
        match family {
            RateLimitFamily::ChatMessages => self.chat_messages,
            RateLimitFamily::AssistantSpeech => self.assistant_speech,
            RateLimitFamily::UserTranscription => self.user_transcription,
            RateLimitFamily::ImageUpload => self.image_upload,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct RateLimitPolicy {
    max_requests: u32,
    window: Duration,
}

impl RateLimitPolicy {
    pub fn per_minute(max_requests: u32) -> Self {
        Self {
            max_requests,
            window: DEFAULT_WINDOW,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum RateLimitFamily {
    ChatMessages,
    AssistantSpeech,
    UserTranscription,
    ImageUpload,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum RateLimitIdentity {
    Session(Uuid),
    Ip(String),
}

impl RateLimitIdentity {
    pub fn from_request(headers: &HeaderMap) -> RateLimitIdentity {
        session_id_from_headers(headers)
            .map(RateLimitIdentity::Session)
            .unwrap_or_else(|| RateLimitIdentity::Ip(client_ip_from_request(headers)))
    }
}

#[derive(Debug, Default)]
struct RateLimiterState {
    buckets: HashMap<RateLimitKey, RateLimitBucket>,
}

impl RateLimiterState {
    fn retain_active(&mut self, now: Instant) {
        self.buckets
            .retain(|_, bucket| now.duration_since(bucket.window_started_at) < DEFAULT_WINDOW);
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct RateLimitKey {
    family: RateLimitFamily,
    identity: RateLimitIdentity,
}

#[derive(Debug)]
struct RateLimitBucket {
    window_started_at: Instant,
    count: u32,
}

fn client_ip_from_request(headers: &HeaderMap) -> String {
    forwarded_ip(headers)
        .or_else(|| header_str(headers, "x-real-ip").map(str::to_owned))
        .unwrap_or_else(|| "unknown".to_owned())
}

fn forwarded_ip(headers: &HeaderMap) -> Option<String> {
    let value = header_str(headers, "x-forwarded-for")?;
    value
        .split(',')
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(name)
        .and_then(|value: &HeaderValue| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limiter_allows_then_rejects_exceeded_session_bucket() {
        let limiter = RateLimiter::new(RateLimitPolicies::default().with_family_limit(
            RateLimitFamily::ChatMessages,
            RateLimitPolicy::per_minute(1),
        ));
        let identity = RateLimitIdentity::Session(Uuid::new_v4());

        assert!(limiter
            .check(RateLimitFamily::ChatMessages, identity.clone())
            .is_ok());
        assert!(matches!(
            limiter.check(RateLimitFamily::ChatMessages, identity),
            Err(AppError::RateLimited)
        ));
    }

    #[test]
    fn limiter_isolates_sensitive_endpoint_families() {
        let policies = RateLimitPolicies::default()
            .with_family_limit(
                RateLimitFamily::ChatMessages,
                RateLimitPolicy::per_minute(1),
            )
            .with_family_limit(
                RateLimitFamily::AssistantSpeech,
                RateLimitPolicy::per_minute(1),
            )
            .with_family_limit(
                RateLimitFamily::UserTranscription,
                RateLimitPolicy::per_minute(1),
            )
            .with_family_limit(RateLimitFamily::ImageUpload, RateLimitPolicy::per_minute(1));
        let limiter = RateLimiter::new(policies);
        let identity = RateLimitIdentity::Session(Uuid::new_v4());

        assert!(limiter
            .check(RateLimitFamily::ChatMessages, identity.clone())
            .is_ok());
        assert!(limiter
            .check(RateLimitFamily::AssistantSpeech, identity.clone())
            .is_ok());
        assert!(limiter
            .check(RateLimitFamily::UserTranscription, identity.clone())
            .is_ok());
        assert!(limiter
            .check(RateLimitFamily::ImageUpload, identity.clone())
            .is_ok());
        assert!(matches!(
            limiter.check(RateLimitFamily::ChatMessages, identity),
            Err(AppError::RateLimited)
        ));
    }

    #[test]
    fn identity_uses_ip_fallback_when_session_header_is_missing() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.10, 10.0.0.2".parse().unwrap());

        assert_eq!(
            RateLimitIdentity::from_request(&headers),
            RateLimitIdentity::Ip("203.0.113.10".to_owned())
        );
    }
}
