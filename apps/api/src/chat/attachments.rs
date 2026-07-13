use super::*;

pub(super) async fn upload_chat_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> AppResult<Json<ChatAttachmentResponse>> {
    enforce_sensitive_rate_limit(&state, &headers, RateLimitFamily::ImageUpload)?;
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let mut file_bytes = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| AppError::BadRequest("invalid attachment upload".to_owned()))?
    {
        let Some(name) = field.name().map(str::to_owned) else {
            continue;
        };

        if name != "file" {
            continue;
        }

        if file_bytes.is_some() {
            return Err(AppError::BadRequest(
                "only one image attachment can be uploaded per request".to_owned(),
            ));
        }

        let bytes = field
            .bytes()
            .await
            .map_err(|_| AppError::BadRequest("invalid attachment upload".to_owned()))?;
        file_bytes = Some(bytes.to_vec());
    }

    let file_bytes = file_bytes.ok_or_else(|| {
        AppError::BadRequest("image attachment upload requires a file".to_owned())
    })?;
    let validated = validate_image_attachment(&state.config, &file_bytes)?;
    let attachment_id = Uuid::new_v4();
    let storage_key = image_storage_key(attachment_id, validated.extension);

    write_attachment_bytes(
        &state.config.chat_attachment_upload_dir,
        &storage_key,
        &file_bytes,
    )
    .await?;

    let attachment = state
        .store
        .create_chat_attachment(
            owner,
            NewChatAttachmentRecord {
                id: attachment_id,
                kind: CHAT_ATTACHMENT_KIND_IMAGE.to_owned(),
                mime_type: validated.mime_type.to_owned(),
                byte_size: validated.byte_size as i64,
                width: Some(validated.width as i32),
                height: Some(validated.height as i32),
                sha256: validated.sha256.clone(),
                storage_key: storage_key.clone(),
            },
        )
        .await
        .map_err(|error| AppError::database("save chat attachment metadata", error));

    let attachment = match attachment {
        Ok(attachment) => attachment,
        Err(error) => {
            remove_attachment_file(&state.config.chat_attachment_upload_dir, &storage_key).await;
            return Err(error);
        }
    };

    Ok(Json(chat_attachment_response(attachment)))
}

pub(super) async fn preview_chat_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(attachment_id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let attachment = state
        .store
        .get_chat_attachment(owner, attachment_id)
        .await?
        .ok_or(AppError::NotFound)?;
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
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let attachment = state
        .store
        .get_chat_attachment(owner, attachment_id)
        .await?
        .ok_or(AppError::NotFound)?;

    if attachment.message_id.is_some() {
        return Err(AppError::BadRequest(
            "sent attachments cannot be deleted from this endpoint".to_owned(),
        ));
    }

    let deleted = state
        .store
        .mark_pending_chat_attachment_deleted(owner, attachment_id)
        .await?
        .ok_or(AppError::NotFound)?;
    remove_attachment_file(
        &state.config.chat_attachment_upload_dir,
        &deleted.storage_key,
    )
    .await;

    Ok(Json(json!({ "ok": true })))
}
