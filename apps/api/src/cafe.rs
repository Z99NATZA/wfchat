use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    pin::Pin,
    sync::Arc,
    time::{Duration, Instant},
};

#[cfg(test)]
use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::{
        header::{ORIGIN, SET_COOKIE},
        HeaderMap, HeaderValue,
    },
    response::Response,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

use crate::{
    cafe_cosmetics::{cafe_cosmetic, CafeCosmeticDefinition, CAFE_COSMETICS},
    error::{AppError, AppResult},
    session::{require_session, session_cookie},
    state::AppState,
    store::{OwnerScope, SessionRecord, UserKind},
};

const ROOM_CAPACITY: usize = 8;
const MOVE_SPEED: f32 = 210.0;
const MAX_MESSAGES_PER_WINDOW: usize = 45;
const MESSAGE_WINDOW: Duration = Duration::from_secs(2);
const MAX_CHAT_MESSAGES_PER_WINDOW: usize = 5;
const CHAT_MESSAGE_WINDOW: Duration = Duration::from_secs(10);
const CHAT_HISTORY_LIMIT: usize = 30;
const MAX_CHAT_MESSAGE_CHARS: usize = 200;
const ROUND_INTERMISSION: Duration = Duration::from_secs(8);
const CAFE_RUSH_DURATION: Duration = Duration::from_secs(90);
const CAFE_RUSH_COMBO_WINDOW: Duration = Duration::from_secs(15);
const MAX_CAFE_PLAYER_NAME_CHARS: usize = 24;
const SERVICE_COUNTER_TARGET_ID: &str = "service-counter";
const CAFE_MAP_LAYOUT: CafeMapLayout = CafeMapLayout {
    version: "cafe-room-v1",
    width: 1280.0,
    height: 800.0,
    player_collision_radius: 10.0,
    interaction_radius: 92.0,
    host_interaction_radius: 132.0,
    player_spawn: CafeMapPoint { x: 640.0, y: 704.0 },
    colliders: &CAFE_MAP_COLLIDERS,
    interaction_targets: &CAFE_MAP_INTERACTION_TARGETS,
};
const CAFE_MAP_COLLIDERS: [CafeMapCollider; 6] = [
    CafeMapCollider::new("service-counter", 366.0, 182.0, 488.0, 120.0),
    CafeMapCollider::new("table-window", 190.0, 322.0, 120.0, 122.0),
    CafeMapCollider::new("table-window-lower", 188.0, 540.0, 108.0, 100.0),
    CafeMapCollider::new("table-garden", 990.0, 338.0, 114.0, 106.0),
    CafeMapCollider::new("table-garden-lower", 990.0, 544.0, 112.0, 104.0),
    CafeMapCollider::new("table-long", 460.0, 523.0, 352.0, 98.0),
];
const CAFE_MAP_INTERACTION_TARGETS: [CafeMapInteractionTarget; 5] = [
    CafeMapInteractionTarget::new("aiko", 640.0, 272.0),
    CafeMapInteractionTarget::new(SERVICE_COUNTER_TARGET_ID, 640.0, 272.0),
    CafeMapInteractionTarget::new("table-window", 250.0, 383.0),
    CafeMapInteractionTarget::new("table-garden", 1047.0, 391.0),
    CafeMapInteractionTarget::new("table-long", 636.0, 573.0),
];

const TEA_LAYOUTS: [[(f32, f32); 3]; 3] = [
    [(142.0, 224.0), (1138.0, 248.0), (1064.0, 682.0)],
    [(186.0, 666.0), (1094.0, 570.0), (832.0, 300.0)],
    [(322.0, 278.0), (950.0, 248.0), (912.0, 688.0)],
];

const TABLE_SERVICE_ORDERS: [(&str, &str, &str); 3] = [
    ("window", "sakura", "table-window"),
    ("garden", "mint", "table-garden"),
    ("long", "classic", "table-long"),
];

const CAFE_RUSH_ORDERS: [(&str, &str, &str); 6] = [
    ("window", "sakura", "table-window"),
    ("garden", "mint", "table-garden"),
    ("long", "classic", "table-long"),
    ("garden", "sakura", "table-garden"),
    ("window", "classic", "table-window"),
    ("long", "mint", "table-long"),
];

const CAFE_RUSH_INGREDIENTS: [(f32, f32); 6] = [
    (142.0, 224.0),
    (1138.0, 248.0),
    (1064.0, 682.0),
    (186.0, 666.0),
    (1094.0, 570.0),
    (832.0, 300.0),
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/cafe/rooms", get(list_rooms).post(create_room))
        .route("/cafe/rooms/quick-join", post(quick_join))
        .route("/cafe/rooms/join", post(join_by_code))
        .route("/cafe/rooms/{room_id}/ws", get(cafe_socket))
        .route("/cafe/progress", get(cafe_progress))
        .route("/cafe/cosmetics/equipped", post(equip_cafe_cosmetic))
}

#[derive(Clone, Default)]
pub struct CafeHub {
    rooms: Arc<Mutex<HashMap<Uuid, CafeRoom>>>,
}

#[derive(Clone)]
struct CafeRoom {
    id: Uuid,
    invite_code: String,
    is_private: bool,
    players: HashMap<Uuid, CafePlayer>,
    activity: CafeActivity,
    chat_history: VecDeque<CafeChatEvent>,
    sender: broadcast::Sender<CafeServerMessage>,
}

#[derive(Clone)]
struct CafePlayer {
    id: Uuid,
    owner: OwnerScope,
    name: String,
    color: String,
    x: f32,
    y: f32,
    direction: Direction,
    moving: bool,
    carried_tea: u8,
    carried_rush_ingredient_ids: Vec<String>,
    carried_order_id: Option<String>,
    equipped_cosmetic: Option<String>,
    last_sequence: u64,
    last_move_at: Instant,
}

struct PlayerMovement {
    x: f32,
    y: f32,
    direction: Direction,
    moving: bool,
    sequence: u64,
}

#[derive(Clone, Serialize)]
struct CafeRoomState {
    id: Uuid,
    invite_code: String,
    is_private: bool,
    capacity: usize,
    map_layout: CafeMapLayout,
    players: Vec<CafePlayerState>,
    activity: CafeActivity,
    aiko: CafeAikoState,
}

#[derive(Clone, Copy, Serialize)]
struct CafeMapLayout {
    version: &'static str,
    width: f32,
    height: f32,
    player_collision_radius: f32,
    interaction_radius: f32,
    host_interaction_radius: f32,
    player_spawn: CafeMapPoint,
    colliders: &'static [CafeMapCollider],
    interaction_targets: &'static [CafeMapInteractionTarget],
}

#[derive(Clone, Copy, Serialize)]
struct CafeMapPoint {
    x: f32,
    y: f32,
}

#[derive(Clone, Copy, Serialize)]
struct CafeMapCollider {
    id: &'static str,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

impl CafeMapCollider {
    const fn new(id: &'static str, x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            id,
            x,
            y,
            width,
            height,
        }
    }

    fn contains_player(self, x: f32, y: f32) -> bool {
        let radius = CAFE_MAP_LAYOUT.player_collision_radius;
        x + radius > self.x
            && x - radius < self.x + self.width
            && y + radius > self.y
            && y - radius < self.y + self.height
    }
}

#[derive(Clone, Copy, Serialize)]
struct CafeMapInteractionTarget {
    id: &'static str,
    x: f32,
    y: f32,
}

impl CafeMapInteractionTarget {
    const fn new(id: &'static str, x: f32, y: f32) -> Self {
        Self { id, x, y }
    }
}

#[derive(Clone, Serialize)]
struct CafePlayerState {
    id: Uuid,
    name: String,
    color: String,
    x: f32,
    y: f32,
    direction: Direction,
    moving: bool,
    carried_tea: u8,
    carried_order_id: Option<String>,
    equipped_cosmetic: Option<String>,
}

#[derive(Clone, Serialize)]
struct CafeAikoState {
    x: f32,
    y: f32,
    motion: &'static str,
}

#[derive(Clone, Serialize)]
struct CafeChatEvent {
    id: Uuid,
    kind: CafeChatEventKind,
    player_id: Uuid,
    player_name: String,
    text: Option<String>,
    created_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum CafeChatEventKind {
    Message,
    Joined,
    Left,
}

#[derive(Clone, Serialize)]
struct CafeActivity {
    id: CafeActivityId,
    round_number: u32,
    phase: CafeActivityPhase,
    next_round_at: Option<i64>,
    ends_at: Option<i64>,
    delivered: u8,
    target: u8,
    combo: u8,
    best_combo: u8,
    combo_expires_at: Option<i64>,
    completed: bool,
    tea_leaves: Vec<CafeTeaLeaf>,
    table_orders: Vec<CafeTableOrder>,
}

#[derive(Clone, Serialize)]
struct CafeTeaLeaf {
    id: String,
    x: f32,
    y: f32,
    available: bool,
}

#[derive(Clone, Serialize)]
struct CafeTableOrder {
    id: String,
    table_id: &'static str,
    drink: &'static str,
    x: f32,
    y: f32,
    status: CafeTableOrderStatus,
    claimed_by: Option<Uuid>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum CafeActivityId {
    TeaDelivery,
    TableService,
    CafeRush,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum CafeTableOrderStatus {
    WaitingIngredient,
    Available,
    Claimed,
    Served,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum CafeActivityPhase {
    Active,
    Intermission,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

#[derive(Clone, Serialize)]
pub struct CafeRoomSummary {
    id: Uuid,
    invite_code: String,
    is_private: bool,
    player_count: usize,
    capacity: usize,
    activity_id: CafeActivityId,
    activity_completed: bool,
}

#[derive(Serialize)]
struct CafeRoomsResponse {
    rooms: Vec<CafeRoomSummary>,
}

#[derive(Serialize)]
struct CafeRoomResponse {
    room: CafeRoomSummary,
}

#[derive(Serialize)]
struct CafeProgressResponse {
    cafe_stars: u32,
    unlocked_cosmetics: Vec<String>,
    equipped_cosmetic: Option<String>,
    cosmetics: Vec<CafeCosmeticResponse>,
}

#[derive(Serialize)]
struct CafeCosmeticResponse {
    id: &'static str,
    required_stars: u32,
    unlocked: bool,
}

#[derive(Deserialize)]
struct EquipCafeCosmeticRequest {
    cosmetic_id: Option<String>,
}

#[derive(Deserialize)]
struct CreateRoomRequest {
    #[serde(default = "default_private_room")]
    is_private: bool,
}

fn default_private_room() -> bool {
    true
}

#[derive(Deserialize)]
struct JoinRoomRequest {
    invite_code: String,
}

#[derive(Deserialize)]
struct CafeSocketQuery {
    nickname: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum CafeClientMessage {
    Move {
        x: f32,
        y: f32,
        direction: Direction,
        moving: bool,
        sequence: u64,
    },
    Interact {
        target_id: String,
    },
    Emote {
        emote: String,
    },
    Chat {
        text: String,
    },
    Ping,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum CafeServerMessage {
    Welcome {
        self_player_id: Uuid,
        cafe_stars: u32,
        room: CafeRoomState,
        chat_history: Vec<CafeChatEvent>,
    },
    Snapshot {
        room: CafeRoomState,
    },
    Dialogue {
        message_key: &'static str,
        expression: &'static str,
    },
    Emote {
        player_id: Uuid,
        emote: String,
    },
    ChatEvent {
        event: CafeChatEvent,
    },
    ChatError {
        code: CafeChatErrorCode,
    },
    Reward {
        player_id: Uuid,
        earned_stars: u32,
    },
    Pong,
    Error {
        code: CafeErrorCode,
        message: String,
    },
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum CafeErrorCode {
    RoomNotFound,
    RoomFull,
    RateLimited,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum CafeChatErrorCode {
    Empty,
    TooLong,
    LinksNotAllowed,
    RateLimited,
}

#[derive(Debug, PartialEq, Eq)]
enum CafeJoinError {
    RoomNotFound,
    RoomFull,
}

struct CafeJoin {
    receiver: broadcast::Receiver<CafeServerMessage>,
    snapshot: CafeRoomState,
    chat_history: Vec<CafeChatEvent>,
}

struct CafeInteractionResult {
    awarded_owners: Vec<OwnerScope>,
    completed_round: Option<u32>,
}

impl CafeInteractionResult {
    fn none() -> Self {
        Self {
            awarded_owners: Vec::new(),
            completed_round: None,
        }
    }
}

impl CafeActivity {
    fn for_round(round_number: u32, player_count: usize) -> Self {
        match round_number % 3 {
            1 => Self::tea_delivery(round_number),
            2 => Self::table_service(round_number),
            _ => Self::cafe_rush(round_number, player_count),
        }
    }

    fn tea_delivery(round_number: u32) -> Self {
        let layout = TEA_LAYOUTS[(round_number.saturating_sub(1) as usize) % TEA_LAYOUTS.len()];
        Self {
            id: CafeActivityId::TeaDelivery,
            round_number,
            phase: CafeActivityPhase::Active,
            next_round_at: None,
            ends_at: None,
            delivered: 0,
            target: 3,
            combo: 0,
            best_combo: 0,
            combo_expires_at: None,
            completed: false,
            tea_leaves: layout
                .into_iter()
                .enumerate()
                .map(|(index, (x, y))| CafeTeaLeaf {
                    id: format!("tea-{round_number}-{}", index + 1),
                    x,
                    y,
                    available: true,
                })
                .collect(),
            table_orders: Vec::new(),
        }
    }

    fn table_service(round_number: u32) -> Self {
        Self {
            id: CafeActivityId::TableService,
            round_number,
            phase: CafeActivityPhase::Active,
            next_round_at: None,
            ends_at: None,
            delivered: 0,
            target: TABLE_SERVICE_ORDERS.len() as u8,
            combo: 0,
            best_combo: 0,
            combo_expires_at: None,
            completed: false,
            tea_leaves: Vec::new(),
            table_orders: TABLE_SERVICE_ORDERS
                .into_iter()
                .enumerate()
                .map(|(index, (table_id, drink, target_id))| {
                    let target = cafe_map_interaction_target(target_id);
                    CafeTableOrder {
                        id: format!("order-{round_number}-{}", index + 1),
                        table_id,
                        drink,
                        x: target.x,
                        y: target.y,
                        status: CafeTableOrderStatus::Available,
                        claimed_by: None,
                    }
                })
                .collect(),
        }
    }

    fn cafe_rush(round_number: u32, player_count: usize) -> Self {
        let target = cafe_rush_target(player_count);
        let now = Utc::now().timestamp_millis();
        Self {
            id: CafeActivityId::CafeRush,
            round_number,
            phase: CafeActivityPhase::Active,
            next_round_at: None,
            ends_at: Some(now + i64::try_from(CAFE_RUSH_DURATION.as_millis()).unwrap_or(i64::MAX)),
            delivered: 0,
            target,
            combo: 0,
            best_combo: 0,
            combo_expires_at: None,
            completed: false,
            tea_leaves: CAFE_RUSH_INGREDIENTS
                .into_iter()
                .take(usize::from(target))
                .enumerate()
                .map(|(index, (x, y))| CafeTeaLeaf {
                    id: format!("tea-{round_number}-{}", index + 1),
                    x,
                    y,
                    available: true,
                })
                .collect(),
            table_orders: CAFE_RUSH_ORDERS
                .into_iter()
                .take(usize::from(target))
                .enumerate()
                .map(|(index, (table_id, drink, target_id))| {
                    let target = cafe_map_interaction_target(target_id);
                    CafeTableOrder {
                        id: format!("order-{round_number}-{}", index + 1),
                        table_id,
                        drink,
                        x: target.x,
                        y: target.y,
                        status: CafeTableOrderStatus::WaitingIngredient,
                        claimed_by: None,
                    }
                })
                .collect(),
        }
    }
}

fn cafe_rush_target(player_count: usize) -> u8 {
    u8::try_from(
        player_count
            .saturating_add(2)
            .clamp(3, CAFE_RUSH_ORDERS.len()),
    )
    .unwrap_or(CAFE_RUSH_ORDERS.len() as u8)
}

impl CafeHub {
    pub async fn list_public_rooms(&self) -> Vec<CafeRoomSummary> {
        let rooms = self.rooms.lock().await;
        let mut summaries = rooms
            .values()
            .filter(|room| !room.is_private && room.players.len() < ROOM_CAPACITY)
            .map(room_summary)
            .collect::<Vec<_>>();
        summaries.sort_by(|left, right| {
            right
                .player_count
                .cmp(&left.player_count)
                .then_with(|| left.id.cmp(&right.id))
        });
        summaries
    }

    pub async fn create_room(&self, is_private: bool) -> CafeRoomSummary {
        let mut rooms = self.rooms.lock().await;
        let room = new_room(is_private, &rooms);
        let summary = room_summary(&room);
        rooms.insert(room.id, room);
        summary
    }

    pub async fn quick_join(&self) -> CafeRoomSummary {
        let mut rooms = self.rooms.lock().await;
        if let Some(room) = rooms
            .values()
            .filter(|room| !room.is_private && room.players.len() < ROOM_CAPACITY)
            .max_by_key(|room| room.players.len())
        {
            return room_summary(room);
        }

        let room = new_room(false, &rooms);
        let summary = room_summary(&room);
        rooms.insert(room.id, room);
        summary
    }

    async fn find_by_invite_code(&self, code: &str) -> Result<CafeRoomSummary, CafeJoinError> {
        let normalized = normalize_invite_code(code).ok_or(CafeJoinError::RoomNotFound)?;
        let rooms = self.rooms.lock().await;
        let room = rooms
            .values()
            .find(|room| room.invite_code == normalized)
            .ok_or(CafeJoinError::RoomNotFound)?;
        if room.players.len() >= ROOM_CAPACITY {
            return Err(CafeJoinError::RoomFull);
        }
        Ok(room_summary(room))
    }

    #[cfg(test)]
    async fn contains_room(&self, room_id: Uuid) -> bool {
        self.rooms.lock().await.contains_key(&room_id)
    }

    async fn join(&self, room_id: Uuid, player: CafePlayer) -> Result<CafeJoin, CafeJoinError> {
        let mut rooms = self.rooms.lock().await;
        let room = rooms.get_mut(&room_id).ok_or(CafeJoinError::RoomNotFound)?;
        if !room.players.contains_key(&player.id) && room.players.len() >= ROOM_CAPACITY {
            return Err(CafeJoinError::RoomFull);
        }

        let was_present = room.players.contains_key(&player.id);
        let player_id = player.id;
        let player_name = player.name.clone();
        let receiver = room.sender.subscribe();
        let chat_history = room.chat_history.iter().cloned().collect();
        room.players.insert(player.id, player);
        let snapshot = room_state(room);
        let _ = room.sender.send(CafeServerMessage::Snapshot {
            room: snapshot.clone(),
        });
        if !was_present {
            push_chat_event(
                room,
                CafeChatEvent {
                    id: Uuid::new_v4(),
                    kind: CafeChatEventKind::Joined,
                    player_id,
                    player_name,
                    text: None,
                    created_at: Utc::now().timestamp_millis(),
                },
            );
        }

        Ok(CafeJoin {
            receiver,
            snapshot,
            chat_history,
        })
    }

    async fn leave(&self, room_id: Uuid, player_id: Uuid) {
        let mut rooms = self.rooms.lock().await;
        let should_remove =
            if let Some(room) = rooms.get_mut(&room_id) {
                let player = room.players.remove(&player_id);
                let departed_name = player.as_ref().map(|player| player.name.clone());
                if let Some(player) = player {
                    for ingredient_id in player.carried_rush_ingredient_ids {
                        if let Some(ingredient) = room
                            .activity
                            .tea_leaves
                            .iter_mut()
                            .find(|ingredient| ingredient.id == ingredient_id)
                        {
                            ingredient.available = true;
                        }
                    }
                    if let Some(order_id) = player.carried_order_id {
                        if let Some(order) = room.activity.table_orders.iter_mut().find(|order| {
                            order.id == order_id && order.claimed_by == Some(player_id)
                        }) {
                            order.status = CafeTableOrderStatus::Available;
                            order.claimed_by = None;
                        }
                    }
                }
                if room.players.is_empty() {
                    true
                } else {
                    let _ = room.sender.send(CafeServerMessage::Snapshot {
                        room: room_state(room),
                    });
                    if let Some(player_name) = departed_name {
                        push_chat_event(
                            room,
                            CafeChatEvent {
                                id: Uuid::new_v4(),
                                kind: CafeChatEventKind::Left,
                                player_id,
                                player_name,
                                text: None,
                                created_at: Utc::now().timestamp_millis(),
                            },
                        );
                    }
                    false
                }
            } else {
                false
            };

        if should_remove {
            rooms.remove(&room_id);
        }
    }

    async fn update_player(&self, room_id: Uuid, player_id: Uuid, movement: PlayerMovement) {
        let mut rooms = self.rooms.lock().await;
        let Some(room) = rooms.get_mut(&room_id) else {
            return;
        };
        let Some(player) = room.players.get_mut(&player_id) else {
            return;
        };
        if movement.sequence <= player.last_sequence
            || !movement.x.is_finite()
            || !movement.y.is_finite()
        {
            return;
        }

        let elapsed = player
            .last_move_at
            .elapsed()
            .as_secs_f32()
            .clamp(0.016, 0.5);
        let max_delta = MOVE_SPEED * elapsed + 22.0;
        let dx = movement.x - player.x;
        let dy = movement.y - player.y;
        let distance = (dx * dx + dy * dy).sqrt();
        let (next_x, next_y) = if distance > max_delta && distance > 0.0 {
            (
                player.x + dx / distance * max_delta,
                player.y + dy / distance * max_delta,
            )
        } else {
            (movement.x, movement.y)
        };
        let radius = CAFE_MAP_LAYOUT.player_collision_radius;
        let next_x = next_x.clamp(radius, CAFE_MAP_LAYOUT.width - radius);
        let next_y = next_y.clamp(radius, CAFE_MAP_LAYOUT.height - radius);

        if !cafe_map_collides(next_x, next_y) {
            player.x = next_x;
            player.y = next_y;
        }
        player.direction = movement.direction;
        player.moving = movement.moving;
        player.last_sequence = movement.sequence;
        player.last_move_at = Instant::now();

        let _ = room.sender.send(CafeServerMessage::Snapshot {
            room: room_state(room),
        });
    }

    async fn emote(&self, room_id: Uuid, player_id: Uuid, emote: &str) {
        const ALLOWED: &[&str] = &["wave", "heart", "happy", "tea"];
        if !ALLOWED.contains(&emote) {
            return;
        }
        let rooms = self.rooms.lock().await;
        let Some(room) = rooms.get(&room_id) else {
            return;
        };
        if room.players.contains_key(&player_id) {
            let _ = room.sender.send(CafeServerMessage::Emote {
                player_id,
                emote: emote.to_owned(),
            });
        }
    }

    async fn chat(
        &self,
        room_id: Uuid,
        player_id: Uuid,
        text: &str,
    ) -> Result<(), CafeChatErrorCode> {
        let text = normalize_cafe_chat_message(text)?;
        let mut rooms = self.rooms.lock().await;
        let Some(room) = rooms.get_mut(&room_id) else {
            return Ok(());
        };
        let Some(player) = room.players.get(&player_id) else {
            return Ok(());
        };
        let event = CafeChatEvent {
            id: Uuid::new_v4(),
            kind: CafeChatEventKind::Message,
            player_id,
            player_name: player.name.clone(),
            text: Some(text),
            created_at: Utc::now().timestamp_millis(),
        };
        push_chat_event(room, event);
        Ok(())
    }

    async fn interact(
        &self,
        room_id: Uuid,
        player_id: Uuid,
        target_id: &str,
    ) -> CafeInteractionResult {
        let mut rooms = self.rooms.lock().await;
        let Some(room) = rooms.get_mut(&room_id) else {
            return CafeInteractionResult::none();
        };
        let Some(player) = room.players.get(&player_id) else {
            return CafeInteractionResult::none();
        };
        let player_position = (player.x, player.y);
        let aiko = cafe_map_interaction_target("aiko");

        if room.activity.phase == CafeActivityPhase::Intermission {
            if target_id == "aiko"
                && distance_between(player_position, (aiko.x, aiko.y))
                    <= CAFE_MAP_LAYOUT.host_interaction_radius
            {
                let _ = room.sender.send(CafeServerMessage::Dialogue {
                    message_key: "cafe.dialogue.intermission",
                    expression: "happy",
                });
            }
            return CafeInteractionResult::none();
        }

        if room.activity.id == CafeActivityId::TableService {
            return interact_table_service(room, player_id, player_position, target_id);
        }

        if let Some(leaf_index) = room
            .activity
            .tea_leaves
            .iter()
            .position(|leaf| leaf.id == target_id && leaf.available)
        {
            let leaf = &room.activity.tea_leaves[leaf_index];
            if distance_between(player_position, (leaf.x, leaf.y))
                <= CAFE_MAP_LAYOUT.interaction_radius
            {
                room.activity.tea_leaves[leaf_index].available = false;
                if let Some(player) = room.players.get_mut(&player_id) {
                    player.carried_tea = player.carried_tea.saturating_add(1);
                    if room.activity.id == CafeActivityId::CafeRush {
                        player
                            .carried_rush_ingredient_ids
                            .push(room.activity.tea_leaves[leaf_index].id.clone());
                    }
                }
                let _ = room.sender.send(CafeServerMessage::Dialogue {
                    message_key: if room.activity.id == CafeActivityId::CafeRush {
                        "cafe.dialogue.rushIngredientCollected"
                    } else {
                        "cafe.dialogue.teaCollected"
                    },
                    expression: "happy",
                });
                let _ = room.sender.send(CafeServerMessage::Snapshot {
                    room: room_state(room),
                });
            }
            return CafeInteractionResult::none();
        }

        if room.activity.id == CafeActivityId::CafeRush {
            return interact_cafe_rush(room, player_id, player_position, target_id);
        }

        if target_id != "aiko"
            || distance_between(player_position, (aiko.x, aiko.y))
                > CAFE_MAP_LAYOUT.host_interaction_radius
        {
            return CafeInteractionResult::none();
        }

        let carried = room
            .players
            .get_mut(&player_id)
            .map(|player| std::mem::take(&mut player.carried_tea))
            .unwrap_or_default();
        if carried == 0 {
            let _ = room.sender.send(CafeServerMessage::Dialogue {
                message_key: "cafe.dialogue.teaSearch",
                expression: "neutral",
            });
            return CafeInteractionResult::none();
        }

        room.activity.delivered = room
            .activity
            .delivered
            .saturating_add(carried)
            .min(room.activity.target);
        let completed_now =
            !room.activity.completed && room.activity.delivered >= room.activity.target;
        room.activity.completed = room.activity.completed || completed_now;
        let completed_round = completed_now.then_some(room.activity.round_number);
        if completed_now {
            room.activity.phase = CafeActivityPhase::Intermission;
            room.activity.next_round_at = Some(
                Utc::now().timestamp_millis()
                    + i64::try_from(ROUND_INTERMISSION.as_millis()).unwrap_or(i64::MAX),
            );
        }
        let awarded_owners = if completed_now {
            room.players.values().map(|player| player.owner).collect()
        } else {
            Vec::new()
        };
        let _ = room.sender.send(CafeServerMessage::Dialogue {
            message_key: if completed_now {
                "cafe.dialogue.roundComplete"
            } else {
                "cafe.dialogue.teaProgress"
            },
            expression: "happy",
        });
        let _ = room.sender.send(CafeServerMessage::Snapshot {
            room: room_state(room),
        });

        CafeInteractionResult {
            awarded_owners,
            completed_round,
        }
    }

    fn start_next_round(
        &self,
        room_id: Uuid,
        completed_round: u32,
    ) -> Pin<Box<dyn Future<Output = bool> + Send + '_>> {
        Box::pin(async move {
            let mut rooms = self.rooms.lock().await;
            let Some(room) = rooms.get_mut(&room_id) else {
                return false;
            };
            if room.activity.round_number != completed_round
                || room.activity.phase != CafeActivityPhase::Intermission
            {
                return false;
            }

            let next_round = completed_round.saturating_add(1);
            room.activity = CafeActivity::for_round(next_round, room.players.len());
            for player in room.players.values_mut() {
                player.carried_tea = 0;
                player.carried_rush_ingredient_ids.clear();
                player.carried_order_id = None;
            }
            let _ = room.sender.send(CafeServerMessage::Snapshot {
                room: room_state(room),
            });
            let _ = room.sender.send(CafeServerMessage::Dialogue {
                message_key: match room.activity.id {
                    CafeActivityId::TeaDelivery => "cafe.dialogue.teaRoundReady",
                    CafeActivityId::TableService => "cafe.dialogue.serviceRoundReady",
                    CafeActivityId::CafeRush => "cafe.dialogue.rushRoundReady",
                },
                expression: "happy",
            });
            let starts_cafe_rush = room.activity.id == CafeActivityId::CafeRush;
            drop(rooms);
            if starts_cafe_rush {
                tokio::spawn(run_cafe_rush_timer(self.clone(), room_id, next_round));
            }
            true
        })
    }

    async fn expire_cafe_rush(&self, room_id: Uuid, round_number: u32) -> bool {
        let mut rooms = self.rooms.lock().await;
        let Some(room) = rooms.get_mut(&room_id) else {
            return false;
        };
        if room.activity.id != CafeActivityId::CafeRush
            || room.activity.round_number != round_number
            || room.activity.phase != CafeActivityPhase::Active
            || room.activity.completed
        {
            return false;
        }

        room.activity.phase = CafeActivityPhase::Intermission;
        room.activity.ends_at = None;
        room.activity.combo_expires_at = None;
        room.activity.next_round_at = Some(
            Utc::now().timestamp_millis()
                + i64::try_from(ROUND_INTERMISSION.as_millis()).unwrap_or(i64::MAX),
        );
        for player in room.players.values_mut() {
            player.carried_tea = 0;
            player.carried_rush_ingredient_ids.clear();
            player.carried_order_id = None;
        }
        let _ = room.sender.send(CafeServerMessage::Dialogue {
            message_key: "cafe.dialogue.rushTimeUp",
            expression: "neutral",
        });
        let _ = room.sender.send(CafeServerMessage::Snapshot {
            room: room_state(room),
        });
        true
    }

    async fn reward(&self, room_id: Uuid, player_ids: &[Uuid], earned_stars: u32) {
        let rooms = self.rooms.lock().await;
        if let Some(room) = rooms.get(&room_id) {
            for player_id in player_ids {
                let _ = room.sender.send(CafeServerMessage::Reward {
                    player_id: *player_id,
                    earned_stars,
                });
            }
        }
    }

    async fn equip_cosmetic(&self, owner: OwnerScope, cosmetic_id: Option<String>) {
        let mut rooms = self.rooms.lock().await;
        for room in rooms.values_mut() {
            let mut changed = false;
            for player in room.players.values_mut() {
                if same_owner(player.owner, owner) && player.equipped_cosmetic != cosmetic_id {
                    player.equipped_cosmetic.clone_from(&cosmetic_id);
                    changed = true;
                }
            }
            if changed {
                let _ = room.sender.send(CafeServerMessage::Snapshot {
                    room: room_state(room),
                });
            }
        }
    }
}

async fn run_cafe_rush_timer(cafe: CafeHub, room_id: Uuid, round_number: u32) {
    tokio::time::sleep(CAFE_RUSH_DURATION).await;
    if cafe.expire_cafe_rush(room_id, round_number).await {
        tokio::time::sleep(ROUND_INTERMISSION).await;
        cafe.start_next_round(room_id, round_number).await;
    }
}

fn interact_table_service(
    room: &mut CafeRoom,
    player_id: Uuid,
    player_position: (f32, f32),
    target_id: &str,
) -> CafeInteractionResult {
    if target_id == SERVICE_COUNTER_TARGET_ID {
        let counter = cafe_map_interaction_target(SERVICE_COUNTER_TARGET_ID);
        if distance_between(player_position, (counter.x, counter.y))
            > CAFE_MAP_LAYOUT.host_interaction_radius
        {
            return CafeInteractionResult::none();
        }
        if room
            .players
            .get(&player_id)
            .is_some_and(|player| player.carried_order_id.is_some())
        {
            let _ = room.sender.send(CafeServerMessage::Dialogue {
                message_key: "cafe.dialogue.serviceAlreadyCarrying",
                expression: "neutral",
            });
            return CafeInteractionResult::none();
        }
        let Some(order) = room
            .activity
            .table_orders
            .iter_mut()
            .find(|order| order.status == CafeTableOrderStatus::Available)
        else {
            let _ = room.sender.send(CafeServerMessage::Dialogue {
                message_key: "cafe.dialogue.serviceOrdersClaimed",
                expression: "neutral",
            });
            return CafeInteractionResult::none();
        };
        order.status = CafeTableOrderStatus::Claimed;
        order.claimed_by = Some(player_id);
        if let Some(player) = room.players.get_mut(&player_id) {
            player.carried_order_id = Some(order.id.clone());
        }
        let _ = room.sender.send(CafeServerMessage::Dialogue {
            message_key: "cafe.dialogue.servicePickedUp",
            expression: "happy",
        });
        let _ = room.sender.send(CafeServerMessage::Snapshot {
            room: room_state(room),
        });
        return CafeInteractionResult::none();
    }

    serve_claimed_order(room, player_id, player_position, target_id)
}

fn interact_cafe_rush(
    room: &mut CafeRoom,
    player_id: Uuid,
    player_position: (f32, f32),
    target_id: &str,
) -> CafeInteractionResult {
    if target_id != SERVICE_COUNTER_TARGET_ID {
        return serve_claimed_order(room, player_id, player_position, target_id);
    }

    let counter = cafe_map_interaction_target(SERVICE_COUNTER_TARGET_ID);
    if distance_between(player_position, (counter.x, counter.y))
        > CAFE_MAP_LAYOUT.host_interaction_radius
    {
        return CafeInteractionResult::none();
    }
    if room
        .players
        .get(&player_id)
        .is_some_and(|player| player.carried_order_id.is_some())
    {
        let _ = room.sender.send(CafeServerMessage::Dialogue {
            message_key: "cafe.dialogue.serviceAlreadyCarrying",
            expression: "neutral",
        });
        return CafeInteractionResult::none();
    }

    let has_ingredient = room
        .players
        .get(&player_id)
        .is_some_and(|player| !player.carried_rush_ingredient_ids.is_empty());
    if has_ingredient {
        if let Some(order) = room
            .activity
            .table_orders
            .iter_mut()
            .find(|order| order.status == CafeTableOrderStatus::WaitingIngredient)
        {
            order.status = CafeTableOrderStatus::Available;
            if let Some(player) = room.players.get_mut(&player_id) {
                player.carried_tea = player.carried_tea.saturating_sub(1);
                player.carried_rush_ingredient_ids.pop();
            }
            let _ = room.sender.send(CafeServerMessage::Dialogue {
                message_key: "cafe.dialogue.rushOrderPrepared",
                expression: "happy",
            });
            let _ = room.sender.send(CafeServerMessage::Snapshot {
                room: room_state(room),
            });
            return CafeInteractionResult::none();
        }
    }

    if let Some(order) = room
        .activity
        .table_orders
        .iter_mut()
        .find(|order| order.status == CafeTableOrderStatus::Available)
    {
        order.status = CafeTableOrderStatus::Claimed;
        order.claimed_by = Some(player_id);
        if let Some(player) = room.players.get_mut(&player_id) {
            player.carried_order_id = Some(order.id.clone());
        }
        let _ = room.sender.send(CafeServerMessage::Dialogue {
            message_key: "cafe.dialogue.rushOrderPickedUp",
            expression: "happy",
        });
        let _ = room.sender.send(CafeServerMessage::Snapshot {
            room: room_state(room),
        });
        return CafeInteractionResult::none();
    }

    let message_key = if room
        .activity
        .table_orders
        .iter()
        .any(|order| order.status == CafeTableOrderStatus::WaitingIngredient)
    {
        "cafe.dialogue.rushFindIngredient"
    } else {
        "cafe.dialogue.serviceOrdersClaimed"
    };
    let _ = room.sender.send(CafeServerMessage::Dialogue {
        message_key,
        expression: "neutral",
    });
    CafeInteractionResult::none()
}

fn serve_claimed_order(
    room: &mut CafeRoom,
    player_id: Uuid,
    player_position: (f32, f32),
    target_id: &str,
) -> CafeInteractionResult {
    let Some(order_index) = room
        .activity
        .table_orders
        .iter()
        .position(|order| order.id == target_id)
    else {
        return CafeInteractionResult::none();
    };
    let order = &room.activity.table_orders[order_index];
    if order.status != CafeTableOrderStatus::Claimed
        || order.claimed_by != Some(player_id)
        || distance_between(player_position, (order.x, order.y))
            > CAFE_MAP_LAYOUT.interaction_radius
    {
        return CafeInteractionResult::none();
    }
    if room
        .players
        .get(&player_id)
        .and_then(|player| player.carried_order_id.as_deref())
        != Some(order.id.as_str())
    {
        return CafeInteractionResult::none();
    }

    room.activity.table_orders[order_index].status = CafeTableOrderStatus::Served;
    room.activity.table_orders[order_index].claimed_by = None;
    if let Some(player) = room.players.get_mut(&player_id) {
        player.carried_order_id = None;
    }
    room.activity.delivered = room
        .activity
        .delivered
        .saturating_add(1)
        .min(room.activity.target);
    if room.activity.id == CafeActivityId::CafeRush {
        let now = Utc::now().timestamp_millis();
        room.activity.combo = if room
            .activity
            .combo_expires_at
            .is_some_and(|expires_at| expires_at >= now)
        {
            room.activity.combo.saturating_add(1)
        } else {
            1
        };
        room.activity.best_combo = room.activity.best_combo.max(room.activity.combo);
        room.activity.combo_expires_at =
            Some(now + i64::try_from(CAFE_RUSH_COMBO_WINDOW.as_millis()).unwrap_or(i64::MAX));
    }
    let completed_now = !room.activity.completed && room.activity.delivered >= room.activity.target;
    room.activity.completed = room.activity.completed || completed_now;
    let completed_round = completed_now.then_some(room.activity.round_number);
    if completed_now {
        room.activity.phase = CafeActivityPhase::Intermission;
        room.activity.ends_at = None;
        room.activity.combo_expires_at = None;
        room.activity.next_round_at = Some(
            Utc::now().timestamp_millis()
                + i64::try_from(ROUND_INTERMISSION.as_millis()).unwrap_or(i64::MAX),
        );
    }
    let awarded_owners = if completed_now {
        room.players.values().map(|player| player.owner).collect()
    } else {
        Vec::new()
    };
    let _ = room.sender.send(CafeServerMessage::Dialogue {
        message_key: if completed_now {
            "cafe.dialogue.roundComplete"
        } else if room.activity.id == CafeActivityId::CafeRush {
            "cafe.dialogue.rushOrderDelivered"
        } else {
            "cafe.dialogue.serviceDelivered"
        },
        expression: "happy",
    });
    let _ = room.sender.send(CafeServerMessage::Snapshot {
        room: room_state(room),
    });

    CafeInteractionResult {
        awarded_owners,
        completed_round,
    }
}

async fn list_rooms(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(HeaderMap, Json<CafeRoomsResponse>)> {
    let (session, response_headers) = ensure_cafe_session(&state, &headers).await?;
    let _ = session;
    Ok((
        response_headers,
        Json(CafeRoomsResponse {
            rooms: state.cafe.list_public_rooms().await,
        }),
    ))
}

async fn create_room(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateRoomRequest>,
) -> AppResult<(HeaderMap, Json<CafeRoomResponse>)> {
    let (_, response_headers) = ensure_cafe_session(&state, &headers).await?;
    Ok((
        response_headers,
        Json(CafeRoomResponse {
            room: state.cafe.create_room(payload.is_private).await,
        }),
    ))
}

async fn quick_join(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(HeaderMap, Json<CafeRoomResponse>)> {
    let (_, response_headers) = ensure_cafe_session(&state, &headers).await?;
    Ok((
        response_headers,
        Json(CafeRoomResponse {
            room: state.cafe.quick_join().await,
        }),
    ))
}

async fn join_by_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<JoinRoomRequest>,
) -> AppResult<(HeaderMap, Json<CafeRoomResponse>)> {
    let (_, response_headers) = ensure_cafe_session(&state, &headers).await?;
    let room = match state.cafe.find_by_invite_code(&payload.invite_code).await {
        Ok(room) => room,
        Err(CafeJoinError::RoomNotFound) => return Err(AppError::NotFound),
        Err(CafeJoinError::RoomFull) => {
            return Err(AppError::Conflict("cafe room is full".to_owned()));
        }
    };
    Ok((response_headers, Json(CafeRoomResponse { room })))
}

async fn cafe_progress(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(HeaderMap, Json<CafeProgressResponse>)> {
    let (session, response_headers) = ensure_cafe_session(&state, &headers).await?;
    let progress = state
        .store
        .get_cafe_progress(OwnerScope::from_session(&session))
        .await?;
    Ok((response_headers, Json(progress_response(progress))))
}

async fn equip_cafe_cosmetic(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EquipCafeCosmeticRequest>,
) -> AppResult<(HeaderMap, Json<CafeProgressResponse>)> {
    let (session, response_headers) = ensure_cafe_session(&state, &headers).await?;
    let cosmetic_id = payload.cosmetic_id.as_deref();
    if cosmetic_id.is_some_and(|id| cafe_cosmetic(id).is_none()) {
        return Err(AppError::BadRequest("unknown cafe cosmetic".to_owned()));
    }
    let owner = OwnerScope::from_session(&session);
    if !state.store.equip_cafe_cosmetic(owner, cosmetic_id).await? {
        return Err(AppError::Forbidden);
    }
    let progress = state.store.get_cafe_progress(owner).await?;
    state
        .cafe
        .equip_cosmetic(owner, progress.equipped_cosmetic.clone())
        .await;
    Ok((response_headers, Json(progress_response(progress))))
}

async fn cafe_socket(
    ws: WebSocketUpgrade,
    Path(room_id): Path<Uuid>,
    Query(query): Query<CafeSocketQuery>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    if !is_allowed_websocket_origin(&headers, &state.config.frontend_origin) {
        return Err(AppError::Forbidden);
    }
    let (session, response_headers) = ensure_cafe_session(&state, &headers).await?;
    let player_name = cafe_display_name(&state, &session, query.nickname.as_deref()).await?;
    let progress = state
        .store
        .get_cafe_progress(OwnerScope::from_session(&session))
        .await?;
    let player = new_player(&session, player_name, progress.equipped_cosmetic);
    let initial_stars = progress.cafe_stars;
    let mut response = ws.on_upgrade(move |socket| {
        handle_cafe_socket(socket, state, room_id, player, initial_stars)
    });
    if let Some(cookie) = response_headers.get(SET_COOKIE).cloned() {
        response.headers_mut().insert(SET_COOKIE, cookie);
    }
    Ok(response)
}

fn is_allowed_websocket_origin(headers: &HeaderMap, configured_origins: &str) -> bool {
    let Some(origin) = headers.get(ORIGIN).and_then(|value| value.to_str().ok()) else {
        // Non-browser clients do not always send Origin. Browser connections do,
        // and are checked below before their cookie-authenticated upgrade.
        return true;
    };

    configured_origins
        .split(',')
        .map(str::trim)
        .any(|configured| !configured.is_empty() && configured == origin)
}

async fn handle_cafe_socket(
    mut socket: WebSocket,
    state: AppState,
    room_id: Uuid,
    player: CafePlayer,
    initial_stars: u32,
) {
    let player_id = player.id;
    let mut joined = match state.cafe.join(room_id, player).await {
        Ok(joined) => joined,
        Err(error) => {
            let (code, message) = match error {
                CafeJoinError::RoomNotFound => {
                    (CafeErrorCode::RoomNotFound, "Cafe room no longer exists")
                }
                CafeJoinError::RoomFull => (CafeErrorCode::RoomFull, "Cafe room is full"),
            };
            send_socket_message(
                &mut socket,
                &CafeServerMessage::Error {
                    code,
                    message: message.to_owned(),
                },
            )
            .await;
            return;
        }
    };

    if !send_socket_message(
        &mut socket,
        &CafeServerMessage::Welcome {
            self_player_id: player_id,
            cafe_stars: initial_stars,
            room: joined.snapshot,
            chat_history: joined.chat_history,
        },
    )
    .await
    {
        state.cafe.leave(room_id, player_id).await;
        return;
    }

    let mut recent_messages = VecDeque::new();
    let mut recent_chat_messages = VecDeque::new();
    loop {
        tokio::select! {
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else {
                    break;
                };
                match message {
                    Message::Text(text) => {
                        if !accept_message(&mut recent_messages) {
                            let _ = send_socket_message(
                                &mut socket,
                                &CafeServerMessage::Error {
                                    code: CafeErrorCode::RateLimited,
                                    message: "Too many cafe messages".to_owned(),
                                },
                            ).await;
                            break;
                        }
                        let Ok(message) = serde_json::from_str::<CafeClientMessage>(&text) else {
                            continue;
                        };
                        match message {
                            CafeClientMessage::Move { x, y, direction, moving, sequence } => {
                                state.cafe.update_player(room_id, player_id, PlayerMovement {
                                    x,
                                    y,
                                    direction,
                                    moving,
                                    sequence,
                                }).await;
                            }
                            CafeClientMessage::Interact { target_id } => {
                                let result = state.cafe.interact(room_id, player_id, &target_id).await;
                                if let Some(completed_round) = result.completed_round {
                                    let cafe = state.cafe.clone();
                                    tokio::spawn(async move {
                                        tokio::time::sleep(ROUND_INTERMISSION).await;
                                        cafe.start_next_round(room_id, completed_round).await;
                                    });
                                    match state.store.award_cafe_round_completion(
                                        room_id,
                                        completed_round,
                                        &result.awarded_owners,
                                    ).await {
                                        Ok(awarded_player_ids) => {
                                            state.cafe.reward(room_id, &awarded_player_ids, 1).await;
                                        }
                                        Err(error) => tracing::error!(
                                            %room_id,
                                            round_number = completed_round,
                                            error = %error,
                                            "failed to persist cafe round reward"
                                        ),
                                    }
                                }
                            }
                            CafeClientMessage::Emote { emote } => {
                                state.cafe.emote(room_id, player_id, &emote).await;
                            }
                            CafeClientMessage::Chat { text } => {
                                let result = if accept_chat_message(&mut recent_chat_messages) {
                                    state.cafe.chat(room_id, player_id, &text).await
                                } else {
                                    Err(CafeChatErrorCode::RateLimited)
                                };
                                if let Err(code) = result {
                                    let _ = send_socket_message(
                                        &mut socket,
                                        &CafeServerMessage::ChatError { code },
                                    ).await;
                                }
                            }
                            CafeClientMessage::Ping => {
                                if !send_socket_message(&mut socket, &CafeServerMessage::Pong).await {
                                    break;
                                }
                            }
                        }
                    }
                    Message::Ping(payload)
                        if socket
                            .send(Message::Pong(payload.clone()))
                            .await
                            .is_err() =>
                    {
                        break;
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            event = joined.receiver.recv() => {
                match event {
                    Ok(event) => {
                        if !send_socket_message(&mut socket, &event).await {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    state.cafe.leave(room_id, player_id).await;
}

async fn send_socket_message(socket: &mut WebSocket, message: &CafeServerMessage) -> bool {
    let Ok(text) = serde_json::to_string(message) else {
        return false;
    };
    socket.send(Message::Text(text.into())).await.is_ok()
}

fn accept_message(recent_messages: &mut VecDeque<Instant>) -> bool {
    let now = Instant::now();
    while recent_messages
        .front()
        .is_some_and(|timestamp| now.duration_since(*timestamp) > MESSAGE_WINDOW)
    {
        recent_messages.pop_front();
    }
    if recent_messages.len() >= MAX_MESSAGES_PER_WINDOW {
        return false;
    }
    recent_messages.push_back(now);
    true
}

fn accept_chat_message(recent_messages: &mut VecDeque<Instant>) -> bool {
    let now = Instant::now();
    while recent_messages
        .front()
        .is_some_and(|timestamp| now.duration_since(*timestamp) > CHAT_MESSAGE_WINDOW)
    {
        recent_messages.pop_front();
    }
    if recent_messages.len() >= MAX_CHAT_MESSAGES_PER_WINDOW {
        return false;
    }
    recent_messages.push_back(now);
    true
}

fn normalize_cafe_chat_message(value: &str) -> Result<String, CafeChatErrorCode> {
    if value.chars().any(char::is_control) {
        return Err(CafeChatErrorCode::Empty);
    }
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return Err(CafeChatErrorCode::Empty);
    }
    if normalized.chars().count() > MAX_CHAT_MESSAGE_CHARS {
        return Err(CafeChatErrorCode::TooLong);
    }
    let lowercase = normalized.to_lowercase();
    if ["http://", "https://", "www."]
        .iter()
        .any(|prefix| lowercase.contains(prefix))
    {
        return Err(CafeChatErrorCode::LinksNotAllowed);
    }
    Ok(normalized)
}

fn push_chat_event(room: &mut CafeRoom, event: CafeChatEvent) {
    room.chat_history.push_back(event.clone());
    while room.chat_history.len() > CHAT_HISTORY_LIMIT {
        room.chat_history.pop_front();
    }
    let _ = room.sender.send(CafeServerMessage::ChatEvent { event });
}

async fn ensure_cafe_session(
    state: &AppState,
    headers: &HeaderMap,
) -> AppResult<(SessionRecord, HeaderMap)> {
    let session = require_session(state, headers).await?;
    if !matches!(session.kind, UserKind::Guest) {
        state
            .store
            .migrate_session_data_to_user(session.id, session.user_id)
            .await?;
    }
    let mut response_headers = HeaderMap::new();
    if let Ok(cookie) = HeaderValue::from_str(&session_cookie(&state.config, session.id)) {
        response_headers.insert(SET_COOKIE, cookie);
    }
    Ok((session, response_headers))
}

async fn cafe_display_name(
    state: &AppState,
    session: &SessionRecord,
    nickname: Option<&str>,
) -> AppResult<String> {
    if let Some(nickname) = nickname.and_then(normalize_cafe_player_name) {
        return Ok(nickname);
    }
    if matches!(session.kind, UserKind::Guest) {
        let suffix = session
            .user_id
            .simple()
            .to_string()
            .chars()
            .take(4)
            .collect::<String>()
            .to_uppercase();
        return Ok(format!("Guest {suffix}"));
    }
    Ok(state
        .store
        .get_user_profile(session.user_id)
        .await?
        .map(|profile| profile.display_name)
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Cafe Guest".to_owned()))
}

fn normalize_cafe_player_name(value: &str) -> Option<String> {
    if value.chars().any(char::is_control) {
        return None;
    }
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let length = normalized.chars().count();
    (length > 0 && length <= MAX_CAFE_PLAYER_NAME_CHARS).then_some(normalized)
}

fn new_player(
    session: &SessionRecord,
    name: String,
    equipped_cosmetic: Option<String>,
) -> CafePlayer {
    let color_index = session.user_id.as_bytes()[0] as usize % PLAYER_COLORS.len();
    let spawn = CAFE_MAP_LAYOUT.player_spawn;
    CafePlayer {
        id: session.id,
        owner: OwnerScope::from_session(session),
        name,
        color: PLAYER_COLORS[color_index].to_owned(),
        x: spawn.x,
        y: spawn.y,
        direction: Direction::Up,
        moving: false,
        carried_tea: 0,
        carried_rush_ingredient_ids: Vec::new(),
        carried_order_id: None,
        equipped_cosmetic,
        last_sequence: 0,
        last_move_at: Instant::now(),
    }
}

const PLAYER_COLORS: &[&str] = &["#f48fb1", "#80cbc4", "#90caf9", "#ffcc80", "#ce93d8"];

fn new_room(is_private: bool, rooms: &HashMap<Uuid, CafeRoom>) -> CafeRoom {
    let id = Uuid::new_v4();
    let invite_code = unique_invite_code(id, rooms);
    let (sender, _) = broadcast::channel(128);
    CafeRoom {
        id,
        invite_code,
        is_private,
        players: HashMap::new(),
        activity: CafeActivity::for_round(1, 0),
        chat_history: VecDeque::new(),
        sender,
    }
}

fn unique_invite_code(seed: Uuid, rooms: &HashMap<Uuid, CafeRoom>) -> String {
    let mut value = u128::from_be_bytes(*seed.as_bytes());
    loop {
        let code = format!("{:06X}", (value & 0xFF_FFFF) as u32);
        if !rooms.values().any(|room| room.invite_code == code) {
            return code;
        }
        value = value.wrapping_add(1);
    }
}

fn normalize_invite_code(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_uppercase();
    (normalized.len() == 6
        && normalized
            .chars()
            .all(|character| character.is_ascii_hexdigit()))
    .then_some(normalized)
}

fn room_summary(room: &CafeRoom) -> CafeRoomSummary {
    CafeRoomSummary {
        id: room.id,
        invite_code: room.invite_code.clone(),
        is_private: room.is_private,
        player_count: room.players.len(),
        capacity: ROOM_CAPACITY,
        activity_id: room.activity.id,
        activity_completed: room.activity.completed,
    }
}

fn room_state(room: &CafeRoom) -> CafeRoomState {
    let aiko = cafe_map_interaction_target("aiko");
    let mut players = room
        .players
        .values()
        .map(|player| CafePlayerState {
            id: player.id,
            name: player.name.clone(),
            color: player.color.clone(),
            x: player.x,
            y: player.y,
            direction: player.direction,
            moving: player.moving,
            carried_tea: player.carried_tea,
            carried_order_id: player.carried_order_id.clone(),
            equipped_cosmetic: player.equipped_cosmetic.clone(),
        })
        .collect::<Vec<_>>();
    players.sort_by_key(|player| player.id);
    CafeRoomState {
        id: room.id,
        invite_code: room.invite_code.clone(),
        is_private: room.is_private,
        capacity: ROOM_CAPACITY,
        map_layout: CAFE_MAP_LAYOUT,
        players,
        activity: room.activity.clone(),
        aiko: CafeAikoState {
            x: aiko.x,
            y: aiko.y,
            motion: if room.activity.completed {
                "celebrate"
            } else {
                "idle"
            },
        },
    }
}

fn progress_response(progress: crate::store::CafeProgressRecord) -> CafeProgressResponse {
    let cosmetics = CAFE_COSMETICS
        .iter()
        .map(|definition| cosmetic_response(*definition, &progress.unlocked_cosmetics))
        .collect();
    CafeProgressResponse {
        cafe_stars: progress.cafe_stars,
        unlocked_cosmetics: progress.unlocked_cosmetics,
        equipped_cosmetic: progress.equipped_cosmetic,
        cosmetics,
    }
}

fn cosmetic_response(
    definition: CafeCosmeticDefinition,
    unlocked_cosmetics: &[String],
) -> CafeCosmeticResponse {
    CafeCosmeticResponse {
        id: definition.id,
        required_stars: definition.required_stars,
        unlocked: unlocked_cosmetics.iter().any(|id| id == definition.id),
    }
}

fn same_owner(left: OwnerScope, right: OwnerScope) -> bool {
    match (left.user_id, right.user_id) {
        (Some(left_user), Some(right_user)) => left_user == right_user,
        _ => left.session_id == right.session_id,
    }
}

fn distance_between(left: (f32, f32), right: (f32, f32)) -> f32 {
    let dx = left.0 - right.0;
    let dy = left.1 - right.1;
    (dx * dx + dy * dy).sqrt()
}

fn cafe_map_collides(x: f32, y: f32) -> bool {
    CAFE_MAP_LAYOUT
        .colliders
        .iter()
        .any(|collider| collider.contains_player(x, y))
}

fn cafe_map_interaction_target(id: &str) -> CafeMapInteractionTarget {
    CAFE_MAP_LAYOUT
        .interaction_targets
        .iter()
        .find(|target| target.id == id)
        .copied()
        .expect("Cafe map interaction target must exist")
}

#[cfg(test)]
fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_optional_cafe_player_names() {
        assert_eq!(
            normalize_cafe_player_name("  Mint   Friend  ").as_deref(),
            Some("Mint Friend")
        );
        assert_eq!(
            normalize_cafe_player_name("น้องชา").as_deref(),
            Some("น้องชา")
        );
        assert_eq!(normalize_cafe_player_name("   "), None);
        assert_eq!(normalize_cafe_player_name("Tea\nFriend"), None);
        assert_eq!(normalize_cafe_player_name(&"a".repeat(25)), None);
    }

    #[test]
    fn validates_and_rate_limits_cafe_chat_messages() {
        assert_eq!(
            normalize_cafe_chat_message("  hello   คาเฟ่  ").as_deref(),
            Ok("hello คาเฟ่")
        );
        assert!(matches!(
            normalize_cafe_chat_message(" \t "),
            Err(CafeChatErrorCode::Empty)
        ));
        assert!(matches!(
            normalize_cafe_chat_message(&"a".repeat(MAX_CHAT_MESSAGE_CHARS + 1)),
            Err(CafeChatErrorCode::TooLong)
        ));
        assert!(matches!(
            normalize_cafe_chat_message("visit https://example.com"),
            Err(CafeChatErrorCode::LinksNotAllowed)
        ));

        let mut recent = VecDeque::from(vec![Instant::now(); MAX_CHAT_MESSAGES_PER_WINDOW]);
        assert!(!accept_chat_message(&mut recent));
    }

    #[tokio::test]
    async fn room_chat_keeps_bounded_history_and_presence_events() {
        let hub = CafeHub::default();
        let room = hub.create_room(false).await;
        let first = guest();
        let second = guest();
        let first_join = hub
            .join(room.id, new_player(&first, "Mint".to_owned(), None))
            .await
            .expect("first player should join");
        assert!(first_join.chat_history.is_empty());
        let second_join = hub
            .join(room.id, new_player(&second, "Sakura".to_owned(), None))
            .await
            .expect("second player should join");
        assert_eq!(second_join.chat_history.len(), 1);
        assert_eq!(second_join.chat_history[0].kind, CafeChatEventKind::Joined);

        hub.chat(room.id, first.id, "  hello   Sakura  ")
            .await
            .expect("valid chat should send");
        hub.leave(room.id, second.id).await;

        {
            let rooms = hub.rooms.lock().await;
            let room = rooms
                .get(&room.id)
                .expect("first player should keep room alive");
            let events = room.chat_history.iter().collect::<Vec<_>>();
            assert_eq!(events[2].kind, CafeChatEventKind::Message);
            assert_eq!(events[2].player_id, first.id);
            assert_eq!(events[2].text.as_deref(), Some("hello Sakura"));
            assert_eq!(
                events.last().map(|event| event.kind),
                Some(CafeChatEventKind::Left)
            );
        }

        for index in 0..(CHAT_HISTORY_LIMIT + 4) {
            hub.chat(room.id, first.id, &format!("message {index}"))
                .await
                .expect("valid chat should send");
        }
        let rooms = hub.rooms.lock().await;
        let room = rooms.get(&room.id).expect("room should remain");
        assert_eq!(room.chat_history.len(), CHAT_HISTORY_LIMIT);
        assert_eq!(
            room.chat_history
                .back()
                .and_then(|event| event.text.as_deref()),
            Some("message 33")
        );
    }

    #[test]
    fn cafe_map_layout_is_versioned_and_matches_furniture_footprints() {
        assert_eq!(CAFE_MAP_LAYOUT.version, "cafe-room-v1");
        assert_eq!(CAFE_MAP_LAYOUT.width, 1280.0);
        assert_eq!(CAFE_MAP_LAYOUT.height, 800.0);
        assert_eq!(CAFE_MAP_LAYOUT.player_collision_radius, 10.0);
        assert_eq!(
            CAFE_MAP_LAYOUT
                .colliders
                .iter()
                .map(|collider| collider.id)
                .collect::<Vec<_>>(),
            [
                "service-counter",
                "table-window",
                "table-window-lower",
                "table-garden",
                "table-garden-lower",
                "table-long"
            ]
        );
        assert!(!cafe_map_collides(180.0, 380.0));
        assert!(cafe_map_collides(181.0, 380.0));
        assert!(cafe_map_collides(250.0, 380.0));
        assert!(!cafe_map_collides(320.0, 380.0));

        let room = new_room(false, &HashMap::new());
        let value = serde_json::to_value(room_state(&room)).expect("room state should serialize");
        assert_eq!(value["map_layout"]["version"], "cafe-room-v1");
        assert_eq!(value["map_layout"]["player_collision_radius"], 10.0);
        assert_eq!(value["map_layout"]["colliders"][1]["width"], 120.0);
    }

    fn guest() -> SessionRecord {
        SessionRecord {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            kind: UserKind::Guest,
            created_at: now_unix_seconds(),
        }
    }

    #[tokio::test]
    async fn quick_join_reuses_the_busiest_public_room() {
        let hub = CafeHub::default();
        let first = hub.quick_join().await;
        let session = guest();
        hub.join(
            first.id,
            new_player(&session, "Guest TEST".to_owned(), None),
        )
        .await
        .expect("player should join");

        let reused = hub.quick_join().await;
        assert_eq!(reused.id, first.id);
        assert_eq!(reused.player_count, 1);
    }

    #[tokio::test]
    async fn movement_is_bounded_and_rejects_collider_overlap() {
        let hub = CafeHub::default();
        let room = hub.create_room(false).await;
        let session = guest();
        hub.join(room.id, new_player(&session, "Guest MOVE".to_owned(), None))
            .await
            .expect("player should join");

        hub.update_player(
            room.id,
            session.id,
            PlayerMovement {
                x: 640.0,
                y: 160.0,
                direction: Direction::Up,
                moving: true,
                sequence: 1,
            },
        )
        .await;
        {
            let mut rooms = hub.rooms.lock().await;
            let player = rooms
                .get_mut(&room.id)
                .and_then(|room| room.players.get_mut(&session.id))
                .expect("player should remain");
            assert!(player.y > 650.0, "large movement should be clamped");
            player.x = 170.0;
            player.y = 380.0;
            player.last_move_at = Instant::now() - Duration::from_secs(1);
        }

        hub.update_player(
            room.id,
            session.id,
            PlayerMovement {
                x: 195.0,
                y: 380.0,
                direction: Direction::Right,
                moving: true,
                sequence: 2,
            },
        )
        .await;
        {
            let mut rooms = hub.rooms.lock().await;
            let player = rooms
                .get_mut(&room.id)
                .and_then(|room| room.players.get_mut(&session.id))
                .expect("player should remain");
            assert_eq!((player.x, player.y), (170.0, 380.0));
            player.last_move_at = Instant::now() - Duration::from_secs(1);
        }

        hub.update_player(
            room.id,
            session.id,
            PlayerMovement {
                x: 175.0,
                y: 380.0,
                direction: Direction::Right,
                moving: true,
                sequence: 3,
            },
        )
        .await;
        let rooms = hub.rooms.lock().await;
        let player = rooms
            .get(&room.id)
            .and_then(|room| room.players.get(&session.id))
            .expect("player should remain");
        assert_eq!((player.x, player.y), (175.0, 380.0));
    }

    #[tokio::test]
    async fn equipped_cosmetics_are_broadcast_to_connected_room_members() {
        let hub = CafeHub::default();
        let room = hub.create_room(false).await;
        let session = guest();
        let owner = OwnerScope::from_session(&session);
        let mut join = hub
            .join(
                room.id,
                new_player(&session, "Guest STYLE".to_owned(), None),
            )
            .await
            .expect("player should join");

        hub.equip_cosmetic(owner, Some("sakura_pin".to_owned()))
            .await;
        let _initial_snapshot = join
            .receiver
            .recv()
            .await
            .expect("join snapshot should send");
        let updated = join
            .receiver
            .recv()
            .await
            .expect("cosmetic snapshot should send");
        let updated = if matches!(updated, CafeServerMessage::ChatEvent { .. }) {
            join.receiver
                .recv()
                .await
                .expect("cosmetic snapshot should follow presence")
        } else {
            updated
        };
        let CafeServerMessage::Snapshot { room } = updated else {
            panic!("expected a room snapshot");
        };
        assert_eq!(
            room.players[0].equipped_cosmetic.as_deref(),
            Some("sakura_pin")
        );
    }

    #[tokio::test]
    async fn tea_activity_enters_intermission_and_starts_a_fresh_round() {
        let hub = CafeHub::default();
        let room = hub.create_room(false).await;
        let session = guest();
        let aiko = cafe_map_interaction_target("aiko");
        hub.join(room.id, new_player(&session, "Guest TEA".to_owned(), None))
            .await
            .expect("player should join");

        {
            let mut rooms = hub.rooms.lock().await;
            let room = rooms.get_mut(&room.id).expect("room should exist");
            let player = room
                .players
                .get_mut(&session.id)
                .expect("player should exist");
            player.x = aiko.x;
            player.y = aiko.y + 80.0;
            player.carried_tea = 3;
        }
        let completion = hub.interact(room.id, session.id, "aiko").await;
        assert_eq!(completion.awarded_owners.len(), 1);
        assert_eq!(completion.completed_round, Some(1));

        let late_session = guest();
        let late_join = hub
            .join(
                room.id,
                new_player(&late_session, "Guest LATE".to_owned(), None),
            )
            .await
            .expect("late player should join during intermission");
        assert_eq!(late_join.snapshot.activity.round_number, 1);
        assert_eq!(
            late_join.snapshot.activity.phase,
            CafeActivityPhase::Intermission
        );

        let duplicate = hub.interact(room.id, session.id, "aiko").await;
        assert!(duplicate.awarded_owners.is_empty());
        assert_eq!(duplicate.completed_round, None);

        assert!(hub.start_next_round(room.id, 1).await);
        assert!(!hub.start_next_round(room.id, 1).await);
        let rooms = hub.rooms.lock().await;
        let next_activity = &rooms.get(&room.id).expect("room should exist").activity;
        assert_eq!(next_activity.round_number, 2);
        assert_eq!(next_activity.id, CafeActivityId::TableService);
        assert_eq!(next_activity.phase, CafeActivityPhase::Active);
        assert!(!next_activity.completed);
        assert_eq!(next_activity.delivered, 0);
        assert!(next_activity.next_round_at.is_none());
        assert!(next_activity
            .table_orders
            .iter()
            .all(|order| order.status == CafeTableOrderStatus::Available
                && order.id.starts_with("order-2-")));
    }

    #[tokio::test]
    async fn table_service_claims_matches_releases_and_completes_orders() {
        let hub = CafeHub::default();
        let room = hub.create_room(false).await;
        let first = guest();
        let second = guest();
        let aiko = cafe_map_interaction_target("aiko");
        hub.join(room.id, new_player(&first, "Guest SERVER".to_owned(), None))
            .await
            .expect("first player should join");
        hub.join(
            room.id,
            new_player(&second, "Guest HELPER".to_owned(), None),
        )
        .await
        .expect("second player should join");
        {
            let mut rooms = hub.rooms.lock().await;
            let room = rooms.get_mut(&room.id).expect("room should exist");
            room.activity = CafeActivity::table_service(2);
            for player in room.players.values_mut() {
                player.x = aiko.x;
                player.y = aiko.y + 80.0;
            }
        }

        hub.interact(room.id, first.id, SERVICE_COUNTER_TARGET_ID)
            .await;
        hub.interact(room.id, second.id, SERVICE_COUNTER_TARGET_ID)
            .await;
        let released_order_id = {
            let rooms = hub.rooms.lock().await;
            let room = rooms.get(&room.id).expect("room should exist");
            assert_eq!(
                room.activity
                    .table_orders
                    .iter()
                    .filter(|order| order.status == CafeTableOrderStatus::Claimed)
                    .count(),
                2
            );
            room.players
                .get(&second.id)
                .and_then(|player| player.carried_order_id.clone())
                .expect("second player should carry an order")
        };

        hub.leave(room.id, second.id).await;
        {
            let rooms = hub.rooms.lock().await;
            let room = rooms.get(&room.id).expect("room should remain");
            let released = room
                .activity
                .table_orders
                .iter()
                .find(|order| order.id == released_order_id)
                .expect("released order should remain");
            assert_eq!(released.status, CafeTableOrderStatus::Available);
            assert_eq!(released.claimed_by, None);
        }

        let mut completion = CafeInteractionResult::none();
        for _ in 0..3 {
            let needs_order = {
                let mut rooms = hub.rooms.lock().await;
                let cafe_room = rooms.get_mut(&room.id).expect("room should exist");
                let player = cafe_room
                    .players
                    .get_mut(&first.id)
                    .expect("first player should exist");
                if player.carried_order_id.is_none() {
                    player.x = aiko.x;
                    player.y = aiko.y + 80.0;
                    true
                } else {
                    false
                }
            };
            if needs_order {
                hub.interact(room.id, first.id, SERVICE_COUNTER_TARGET_ID)
                    .await;
            }
            let order = {
                let mut rooms = hub.rooms.lock().await;
                let cafe_room = rooms.get_mut(&room.id).expect("room should exist");
                let order_id = cafe_room
                    .players
                    .get(&first.id)
                    .and_then(|player| player.carried_order_id.clone())
                    .expect("first player should carry an order");
                let order = cafe_room
                    .activity
                    .table_orders
                    .iter()
                    .find(|order| order.id == order_id)
                    .expect("claimed order should exist")
                    .clone();
                let player = cafe_room
                    .players
                    .get_mut(&first.id)
                    .expect("first player should exist");
                player.x = order.x;
                player.y = order.y + 50.0;
                order
            };
            completion = hub.interact(room.id, first.id, &order.id).await;
        }

        assert_eq!(completion.completed_round, Some(2));
        assert_eq!(completion.awarded_owners.len(), 1);
        let duplicate = hub.interact(room.id, first.id, &released_order_id).await;
        assert_eq!(duplicate.completed_round, None);
    }

    #[tokio::test]
    async fn cafe_rush_scales_and_moves_ingredients_through_the_order_pipeline() {
        let hub = CafeHub::default();
        let room = hub.create_room(false).await;
        let first = guest();
        let second = guest();
        let counter = cafe_map_interaction_target(SERVICE_COUNTER_TARGET_ID);
        hub.join(room.id, new_player(&first, "Guest RUSH".to_owned(), None))
            .await
            .expect("first player should join");
        hub.join(
            room.id,
            new_player(&second, "Guest HELPER".to_owned(), None),
        )
        .await
        .expect("second player should join");
        let ingredient = {
            let mut rooms = hub.rooms.lock().await;
            let room = rooms.get_mut(&room.id).expect("room should exist");
            room.activity = CafeActivity::cafe_rush(3, room.players.len());
            let ingredient = room.activity.tea_leaves[0].clone();
            let player = room
                .players
                .get_mut(&first.id)
                .expect("first player should exist");
            player.x = ingredient.x;
            player.y = ingredient.y;
            ingredient
        };

        hub.interact(room.id, first.id, &ingredient.id).await;
        {
            let mut rooms = hub.rooms.lock().await;
            let player = rooms
                .get_mut(&room.id)
                .and_then(|room| room.players.get_mut(&first.id))
                .expect("first player should exist");
            player.x = counter.x;
            player.y = counter.y + 80.0;
        }
        hub.interact(room.id, first.id, SERVICE_COUNTER_TARGET_ID)
            .await;
        {
            let rooms = hub.rooms.lock().await;
            let room = rooms.get(&room.id).expect("room should exist");
            assert_eq!(room.activity.target, 4);
            assert_eq!(room.players[&first.id].carried_tea, 0);
            assert_eq!(
                room.activity.table_orders[0].status,
                CafeTableOrderStatus::Available
            );
        }

        hub.interact(room.id, first.id, SERVICE_COUNTER_TARGET_ID)
            .await;
        let order = {
            let mut rooms = hub.rooms.lock().await;
            let room = rooms.get_mut(&room.id).expect("room should exist");
            let order_id = room.players[&first.id]
                .carried_order_id
                .clone()
                .expect("prepared order should be claimed");
            let order = room
                .activity
                .table_orders
                .iter()
                .find(|order| order.id == order_id)
                .expect("claimed order should exist")
                .clone();
            let player = room
                .players
                .get_mut(&first.id)
                .expect("first player should exist");
            player.x = order.x;
            player.y = order.y + 50.0;
            order
        };
        hub.interact(room.id, first.id, &order.id).await;

        let rooms = hub.rooms.lock().await;
        let activity = &rooms.get(&room.id).expect("room should exist").activity;
        assert_eq!(activity.delivered, 1);
        assert_eq!(activity.combo, 1);
        assert_eq!(activity.best_combo, 1);
        assert!(activity.combo_expires_at.is_some());
        assert!(activity.ends_at.is_some());
    }

    #[tokio::test]
    async fn cafe_rush_disconnect_returns_work_and_timeout_unblocks_the_room() {
        let hub = CafeHub::default();
        let room = hub.create_room(false).await;
        let ingredient_holder = guest();
        let order_holder = guest();
        let observer = guest();
        for (session, name) in [
            (&ingredient_holder, "Guest LEAF"),
            (&order_holder, "Guest ORDER"),
            (&observer, "Guest WATCH"),
        ] {
            hub.join(room.id, new_player(session, name.to_owned(), None))
                .await
                .expect("player should join");
        }
        let (ingredient_id, order_id) = {
            let mut rooms = hub.rooms.lock().await;
            let room = rooms.get_mut(&room.id).expect("room should exist");
            room.activity = CafeActivity::cafe_rush(3, room.players.len());
            let ingredient_id = room.activity.tea_leaves[0].id.clone();
            room.activity.tea_leaves[0].available = false;
            let order_id = room.activity.table_orders[0].id.clone();
            room.activity.table_orders[0].status = CafeTableOrderStatus::Claimed;
            room.activity.table_orders[0].claimed_by = Some(order_holder.id);
            let ingredient_player = room
                .players
                .get_mut(&ingredient_holder.id)
                .expect("ingredient holder should exist");
            ingredient_player.carried_tea = 1;
            ingredient_player
                .carried_rush_ingredient_ids
                .push(ingredient_id.clone());
            room.players
                .get_mut(&order_holder.id)
                .expect("order holder should exist")
                .carried_order_id = Some(order_id.clone());
            (ingredient_id, order_id)
        };

        hub.leave(room.id, ingredient_holder.id).await;
        hub.leave(room.id, order_holder.id).await;
        {
            let rooms = hub.rooms.lock().await;
            let room = rooms
                .get(&room.id)
                .expect("observer should keep room alive");
            assert!(room
                .activity
                .tea_leaves
                .iter()
                .find(|ingredient| ingredient.id == ingredient_id)
                .is_some_and(|ingredient| ingredient.available));
            let order = room
                .activity
                .table_orders
                .iter()
                .find(|order| order.id == order_id)
                .expect("released order should remain");
            assert_eq!(order.status, CafeTableOrderStatus::Available);
            assert_eq!(order.claimed_by, None);
        }

        assert!(hub.expire_cafe_rush(room.id, 3).await);
        assert!(!hub.expire_cafe_rush(room.id, 3).await);
        let rooms = hub.rooms.lock().await;
        let activity = &rooms.get(&room.id).expect("room should remain").activity;
        assert_eq!(activity.phase, CafeActivityPhase::Intermission);
        assert!(!activity.completed);
        assert!(activity.ends_at.is_none());
        assert!(activity.next_round_at.is_some());
    }

    #[tokio::test]
    async fn full_rooms_are_distinct_and_empty_rooms_are_removed() {
        let hub = CafeHub::default();
        let room = hub.create_room(true).await;
        let mut sessions = Vec::new();
        for index in 0..ROOM_CAPACITY {
            let session = guest();
            hub.join(
                room.id,
                new_player(&session, format!("Guest {index:04}"), None),
            )
            .await
            .expect("room should accept players up to capacity");
            sessions.push(session);
        }

        assert!(matches!(
            hub.find_by_invite_code(&room.invite_code).await,
            Err(CafeJoinError::RoomFull)
        ));
        let extra = guest();
        assert!(matches!(
            hub.join(room.id, new_player(&extra, "Guest FULL".to_owned(), None),)
                .await,
            Err(CafeJoinError::RoomFull)
        ));

        for session in sessions {
            hub.leave(room.id, session.id).await;
        }
        assert!(!hub.contains_room(room.id).await);
        assert!(matches!(
            hub.find_by_invite_code(&room.invite_code).await,
            Err(CafeJoinError::RoomNotFound)
        ));
    }

    #[test]
    fn invite_codes_are_normalized_and_validated() {
        assert_eq!(normalize_invite_code(" ab12ef ").as_deref(), Some("AB12EF"));
        assert!(normalize_invite_code("not-a-code").is_none());
    }

    #[test]
    fn websocket_origin_must_match_a_configured_frontend() {
        let mut headers = HeaderMap::new();
        headers.insert(ORIGIN, HeaderValue::from_static("https://cafe.example.com"));
        assert!(is_allowed_websocket_origin(
            &headers,
            "http://localhost:5173, https://cafe.example.com"
        ));
        assert!(!is_allowed_websocket_origin(
            &headers,
            "http://localhost:5173"
        ));
        assert!(is_allowed_websocket_origin(&HeaderMap::new(), ""));
    }
}
