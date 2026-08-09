use axum::http::HeaderMap;
use ipnet::IpNet;
use std::{
    collections::{HashMap, HashSet},
    net::IpAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult, ErrorReason, LIMIT_RETRY_AFTER_SECONDS},
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
        self.check_many(family, [identity])
    }

    pub fn check_many(
        &self,
        family: RateLimitFamily,
        identities: impl IntoIterator<Item = RateLimitIdentity>,
    ) -> AppResult<()> {
        let now = Instant::now();
        let mut state = self.inner.lock().map_err(|_| AppError::RateLimited)?;

        state.retain_active(now);
        let keys = identities
            .into_iter()
            .map(|identity| RateLimitKey { family, identity })
            .collect::<Vec<_>>();

        for key in &keys {
            let policy = self.policies.policy_for(key);
            let bucket = state
                .buckets
                .entry(key.clone())
                .or_insert_with(|| RateLimitBucket {
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
        }
        for key in keys {
            if let Some(bucket) = state.buckets.get_mut(&key) {
                bucket.count += 1;
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug)]
pub struct RateLimitPolicies {
    guest_sessions: RateLimitPolicy,
    guest_global: RateLimitPolicy,
    chat_messages: RateLimitPolicy,
    assistant_speech: RateLimitPolicy,
    user_transcription: RateLimitPolicy,
    image_upload: RateLimitPolicy,
    chat_global: RateLimitPolicy,
}

impl Default for RateLimitPolicies {
    fn default() -> Self {
        Self {
            guest_sessions: RateLimitPolicy::per_minute(10),
            guest_global: RateLimitPolicy::per_minute(60),
            chat_messages: RateLimitPolicy::per_minute(20),
            assistant_speech: RateLimitPolicy::per_minute(10),
            user_transcription: RateLimitPolicy::per_minute(6),
            image_upload: RateLimitPolicy::per_minute(12),
            chat_global: RateLimitPolicy::per_minute(120),
        }
    }
}

impl RateLimitPolicies {
    pub fn from_config(config: &Config) -> Self {
        Self {
            guest_sessions: RateLimitPolicy::per_minute(config.security.guest_requests_per_minute),
            guest_global: RateLimitPolicy::per_minute(
                config.security.guest_global_requests_per_minute,
            ),
            chat_messages: RateLimitPolicy::per_minute(config.security.chat.requests_per_minute),
            chat_global: RateLimitPolicy::per_minute(
                config.security.chat.global_requests_per_minute,
            ),
            ..Self::default()
        }
    }

    pub fn with_family_limit(mut self, family: RateLimitFamily, policy: RateLimitPolicy) -> Self {
        match family {
            RateLimitFamily::GuestSessions => self.guest_sessions = policy,
            RateLimitFamily::ChatMessages => self.chat_messages = policy,
            RateLimitFamily::AssistantSpeech => self.assistant_speech = policy,
            RateLimitFamily::UserTranscription => self.user_transcription = policy,
            RateLimitFamily::ImageUpload => self.image_upload = policy,
        }
        self
    }

    #[cfg(test)]
    pub fn with_chat_global_limit(mut self, policy: RateLimitPolicy) -> Self {
        self.chat_global = policy;
        self
    }

    #[cfg(test)]
    pub fn with_guest_global_limit(mut self, policy: RateLimitPolicy) -> Self {
        self.guest_global = policy;
        self
    }

    fn policy_for(&self, key: &RateLimitKey) -> RateLimitPolicy {
        if key.identity == RateLimitIdentity::Global {
            return match key.family {
                RateLimitFamily::GuestSessions => self.guest_global,
                RateLimitFamily::ChatMessages => self.chat_global,
                _ => match key.family {
                    RateLimitFamily::AssistantSpeech => self.assistant_speech,
                    RateLimitFamily::UserTranscription => self.user_transcription,
                    RateLimitFamily::ImageUpload => self.image_upload,
                    RateLimitFamily::GuestSessions | RateLimitFamily::ChatMessages => {
                        unreachable!()
                    }
                },
            };
        }
        match key.family {
            RateLimitFamily::GuestSessions => self.guest_sessions,
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
    GuestSessions,
    ChatMessages,
    AssistantSpeech,
    UserTranscription,
    ImageUpload,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum RateLimitIdentity {
    Session(Uuid),
    Ip(String),
    Global,
}

impl RateLimitIdentity {
    pub fn for_resolved_ip(
        headers: &HeaderMap,
        peer_ip: IpAddr,
        trust_proxy_headers: bool,
        trusted_proxy_cidrs: &[IpNet],
        include_global: bool,
    ) -> Vec<RateLimitIdentity> {
        let resolved_ip =
            client_ip_from_request(headers, peer_ip, trust_proxy_headers, trusted_proxy_cidrs);
        let mut identities = vec![RateLimitIdentity::Ip(resolved_ip.to_string())];
        if include_global {
            identities.push(RateLimitIdentity::Global);
        }
        identities
    }

    pub fn for_validated_session(
        session_id: Uuid,
        headers: &HeaderMap,
        peer_ip: IpAddr,
        trust_proxy_headers: bool,
        trusted_proxy_cidrs: &[IpNet],
        include_global: bool,
    ) -> Vec<RateLimitIdentity> {
        let mut identities = vec![RateLimitIdentity::Session(session_id)];
        identities.extend(Self::for_resolved_ip(
            headers,
            peer_ip,
            trust_proxy_headers,
            trusted_proxy_cidrs,
            include_global,
        ));
        identities
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

fn client_ip_from_request(
    headers: &HeaderMap,
    peer_ip: IpAddr,
    trust_proxy_headers: bool,
    trusted_proxy_cidrs: &[IpNet],
) -> IpAddr {
    let peer_ip = normalize_ip(peer_ip);
    if !trust_proxy_headers || !is_trusted_ip(peer_ip, trusted_proxy_cidrs) {
        return peer_ip;
    }

    let mut values = headers.get_all("x-forwarded-for").iter();
    let Some(value) = values.next() else {
        return peer_ip;
    };
    if values.next().is_some() {
        return peer_ip;
    }
    let Ok(value) = value.to_str() else {
        return peer_ip;
    };
    if value.trim().is_empty() {
        return peer_ip;
    }

    let mut forwarded = Vec::new();
    for entry in value.split(',') {
        let entry = entry.trim();
        let Ok(address) = entry.parse::<IpAddr>() else {
            return peer_ip;
        };
        forwarded.push(normalize_ip(address));
    }

    forwarded
        .into_iter()
        .rev()
        .find(|address| !is_trusted_ip(*address, trusted_proxy_cidrs))
        .unwrap_or(peer_ip)
}

fn normalize_ip(address: IpAddr) -> IpAddr {
    match address {
        IpAddr::V6(address) => address
            .to_ipv4_mapped()
            .map(IpAddr::V4)
            .unwrap_or(IpAddr::V6(address)),
        address => address,
    }
}

fn is_trusted_ip(address: IpAddr, trusted_proxy_cidrs: &[IpNet]) -> bool {
    trusted_proxy_cidrs
        .iter()
        .any(|network| network.contains(&address))
}

#[derive(Clone, Debug)]
pub struct GenerationLimiter {
    inner: Arc<GenerationLimiterInner>,
}

#[derive(Debug)]
struct GenerationLimiterInner {
    global: Arc<Semaphore>,
    active: Mutex<ActiveGenerations>,
    max_per_session: usize,
}

#[derive(Debug, Default)]
struct ActiveGenerations {
    chats: HashSet<Uuid>,
    sessions: HashMap<Uuid, usize>,
}

pub struct GenerationPermit {
    limiter: GenerationLimiter,
    session_id: Option<Uuid>,
    chat_id: Uuid,
    _global: Option<OwnedSemaphorePermit>,
}

impl GenerationLimiter {
    pub fn new(max_global: usize, max_per_session: usize) -> Self {
        Self {
            inner: Arc::new(GenerationLimiterInner {
                global: Arc::new(Semaphore::new(max_global)),
                active: Mutex::new(ActiveGenerations::default()),
                max_per_session,
            }),
        }
    }

    pub fn try_acquire(&self, session_id: Uuid, chat_id: Uuid) -> AppResult<GenerationPermit> {
        let mut active = self
            .inner
            .active
            .lock()
            .map_err(|_| generation_limit_error(ErrorReason::GenerationProcessCapacity))?;
        if active.chats.contains(&chat_id) {
            return Err(generation_limit_error(ErrorReason::ChatGenerationActive));
        }
        if active
            .sessions
            .get(&session_id)
            .copied()
            .unwrap_or_default()
            >= self.inner.max_per_session
        {
            return Err(generation_limit_error(
                ErrorReason::GenerationSessionCapacity,
            ));
        }
        let global = self
            .inner
            .global
            .clone()
            .try_acquire_owned()
            .map_err(|_| generation_limit_error(ErrorReason::GenerationProcessCapacity))?;
        active.chats.insert(chat_id);
        *active.sessions.entry(session_id).or_default() += 1;
        drop(active);

        Ok(GenerationPermit {
            limiter: self.clone(),
            session_id: Some(session_id),
            chat_id,
            _global: Some(global),
        })
    }

    pub fn try_acquire_clear(&self, chat_id: Uuid) -> AppResult<GenerationPermit> {
        let mut active = self
            .inner
            .active
            .lock()
            .map_err(|_| AppError::Conflict("chat generation in progress".to_owned()))?;
        if !active.chats.insert(chat_id) {
            return Err(AppError::Conflict("chat generation in progress".to_owned()));
        }
        drop(active);

        Ok(GenerationPermit {
            limiter: self.clone(),
            session_id: None,
            chat_id,
            _global: None,
        })
    }
}

fn generation_limit_error(reason: ErrorReason) -> AppError {
    AppError::reasoned(
        axum::http::StatusCode::TOO_MANY_REQUESTS,
        "too many requests",
        reason,
        Some(LIMIT_RETRY_AFTER_SECONDS),
    )
}

impl Drop for GenerationPermit {
    fn drop(&mut self) {
        if let Ok(mut active) = self.limiter.inner.active.lock() {
            active.chats.remove(&self.chat_id);
            if let Some(session_id) = self.session_id {
                if let Some(count) = active.sessions.get_mut(&session_id) {
                    *count = count.saturating_sub(1);
                    if *count == 0 {
                        active.sessions.remove(&session_id);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

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
    fn direct_identity_uses_normalized_peer_and_ignores_forwarded_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.10, 10.0.0.2".parse().unwrap());

        assert_eq!(
            RateLimitIdentity::for_validated_session(
                Uuid::nil(),
                &headers,
                "::ffff:192.0.2.8".parse().unwrap(),
                false,
                &[],
                true,
            ),
            vec![
                RateLimitIdentity::Session(Uuid::nil()),
                RateLimitIdentity::Ip("192.0.2.8".to_owned()),
                RateLimitIdentity::Global,
            ]
        );
    }

    #[test]
    fn trusted_proxy_chain_walks_xff_from_right_to_left() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "198.51.100.4, 203.0.113.10, 10.0.0.2".parse().unwrap(),
        );
        let trusted = [
            "10.0.0.0/8".parse::<IpNet>().unwrap(),
            "203.0.113.0/24".parse().unwrap(),
        ];

        assert_eq!(
            RateLimitIdentity::for_validated_session(
                Uuid::nil(),
                &headers,
                "10.0.0.3".parse().unwrap(),
                true,
                &trusted,
                false,
            ),
            vec![
                RateLimitIdentity::Session(Uuid::nil()),
                RateLimitIdentity::Ip("198.51.100.4".to_owned()),
            ]
        );
    }

    #[test]
    fn untrusted_peer_cannot_spoof_xff() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "198.51.100.4".parse().unwrap());
        let trusted = ["10.0.0.0/8".parse::<IpNet>().unwrap()];

        let identities = RateLimitIdentity::for_validated_session(
            Uuid::nil(),
            &headers,
            "192.0.2.9".parse().unwrap(),
            true,
            &trusted,
            false,
        );

        assert_eq!(identities[1], RateLimitIdentity::Ip("192.0.2.9".to_owned()));
    }

    #[test]
    fn ipv4_mapped_trusted_peer_is_normalized_before_cidr_comparison() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "198.51.100.4".parse().unwrap());
        let trusted = ["10.0.0.0/8".parse::<IpNet>().unwrap()];

        let identities = RateLimitIdentity::for_validated_session(
            Uuid::nil(),
            &headers,
            "::ffff:10.0.0.3".parse().unwrap(),
            true,
            &trusted,
            false,
        );

        assert_eq!(
            identities[1],
            RateLimitIdentity::Ip("198.51.100.4".to_owned())
        );
    }

    #[test]
    fn malformed_multiple_and_all_trusted_xff_fall_back_to_peer() {
        let peer = "10.0.0.3".parse().unwrap();
        let trusted = ["10.0.0.0/8".parse::<IpNet>().unwrap()];

        for headers in [
            HeaderMap::new(),
            forwarded_headers([""].as_slice()),
            forwarded_headers(["198.51.100.4, invalid"].as_slice()),
            forwarded_headers(["198.51.100.4:443"].as_slice()),
            forwarded_headers(["198.51.100.4", "192.0.2.1"].as_slice()),
            forwarded_headers(["10.0.0.4, 10.0.0.5"].as_slice()),
        ] {
            let identities = RateLimitIdentity::for_validated_session(
                Uuid::nil(),
                &headers,
                peer,
                true,
                &trusted,
                false,
            );
            assert_eq!(identities[1], RateLimitIdentity::Ip("10.0.0.3".to_owned()));
        }
    }

    #[test]
    fn rate_limit_identity_check_is_atomic_when_global_rejects() {
        let limiter = RateLimiter::new(
            RateLimitPolicies::default()
                .with_family_limit(
                    RateLimitFamily::ChatMessages,
                    RateLimitPolicy::per_minute(1),
                )
                .with_chat_global_limit(RateLimitPolicy::per_minute(1)),
        );
        let first_session = RateLimitIdentity::Session(Uuid::new_v4());
        let second_session = RateLimitIdentity::Session(Uuid::new_v4());

        limiter
            .check_many(
                RateLimitFamily::ChatMessages,
                [first_session, RateLimitIdentity::Global],
            )
            .expect("first request should pass");
        assert!(matches!(
            limiter.check_many(
                RateLimitFamily::ChatMessages,
                [second_session.clone(), RateLimitIdentity::Global],
            ),
            Err(AppError::RateLimited)
        ));
        limiter
            .check(RateLimitFamily::ChatMessages, second_session)
            .expect("rejected multi-identity request must not consume session bucket");
    }

    #[test]
    fn generation_limiter_enforces_global_and_per_session_limits() {
        let limiter = GenerationLimiter::new(2, 1);
        let first_session = Uuid::new_v4();
        let second_session = Uuid::new_v4();
        let first = limiter.try_acquire(first_session, Uuid::new_v4()).unwrap();

        let session_error = match limiter.try_acquire(first_session, Uuid::new_v4()) {
            Ok(_) => panic!("second session generation should reject"),
            Err(error) => error,
        };
        assert_eq!(
            session_error.reason(),
            Some(ErrorReason::GenerationSessionCapacity)
        );
        let second = limiter.try_acquire(second_session, Uuid::new_v4()).unwrap();
        let process_error = match limiter.try_acquire(Uuid::new_v4(), Uuid::new_v4()) {
            Ok(_) => panic!("generation above process capacity should reject"),
            Err(error) => error,
        };
        assert_eq!(
            process_error.reason(),
            Some(ErrorReason::GenerationProcessCapacity)
        );

        drop((first, second));
    }

    #[test]
    fn generation_limiter_rejects_duplicate_chat_and_releases_on_drop() {
        let limiter = GenerationLimiter::new(2, 2);
        let session_id = Uuid::new_v4();
        let chat_id = Uuid::new_v4();
        let permit = limiter
            .try_acquire(session_id, chat_id)
            .expect("first generation should acquire");
        let duplicate_error = match limiter.try_acquire(session_id, chat_id) {
            Ok(_) => panic!("duplicate chat generation should reject"),
            Err(error) => error,
        };
        assert_eq!(
            duplicate_error.reason(),
            Some(ErrorReason::ChatGenerationActive)
        );
        drop(permit);
        assert!(limiter.try_acquire(session_id, chat_id).is_ok());
    }

    #[test]
    fn clear_uses_the_same_exclusive_chat_permit_without_consuming_generation_capacity() {
        let limiter = GenerationLimiter::new(1, 1);
        let chat_id = Uuid::new_v4();
        let generation = limiter
            .try_acquire(Uuid::new_v4(), chat_id)
            .expect("generation should acquire");

        let error = match limiter.try_acquire_clear(chat_id) {
            Ok(_) => panic!("clear should reject while generation owns the chat"),
            Err(error) => error,
        };
        assert_eq!(error.to_string(), "conflict: chat generation in progress");

        drop(generation);
        let clear = limiter
            .try_acquire_clear(chat_id)
            .expect("clear should acquire after generation finishes");
        let other_generation = limiter
            .try_acquire(Uuid::new_v4(), Uuid::new_v4())
            .expect("clear should not consume the global generation permit");
        drop((clear, other_generation));
    }

    fn forwarded_headers(values: &[&str]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for value in values {
            headers.append("x-forwarded-for", value.parse::<HeaderValue>().unwrap());
        }
        headers
    }
}
