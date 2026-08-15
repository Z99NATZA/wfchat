use super::*;

pub(super) async fn upload_chat_attachment(
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> AppResult<Json<ChatAttachmentResponse>> {
    if !state.config.security.chat.image_upload_enabled {
        return Err(AppError::NotFound);
    }
    let session =
        require_attachment_session(&state, &headers, AuthorizationAction::UploadAttachment).await?;
    if let Err(error) = enforce_sensitive_rate_limit(
        &state,
        &headers,
        peer_addr,
        session.id,
        RateLimitFamily::ImageUpload,
    ) {
        log_attachment_upload_rejection(&error);
        return Err(error);
    }
    let owner = OwnerScope::from_session(&session);
    let mut file_bytes = None;

    loop {
        let field = match multipart.next_field().await {
            Ok(field) => field,
            Err(error) => {
                let error = attachment_multipart_error(error);
                log_attachment_upload_rejection(&error);
                return Err(error);
            }
        };
        let Some(field) = field else {
            break;
        };
        let Some(name) = field.name().map(str::to_owned) else {
            continue;
        };

        if name != "file" {
            continue;
        }

        if file_bytes.is_some() {
            let error = AppError::BadRequest(
                "only one image attachment can be uploaded per request".to_owned(),
            );
            log_attachment_upload_rejection(&error);
            return Err(error);
        }

        let bytes = match field.bytes().await {
            Ok(bytes) => bytes,
            Err(error) => {
                let error = attachment_multipart_error(error);
                log_attachment_upload_rejection(&error);
                return Err(error);
            }
        };
        file_bytes = Some(bytes.to_vec());
    }

    let Some(file_bytes) = file_bytes else {
        let error = AppError::BadRequest("image attachment upload requires a file".to_owned());
        log_attachment_upload_rejection(&error);
        return Err(error);
    };
    let (validated, file_bytes) =
        match validate_image_attachment(&state.config, &state.image_decode_limiter, file_bytes)
            .await
        {
            Ok(validated) => validated,
            Err(error) => {
                log_attachment_upload_rejection(&error);
                return Err(error);
            }
        };
    let attachment_id = Uuid::new_v4();
    let storage_key = image_storage_key(attachment_id, validated.extension);

    let attachment = create_chat_attachment_metadata_then_file(
        &state.store,
        &state.config.chat_attachment_upload_dir,
        state.config.chat_attachment_max_storage_bytes_per_owner,
        owner,
        NewChatAttachmentRecord {
            id: attachment_id,
            kind: CHAT_ATTACHMENT_KIND_IMAGE.to_owned(),
            mime_type: validated.mime_type.to_owned(),
            byte_size: validated.byte_size as i64,
            width: Some(validated.width as i32),
            height: Some(validated.height as i32),
            sha256: validated.sha256,
            storage_key,
        },
        &file_bytes,
    )
    .await?;

    Ok(Json(chat_attachment_response(attachment)))
}

async fn create_chat_attachment_metadata_then_file(
    store: &ChatStore,
    upload_dir: &str,
    max_storage_bytes_per_owner: usize,
    owner: OwnerScope,
    attachment: NewChatAttachmentRecord,
    file_bytes: &[u8],
) -> AppResult<ChatAttachmentRecord> {
    let attachment_id = attachment.id;
    let storage_key = attachment.storage_key.clone();
    let outcome = store
        .create_chat_attachment_with_storage_quota(
            owner,
            attachment,
            i64::try_from(max_storage_bytes_per_owner)
                .expect("validated attachment storage quota should fit in i64"),
        )
        .await
        .map_err(|error| AppError::database("save chat attachment metadata", error))?;
    let attachment = match outcome {
        CreateChatAttachmentOutcome::Created(attachment) => *attachment,
        CreateChatAttachmentOutcome::StorageQuotaExceeded => {
            authorization_log::attachment_upload_rejected(
                axum::http::StatusCode::CONFLICT,
                AttachmentUploadRejectionReason::ImageStorageLimit,
            );
            return Err(AppError::reasoned(
                axum::http::StatusCode::CONFLICT,
                "conflict: image attachment storage quota exceeded",
                ErrorReason::ImageStorageLimit,
                None,
            ));
        }
    };

    if let Err(write_error) = write_attachment_bytes(upload_dir, &storage_key, file_bytes).await {
        let deleted = store
            .delete_pending_chat_attachment(owner, attachment_id)
            .await
            .map_err(|error| AppError::database("delete failed chat attachment metadata", error))?;
        if !deleted {
            tracing::error!(
                %attachment_id,
                %storage_key,
                "failed attachment write left pending metadata unexpectedly unavailable for deletion"
            );
            return Err(AppError::Database);
        }
        return Err(write_error);
    }

    Ok(attachment)
}

async fn require_attachment_session(
    state: &AppState,
    headers: &HeaderMap,
    action: AuthorizationAction,
) -> AppResult<SessionRecord> {
    let Some(session_id) = session_id_from_headers(&state.config, headers) else {
        authorization_log::rejected(
            AuthorizationResource::Attachment,
            action,
            axum::http::StatusCode::FORBIDDEN,
            AuthorizationRejectionReason::MissingSession,
        );
        return Err(AppError::Forbidden);
    };
    let Some(session) = state.store.get_session(session_id).await? else {
        authorization_log::rejected(
            AuthorizationResource::Attachment,
            action,
            axum::http::StatusCode::FORBIDDEN,
            AuthorizationRejectionReason::InvalidSession,
        );
        return Err(AppError::Forbidden);
    };
    Ok(session)
}

fn unavailable_attachment(action: AuthorizationAction) -> AppError {
    authorization_log::rejected(
        AuthorizationResource::Attachment,
        action,
        axum::http::StatusCode::NOT_FOUND,
        AuthorizationRejectionReason::ResourceUnavailable,
    );
    AppError::NotFound
}

fn log_attachment_upload_rejection(error: &AppError) {
    let (status, reason) = match error {
        AppError::BadRequest(_) => (
            axum::http::StatusCode::BAD_REQUEST,
            AttachmentUploadRejectionReason::InvalidRequest,
        ),
        AppError::Reasoned { status, reason, .. } => {
            let reason = match reason {
                ErrorReason::ImageSizeLimit => AttachmentUploadRejectionReason::ImageSizeLimit,
                ErrorReason::ImageUploadRate => AttachmentUploadRejectionReason::ImageUploadRate,
                ErrorReason::ImageProcessingCapacity => {
                    AttachmentUploadRejectionReason::ImageProcessingCapacity
                }
                ErrorReason::ImageStorageLimit => {
                    AttachmentUploadRejectionReason::ImageStorageLimit
                }
                _ => return,
            };
            (*status, reason)
        }
        _ => return,
    };
    authorization_log::attachment_upload_rejected(status, reason);
}

fn attachment_multipart_error(error: axum::extract::multipart::MultipartError) -> AppError {
    if error.status() == axum::http::StatusCode::PAYLOAD_TOO_LARGE {
        AppError::reasoned(
            axum::http::StatusCode::PAYLOAD_TOO_LARGE,
            "payload too large",
            ErrorReason::ImageSizeLimit,
            None,
        )
    } else {
        AppError::BadRequest("invalid attachment upload".to_owned())
    }
}

pub(super) async fn preview_chat_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(attachment_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let session =
        require_attachment_session(&state, &headers, AuthorizationAction::PreviewAttachment)
            .await?;
    let owner = OwnerScope::from_session(&session);
    let attachment = state
        .store
        .get_chat_attachment(owner, attachment_id)
        .await?
        .ok_or_else(|| unavailable_attachment(AuthorizationAction::PreviewAttachment))?;
    let bytes = read_attachment_bytes(
        &state.config.chat_attachment_upload_dir,
        &attachment.storage_key,
    )
    .await?;
    let content_type = HeaderValue::from_str(&attachment.mime_type)
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"));

    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        Body::from(bytes),
    ))
}

pub(super) async fn delete_chat_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(attachment_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let session =
        require_attachment_session(&state, &headers, AuthorizationAction::DeleteAttachment).await?;
    let owner = OwnerScope::from_session(&session);
    let attachment = state
        .store
        .get_chat_attachment(owner, attachment_id)
        .await?
        .ok_or_else(|| unavailable_attachment(AuthorizationAction::DeleteAttachment))?;

    if attachment.message_id.is_some() {
        return Err(AppError::BadRequest(
            "sent attachments cannot be deleted from this endpoint".to_owned(),
        ));
    }

    let deleted = state
        .store
        .delete_pending_chat_attachment(owner, attachment_id)
        .await?;
    if !deleted {
        return Err(unavailable_attachment(
            AuthorizationAction::DeleteAttachment,
        ));
    }

    Ok(Json(json!({ "ok": true })))
}
