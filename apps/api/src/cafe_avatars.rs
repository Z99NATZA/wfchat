#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CafeAvatarDefinition {
    pub id: &'static str,
}

pub const DEFAULT_CAFE_AVATAR_ID: &str = "boy";

pub const CAFE_AVATARS: &[CafeAvatarDefinition] = &[
    CafeAvatarDefinition { id: "boy" },
    CafeAvatarDefinition { id: "girl" },
];

pub fn cafe_avatar(id: &str) -> Option<CafeAvatarDefinition> {
    CAFE_AVATARS.iter().copied().find(|avatar| avatar.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_catalogued_avatar_ids_are_accepted() {
        assert_eq!(cafe_avatar("boy").map(|avatar| avatar.id), Some("boy"));
        assert_eq!(cafe_avatar("girl").map(|avatar| avatar.id), Some("girl"));
        assert!(cafe_avatar("client_invented").is_none());
    }
}
