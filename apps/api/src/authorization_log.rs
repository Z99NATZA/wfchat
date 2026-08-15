use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};

use crate::access_log::RequestId;

#[derive(Clone)]
struct AuthorizationRequestContext {
    request_id: Option<RequestId>,
    emitted: Arc<AtomicBool>,
}

tokio::task_local! {
    static AUTHORIZATION_REQUEST_CONTEXT: AuthorizationRequestContext;
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthorizationResource {
    Admin,
    Chat,
    Attachment,
    Cafe,
    Voice,
    Memory,
    Sync,
}

impl AuthorizationResource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Chat => "chat",
            Self::Attachment => "attachment",
            Self::Cafe => "cafe",
            Self::Voice => "voice",
            Self::Memory => "memory",
            Self::Sync => "sync",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthorizationAction {
    ReadAiProfiles,
    ReadProviderStatus,
    ListChats,
    CreateChat,
    ReadChat,
    DeleteChat,
    ClearChatMessages,
    SendChatMessage,
    StreamChatMessage,
    UploadAttachment,
    PreviewAttachment,
    DeleteAttachment,
    ListCafeRooms,
    CreateCafeRoom,
    QuickJoinCafeRoom,
    JoinCafeRoom,
    ReadCafeProgress,
    EquipCafeCosmetic,
    ConnectCafeSocket,
    SynthesizeMessageSpeech,
    TranscribeUserSpeech,
    ClaimMemoryFollowUp,
    ResetLearnedContext,
    ReadSyncChanges,
    PreviewSyncChanges,
    CommitSyncChanges,
}

impl AuthorizationAction {
    fn as_str(self) -> &'static str {
        match self {
            Self::ReadAiProfiles => "read_ai_profiles",
            Self::ReadProviderStatus => "read_provider_status",
            Self::ListChats => "list_chats",
            Self::CreateChat => "create_chat",
            Self::ReadChat => "read_chat",
            Self::DeleteChat => "delete_chat",
            Self::ClearChatMessages => "clear_chat_messages",
            Self::SendChatMessage => "send_chat_message",
            Self::StreamChatMessage => "stream_chat_message",
            Self::UploadAttachment => "upload_attachment",
            Self::PreviewAttachment => "preview_attachment",
            Self::DeleteAttachment => "delete_attachment",
            Self::ListCafeRooms => "list_cafe_rooms",
            Self::CreateCafeRoom => "create_cafe_room",
            Self::QuickJoinCafeRoom => "quick_join_cafe_room",
            Self::JoinCafeRoom => "join_cafe_room",
            Self::ReadCafeProgress => "read_cafe_progress",
            Self::EquipCafeCosmetic => "equip_cafe_cosmetic",
            Self::ConnectCafeSocket => "connect_cafe_socket",
            Self::SynthesizeMessageSpeech => "synthesize_message_speech",
            Self::TranscribeUserSpeech => "transcribe_user_speech",
            Self::ClaimMemoryFollowUp => "claim_memory_follow_up",
            Self::ResetLearnedContext => "reset_learned_context",
            Self::ReadSyncChanges => "read_sync_changes",
            Self::PreviewSyncChanges => "preview_sync_changes",
            Self::CommitSyncChanges => "commit_sync_changes",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AttachmentUploadRejectionReason {
    InvalidRequest,
    ImageSizeLimit,
    ImageUploadRate,
    ImageProcessingCapacity,
    ImageStorageLimit,
}

impl AttachmentUploadRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::ImageSizeLimit => "image_size_limit",
            Self::ImageUploadRate => "image_upload_rate",
            Self::ImageProcessingCapacity => "image_processing_capacity",
            Self::ImageStorageLimit => "image_storage_limit",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthorizationRejectionReason {
    MissingSession,
    InvalidSession,
    InsufficientRole,
    ResourceUnavailable,
    InsufficientEntitlement,
}

impl AuthorizationRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::MissingSession => "missing_session",
            Self::InvalidSession => "invalid_session",
            Self::InsufficientRole => "insufficient_role",
            Self::ResourceUnavailable => "resource_unavailable",
            Self::InsufficientEntitlement => "insufficient_entitlement",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum CafeSecurityRejectionReason {
    OriginRejected,
    SocketCapacity,
    RoomCreationRate,
}

impl CafeSecurityRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::OriginRejected => "origin_rejected",
            Self::SocketCapacity => "socket_capacity",
            Self::RoomCreationRate => "room_creation_rate",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum VoiceSecurityRejectionReason {
    SpeechRate,
    TranscriptionRate,
    InvalidAudioRequest,
    AudioSizeLimit,
}

impl VoiceSecurityRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::SpeechRate => "speech_rate",
            Self::TranscriptionRate => "transcription_rate",
            Self::InvalidAudioRequest => "invalid_audio_request",
            Self::AudioSizeLimit => "audio_size_limit",
        }
    }
}

pub(crate) async fn request_context(request: Request, next: Next) -> Response {
    let context = AuthorizationRequestContext {
        request_id: request.extensions().get::<RequestId>().copied(),
        emitted: Arc::new(AtomicBool::new(false)),
    };
    AUTHORIZATION_REQUEST_CONTEXT
        .scope(context, next.run(request))
        .await
}

pub(crate) fn rejected(
    resource: AuthorizationResource,
    action: AuthorizationAction,
    status: StatusCode,
    reason: AuthorizationRejectionReason,
) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::authorization_security",
            event = "authorization_rejected",
            request_id = %request_id.value(),
            resource = resource.as_str(),
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "authorization rejected"
        ),
        None => tracing::warn!(
            target: "wfchat::authorization_security",
            event = "authorization_rejected",
            resource = resource.as_str(),
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "authorization rejected"
        ),
    }
}

pub(crate) fn attachment_upload_rejected(
    status: StatusCode,
    reason: AttachmentUploadRejectionReason,
) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::attachment_security",
            event = "attachment_upload_rejected",
            request_id = %request_id.value(),
            resource = "attachment",
            action = "upload_attachment",
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "attachment upload rejected"
        ),
        None => tracing::warn!(
            target: "wfchat::attachment_security",
            event = "attachment_upload_rejected",
            resource = "attachment",
            action = "upload_attachment",
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "attachment upload rejected"
        ),
    }
}

pub(crate) fn cafe_request_rejected(
    action: AuthorizationAction,
    status: StatusCode,
    reason: CafeSecurityRejectionReason,
) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::cafe_security",
            event = "cafe_request_rejected",
            request_id = %request_id.value(),
            resource = "cafe",
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "Cafe request rejected"
        ),
        None => tracing::warn!(
            target: "wfchat::cafe_security",
            event = "cafe_request_rejected",
            resource = "cafe",
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "Cafe request rejected"
        ),
    }
}

pub(crate) fn voice_request_rejected(
    action: AuthorizationAction,
    status: StatusCode,
    reason: VoiceSecurityRejectionReason,
) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::voice_security",
            event = "voice_request_rejected",
            request_id = %request_id.value(),
            resource = "voice",
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "voice request rejected"
        ),
        None => tracing::warn!(
            target: "wfchat::voice_security",
            event = "voice_request_rejected",
            resource = "voice",
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "voice request rejected"
        ),
    }
}

pub(crate) fn memory_reset_succeeded() {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::info!(
            target: "wfchat::memory_security",
            event = "memory_reset_succeeded",
            request_id = %request_id.value(),
            resource = "memory",
            action = "reset_learned_context",
            outcome = "success",
            status = StatusCode::NO_CONTENT.as_u16(),
            "automatic learned context reset succeeded"
        ),
        None => tracing::info!(
            target: "wfchat::memory_security",
            event = "memory_reset_succeeded",
            resource = "memory",
            action = "reset_learned_context",
            outcome = "success",
            status = StatusCode::NO_CONTENT.as_u16(),
            "automatic learned context reset succeeded"
        ),
    }
}

pub(crate) fn sync_commit_succeeded() {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::info!(
            target: "wfchat::sync_security",
            event = "sync_commit_succeeded",
            request_id = %request_id.value(),
            resource = "sync",
            action = "commit_sync_changes",
            outcome = "success",
            status = StatusCode::OK.as_u16(),
            "sync commit succeeded"
        ),
        None => tracing::info!(
            target: "wfchat::sync_security",
            event = "sync_commit_succeeded",
            resource = "sync",
            action = "commit_sync_changes",
            outcome = "success",
            status = StatusCode::OK.as_u16(),
            "sync commit succeeded"
        ),
    }
}

pub(crate) async fn attachment_body_limit_rejection(request: Request, next: Next) -> Response {
    let response = next.run(request).await;
    if response.status() == StatusCode::PAYLOAD_TOO_LARGE {
        attachment_upload_rejected(
            StatusCode::PAYLOAD_TOO_LARGE,
            AttachmentUploadRejectionReason::ImageSizeLimit,
        );
    }
    response
}

pub(crate) async fn transcription_body_limit_rejection(request: Request, next: Next) -> Response {
    let response = next.run(request).await;
    if response.status() == StatusCode::PAYLOAD_TOO_LARGE {
        voice_request_rejected(
            AuthorizationAction::TranscribeUserSpeech,
            StatusCode::PAYLOAD_TOO_LARGE,
            VoiceSecurityRejectionReason::AudioSizeLimit,
        );
    }
    response
}

fn current_context() -> AuthorizationRequestContext {
    AUTHORIZATION_REQUEST_CONTEXT
        .try_with(Clone::clone)
        .unwrap_or_else(|_| AuthorizationRequestContext {
            request_id: None,
            emitted: Arc::new(AtomicBool::new(false)),
        })
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use axum::{
        body::Body, extract::Path, http::Request as HttpRequest, middleware, routing::get, Router,
    };
    use serde_json::Value;
    use tower::ServiceExt;
    use tracing_subscriber::fmt::MakeWriter;
    use uuid::Uuid;

    use super::*;

    #[derive(Clone, Default)]
    struct CapturedWriter(Arc<Mutex<Vec<u8>>>);

    impl Write for CapturedWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().expect("captured log lock").extend(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'writer> MakeWriter<'writer> for CapturedWriter {
        type Writer = CapturedWriter;

        fn make_writer(&'writer self) -> Self::Writer {
            self.clone()
        }
    }

    impl CapturedWriter {
        fn events(&self) -> Vec<Value> {
            let output = self.0.lock().expect("captured log lock").clone();
            String::from_utf8(output)
                .expect("captured logs should be UTF-8")
                .lines()
                .map(|line| serde_json::from_str(line).expect("captured log should be JSON"))
                .filter(|event: &Value| {
                    matches!(
                        event["target"].as_str(),
                        Some(
                            "wfchat::authorization_security"
                                | "wfchat::attachment_security"
                                | "wfchat::cafe_security"
                                | "wfchat::voice_security"
                                | "wfchat::memory_security"
                                | "wfchat::sync_security"
                        )
                    )
                })
                .collect()
        }
    }

    fn test_app() -> Router {
        Router::new()
            .route(
                "/reject/{case}",
                get(|Path(case): Path<String>| async move {
                    let (resource, action, status, reason) = rejection_case(&case);
                    rejected(resource, action, status, reason);
                    rejected(resource, action, status, reason);
                    status
                }),
            )
            .route(
                "/upload/{case}",
                get(|Path(case): Path<String>| async move {
                    let (status, reason) = upload_rejection_case(&case);
                    attachment_upload_rejected(status, reason);
                    attachment_upload_rejected(status, reason);
                    status
                }),
            )
            .route(
                "/cafe/{case}",
                get(|Path(case): Path<String>| async move {
                    let (action, status, reason) = cafe_rejection_case(&case);
                    cafe_request_rejected(action, status, reason);
                    cafe_request_rejected(action, status, reason);
                    status
                }),
            )
            .route(
                "/voice/{case}",
                get(|Path(case): Path<String>| async move {
                    let (action, status, reason) = voice_rejection_case(&case);
                    voice_request_rejected(action, status, reason);
                    voice_request_rejected(action, status, reason);
                    status
                }),
            )
            .route(
                "/memory-reset",
                get(|| async {
                    memory_reset_succeeded();
                    memory_reset_succeeded();
                    StatusCode::NO_CONTENT
                }),
            )
            .route(
                "/sync-commit",
                get(|| async {
                    sync_commit_succeeded();
                    sync_commit_succeeded();
                    StatusCode::OK
                }),
            )
            .route(
                "/body-limit",
                get(|| async { StatusCode::PAYLOAD_TOO_LARGE })
                    .layer(middleware::from_fn(attachment_body_limit_rejection)),
            )
            .route(
                "/transcription-body-limit",
                get(|| async { StatusCode::PAYLOAD_TOO_LARGE })
                    .layer(middleware::from_fn(transcription_body_limit_rejection)),
            )
            .route("/ok", get(|| async { StatusCode::OK }))
            .route("/business-error", get(|| async { StatusCode::BAD_REQUEST }))
            .layer(middleware::from_fn(request_context))
    }

    fn rejection_case(
        case: &str,
    ) -> (
        AuthorizationResource,
        AuthorizationAction,
        StatusCode,
        AuthorizationRejectionReason,
    ) {
        match case {
            "admin_profiles" => (
                AuthorizationResource::Admin,
                AuthorizationAction::ReadAiProfiles,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            "admin_provider" => (
                AuthorizationResource::Admin,
                AuthorizationAction::ReadProviderStatus,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::InvalidSession,
            ),
            "admin_role" => (
                AuthorizationResource::Admin,
                AuthorizationAction::ReadAiProfiles,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::InsufficientRole,
            ),
            "list" => chat_case(AuthorizationAction::ListChats, StatusCode::FORBIDDEN),
            "list_missing" => (
                AuthorizationResource::Chat,
                AuthorizationAction::ListChats,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            "create" => chat_case(AuthorizationAction::CreateChat, StatusCode::FORBIDDEN),
            "read" => chat_case(AuthorizationAction::ReadChat, StatusCode::NOT_FOUND),
            "delete" => chat_case(AuthorizationAction::DeleteChat, StatusCode::NOT_FOUND),
            "clear" => chat_case(
                AuthorizationAction::ClearChatMessages,
                StatusCode::NOT_FOUND,
            ),
            "send" => chat_case(AuthorizationAction::SendChatMessage, StatusCode::NOT_FOUND),
            "stream" => chat_case(
                AuthorizationAction::StreamChatMessage,
                StatusCode::NOT_FOUND,
            ),
            "attachment_upload" => {
                attachment_case(AuthorizationAction::UploadAttachment, StatusCode::FORBIDDEN)
            }
            "attachment_preview" => attachment_case(
                AuthorizationAction::PreviewAttachment,
                StatusCode::NOT_FOUND,
            ),
            "attachment_delete" => {
                attachment_case(AuthorizationAction::DeleteAttachment, StatusCode::NOT_FOUND)
            }
            "cafe_list" => cafe_authorization_case(AuthorizationAction::ListCafeRooms),
            "cafe_create" => cafe_authorization_case(AuthorizationAction::CreateCafeRoom),
            "cafe_quick_join" => cafe_authorization_case(AuthorizationAction::QuickJoinCafeRoom),
            "cafe_join" => (
                AuthorizationResource::Cafe,
                AuthorizationAction::JoinCafeRoom,
                StatusCode::NOT_FOUND,
                AuthorizationRejectionReason::ResourceUnavailable,
            ),
            "cafe_progress" => cafe_authorization_case(AuthorizationAction::ReadCafeProgress),
            "cafe_equip" => (
                AuthorizationResource::Cafe,
                AuthorizationAction::EquipCafeCosmetic,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::InsufficientEntitlement,
            ),
            "cafe_socket" => cafe_authorization_case(AuthorizationAction::ConnectCafeSocket),
            "voice_speech" => (
                AuthorizationResource::Voice,
                AuthorizationAction::SynthesizeMessageSpeech,
                StatusCode::NOT_FOUND,
                AuthorizationRejectionReason::ResourceUnavailable,
            ),
            "voice_transcription" => (
                AuthorizationResource::Voice,
                AuthorizationAction::TranscribeUserSpeech,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            "memory_follow_up" => (
                AuthorizationResource::Memory,
                AuthorizationAction::ClaimMemoryFollowUp,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            "memory_reset" => (
                AuthorizationResource::Memory,
                AuthorizationAction::ResetLearnedContext,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::InvalidSession,
            ),
            "sync_read" => (
                AuthorizationResource::Sync,
                AuthorizationAction::ReadSyncChanges,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            "sync_preview" => (
                AuthorizationResource::Sync,
                AuthorizationAction::PreviewSyncChanges,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::InvalidSession,
            ),
            "sync_commit" => (
                AuthorizationResource::Sync,
                AuthorizationAction::CommitSyncChanges,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            _ => panic!("unknown rejection case"),
        }
    }

    fn cafe_authorization_case(
        action: AuthorizationAction,
    ) -> (
        AuthorizationResource,
        AuthorizationAction,
        StatusCode,
        AuthorizationRejectionReason,
    ) {
        (
            AuthorizationResource::Cafe,
            action,
            StatusCode::FORBIDDEN,
            AuthorizationRejectionReason::MissingSession,
        )
    }

    fn attachment_case(
        action: AuthorizationAction,
        status: StatusCode,
    ) -> (
        AuthorizationResource,
        AuthorizationAction,
        StatusCode,
        AuthorizationRejectionReason,
    ) {
        let reason = if status == StatusCode::NOT_FOUND {
            AuthorizationRejectionReason::ResourceUnavailable
        } else {
            AuthorizationRejectionReason::MissingSession
        };
        (AuthorizationResource::Attachment, action, status, reason)
    }

    fn upload_rejection_case(case: &str) -> (StatusCode, AttachmentUploadRejectionReason) {
        match case {
            "invalid" => (
                StatusCode::BAD_REQUEST,
                AttachmentUploadRejectionReason::InvalidRequest,
            ),
            "size" => (
                StatusCode::PAYLOAD_TOO_LARGE,
                AttachmentUploadRejectionReason::ImageSizeLimit,
            ),
            "rate" => (
                StatusCode::TOO_MANY_REQUESTS,
                AttachmentUploadRejectionReason::ImageUploadRate,
            ),
            "capacity" => (
                StatusCode::TOO_MANY_REQUESTS,
                AttachmentUploadRejectionReason::ImageProcessingCapacity,
            ),
            "storage" => (
                StatusCode::CONFLICT,
                AttachmentUploadRejectionReason::ImageStorageLimit,
            ),
            _ => panic!("unknown upload rejection case"),
        }
    }

    fn cafe_rejection_case(
        case: &str,
    ) -> (AuthorizationAction, StatusCode, CafeSecurityRejectionReason) {
        match case {
            "origin" => (
                AuthorizationAction::ConnectCafeSocket,
                StatusCode::FORBIDDEN,
                CafeSecurityRejectionReason::OriginRejected,
            ),
            "socket" => (
                AuthorizationAction::ConnectCafeSocket,
                StatusCode::TOO_MANY_REQUESTS,
                CafeSecurityRejectionReason::SocketCapacity,
            ),
            "create" => (
                AuthorizationAction::CreateCafeRoom,
                StatusCode::TOO_MANY_REQUESTS,
                CafeSecurityRejectionReason::RoomCreationRate,
            ),
            "quick" => (
                AuthorizationAction::QuickJoinCafeRoom,
                StatusCode::TOO_MANY_REQUESTS,
                CafeSecurityRejectionReason::RoomCreationRate,
            ),
            _ => panic!("unknown Cafe rejection case"),
        }
    }

    fn voice_rejection_case(
        case: &str,
    ) -> (
        AuthorizationAction,
        StatusCode,
        VoiceSecurityRejectionReason,
    ) {
        match case {
            "speech_rate" => (
                AuthorizationAction::SynthesizeMessageSpeech,
                StatusCode::TOO_MANY_REQUESTS,
                VoiceSecurityRejectionReason::SpeechRate,
            ),
            "transcription_rate" => (
                AuthorizationAction::TranscribeUserSpeech,
                StatusCode::TOO_MANY_REQUESTS,
                VoiceSecurityRejectionReason::TranscriptionRate,
            ),
            "invalid_audio" => (
                AuthorizationAction::TranscribeUserSpeech,
                StatusCode::BAD_REQUEST,
                VoiceSecurityRejectionReason::InvalidAudioRequest,
            ),
            "audio_size" => (
                AuthorizationAction::TranscribeUserSpeech,
                StatusCode::BAD_REQUEST,
                VoiceSecurityRejectionReason::AudioSizeLimit,
            ),
            _ => panic!("unknown Voice rejection case"),
        }
    }

    fn chat_case(
        action: AuthorizationAction,
        status: StatusCode,
    ) -> (
        AuthorizationResource,
        AuthorizationAction,
        StatusCode,
        AuthorizationRejectionReason,
    ) {
        let reason = if status == StatusCode::NOT_FOUND {
            AuthorizationRejectionReason::ResourceUnavailable
        } else {
            AuthorizationRejectionReason::InvalidSession
        };
        (AuthorizationResource::Chat, action, status, reason)
    }

    async fn capture(path: &str, request_id: Option<Uuid>) -> (StatusCode, Vec<Value>) {
        let writer = CapturedWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .flatten_event(true)
            .with_current_span(false)
            .with_span_list(false)
            .with_writer(writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);

        let mut request = HttpRequest::get(path)
            .header("authorization", "Bearer secret-authorization-value")
            .header("cookie", "wfchat_session=secret-session-value")
            .body(Body::empty())
            .expect("request should build");
        if let Some(request_id) = request_id {
            request
                .extensions_mut()
                .insert(RequestId::from_uuid(request_id));
        }

        let response = test_app()
            .oneshot(request)
            .await
            .expect("request should run");
        (response.status(), writer.events())
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_correlated_rejections_once() {
        let cases = [
            (
                "/reject/admin_profiles",
                "admin",
                "read_ai_profiles",
                403,
                "missing_session",
            ),
            (
                "/reject/admin_provider",
                "admin",
                "read_provider_status",
                403,
                "invalid_session",
            ),
            (
                "/reject/admin_role",
                "admin",
                "read_ai_profiles",
                403,
                "insufficient_role",
            ),
            ("/reject/list", "chat", "list_chats", 403, "invalid_session"),
            (
                "/reject/list_missing",
                "chat",
                "list_chats",
                403,
                "missing_session",
            ),
            (
                "/reject/create",
                "chat",
                "create_chat",
                403,
                "invalid_session",
            ),
            (
                "/reject/read",
                "chat",
                "read_chat",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/delete",
                "chat",
                "delete_chat",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/clear",
                "chat",
                "clear_chat_messages",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/send",
                "chat",
                "send_chat_message",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/stream",
                "chat",
                "stream_chat_message",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/attachment_upload",
                "attachment",
                "upload_attachment",
                403,
                "missing_session",
            ),
            (
                "/reject/attachment_preview",
                "attachment",
                "preview_attachment",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/attachment_delete",
                "attachment",
                "delete_attachment",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/cafe_list",
                "cafe",
                "list_cafe_rooms",
                403,
                "missing_session",
            ),
            (
                "/reject/cafe_create",
                "cafe",
                "create_cafe_room",
                403,
                "missing_session",
            ),
            (
                "/reject/cafe_quick_join",
                "cafe",
                "quick_join_cafe_room",
                403,
                "missing_session",
            ),
            (
                "/reject/cafe_join",
                "cafe",
                "join_cafe_room",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/cafe_progress",
                "cafe",
                "read_cafe_progress",
                403,
                "missing_session",
            ),
            (
                "/reject/cafe_equip",
                "cafe",
                "equip_cafe_cosmetic",
                403,
                "insufficient_entitlement",
            ),
            (
                "/reject/cafe_socket",
                "cafe",
                "connect_cafe_socket",
                403,
                "missing_session",
            ),
            (
                "/reject/voice_speech",
                "voice",
                "synthesize_message_speech",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/voice_transcription",
                "voice",
                "transcribe_user_speech",
                403,
                "missing_session",
            ),
            (
                "/reject/memory_follow_up",
                "memory",
                "claim_memory_follow_up",
                403,
                "missing_session",
            ),
            (
                "/reject/memory_reset",
                "memory",
                "reset_learned_context",
                403,
                "invalid_session",
            ),
            (
                "/reject/sync_read",
                "sync",
                "read_sync_changes",
                403,
                "missing_session",
            ),
            (
                "/reject/sync_preview",
                "sync",
                "preview_sync_changes",
                403,
                "invalid_session",
            ),
            (
                "/reject/sync_commit",
                "sync",
                "commit_sync_changes",
                403,
                "missing_session",
            ),
        ];

        for (path, resource, action, expected_status, reason) in cases {
            let request_id = Uuid::new_v4();
            let (status, events) = capture(path, Some(request_id)).await;

            assert_eq!(status.as_u16(), expected_status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["event"], "authorization_rejected");
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["resource"], resource);
            assert_eq!(event["action"], action);
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], expected_status);
            assert_eq!(event["reason"], reason);

            let encoded = serde_json::to_string(event).expect("event should serialize");
            assert!(!encoded.contains("secret-authorization-value"));
            assert!(!encoded.contains("secret-session-value"));
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_attachment_upload_rejections_and_body_limit_once() {
        let cases = [
            ("invalid", 400, "invalid_request"),
            ("size", 413, "image_size_limit"),
            ("rate", 429, "image_upload_rate"),
            ("capacity", 429, "image_processing_capacity"),
            ("storage", 409, "image_storage_limit"),
        ];

        for (case, expected_status, reason) in cases {
            let request_id = Uuid::new_v4();
            let (status, events) = capture(&format!("/upload/{case}"), Some(request_id)).await;
            assert_eq!(status.as_u16(), expected_status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["target"], "wfchat::attachment_security");
            assert_eq!(event["event"], "attachment_upload_rejected");
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["resource"], "attachment");
            assert_eq!(event["action"], "upload_attachment");
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], expected_status);
            assert_eq!(event["reason"], reason);

            let encoded = serde_json::to_string(event).unwrap();
            assert!(!encoded.contains("secret-authorization-value"));
            assert!(!encoded.contains("secret-session-value"));
        }

        let (status, events) = capture("/body-limit", None).await;
        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["reason"], "image_size_limit");
        assert!(events[0].get("request_id").is_none());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_cafe_security_rejections_once() {
        let cases = [
            ("origin", "connect_cafe_socket", 403, "origin_rejected"),
            ("socket", "connect_cafe_socket", 429, "socket_capacity"),
            ("create", "create_cafe_room", 429, "room_creation_rate"),
            ("quick", "quick_join_cafe_room", 429, "room_creation_rate"),
        ];

        for (case, action, expected_status, reason) in cases {
            let request_id = Uuid::new_v4();
            let (status, events) = capture(&format!("/cafe/{case}"), Some(request_id)).await;
            assert_eq!(status.as_u16(), expected_status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["target"], "wfchat::cafe_security");
            assert_eq!(event["event"], "cafe_request_rejected");
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["resource"], "cafe");
            assert_eq!(event["action"], action);
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], expected_status);
            assert_eq!(event["reason"], reason);

            let encoded = serde_json::to_string(event).unwrap();
            assert!(!encoded.contains("secret-authorization-value"));
            assert!(!encoded.contains("secret-session-value"));
        }

        let (status, events) = capture("/cafe/origin", None).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(events[0].get("request_id").is_none());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_voice_security_rejections_once() {
        let cases = [
            (
                "speech_rate",
                "synthesize_message_speech",
                429,
                "speech_rate",
            ),
            (
                "transcription_rate",
                "transcribe_user_speech",
                429,
                "transcription_rate",
            ),
            (
                "invalid_audio",
                "transcribe_user_speech",
                400,
                "invalid_audio_request",
            ),
            (
                "audio_size",
                "transcribe_user_speech",
                400,
                "audio_size_limit",
            ),
        ];

        for (case, action, expected_status, reason) in cases {
            let request_id = Uuid::new_v4();
            let (status, events) = capture(&format!("/voice/{case}"), Some(request_id)).await;
            assert_eq!(status.as_u16(), expected_status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["target"], "wfchat::voice_security");
            assert_eq!(event["event"], "voice_request_rejected");
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["resource"], "voice");
            assert_eq!(event["action"], action);
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], expected_status);
            assert_eq!(event["reason"], reason);

            let encoded = serde_json::to_string(event).unwrap();
            assert!(!encoded.contains("secret-authorization-value"));
            assert!(!encoded.contains("secret-session-value"));
        }

        let (status, events) = capture("/transcription-body-limit", None).await;
        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["status"], 413);
        assert_eq!(events[0]["reason"], "audio_size_limit");
        assert!(events[0].get("request_id").is_none());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn omits_missing_request_id_and_does_not_log_success() {
        let (status, events) = capture("/reject/admin_profiles", None).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(events.len(), 1);
        assert!(events[0].get("request_id").is_none());

        let (status, events) = capture("/reject/memory_follow_up", None).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["resource"], "memory");
        assert!(events[0].get("request_id").is_none());

        let (status, events) = capture("/reject/sync_read", None).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["resource"], "sync");
        assert!(events[0].get("request_id").is_none());

        let (status, events) = capture("/ok", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(events.is_empty());

        let (status, events) = capture("/business-error", None).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(events.is_empty());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_memory_reset_success_once_with_optional_request_id() {
        let request_id = Uuid::new_v4();
        let (status, events) = capture("/memory-reset", Some(request_id)).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event["level"], "INFO");
        assert_eq!(event["target"], "wfchat::memory_security");
        assert_eq!(event["event"], "memory_reset_succeeded");
        assert_eq!(event["request_id"], request_id.to_string());
        assert_eq!(event["resource"], "memory");
        assert_eq!(event["action"], "reset_learned_context");
        assert_eq!(event["outcome"], "success");
        assert_eq!(event["status"], 204);
        assert!(event.get("reason").is_none());

        let encoded = serde_json::to_string(event).expect("event should serialize");
        for excluded in [
            "secret-authorization-value",
            "secret-session-value",
            "deleted_count",
            "memory_id",
            "owner_user_id",
        ] {
            assert!(!encoded.contains(excluded));
        }

        let (status, events) = capture("/memory-reset", None).await;
        assert_eq!(status, StatusCode::NO_CONTENT);
        assert_eq!(events.len(), 1);
        assert!(events[0].get("request_id").is_none());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_sync_commit_success_once_with_optional_request_id() {
        let request_id = Uuid::new_v4();
        let (status, events) = capture("/sync-commit", Some(request_id)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event["level"], "INFO");
        assert_eq!(event["target"], "wfchat::sync_security");
        assert_eq!(event["event"], "sync_commit_succeeded");
        assert_eq!(event["request_id"], request_id.to_string());
        assert_eq!(event["resource"], "sync");
        assert_eq!(event["action"], "commit_sync_changes");
        assert_eq!(event["outcome"], "success");
        assert_eq!(event["status"], 200);
        assert!(event.get("reason").is_none());

        let encoded = serde_json::to_string(event).expect("event should serialize");
        for excluded in [
            "secret-authorization-value",
            "secret-session-value",
            "operation_id",
            "item_id",
            "merged_count",
            "conflict_count",
        ] {
            assert!(!encoded.contains(excluded));
        }

        let (status, events) = capture("/sync-commit", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(events.len(), 1);
        assert!(events[0].get("request_id").is_none());
    }
}
