#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CafeCosmeticDefinition {
    pub id: &'static str,
    pub required_stars: u32,
}

pub const CAFE_COSMETICS: &[CafeCosmeticDefinition] = &[
    CafeCosmeticDefinition {
        id: "sakura_pin",
        required_stars: 0,
    },
    CafeCosmeticDefinition {
        id: "mint_scarf",
        required_stars: 3,
    },
    CafeCosmeticDefinition {
        id: "tea_hat",
        required_stars: 5,
    },
    CafeCosmeticDefinition {
        id: "cafe_apron",
        required_stars: 8,
    },
];

pub fn cafe_cosmetic(id: &str) -> Option<CafeCosmeticDefinition> {
    CAFE_COSMETICS
        .iter()
        .copied()
        .find(|cosmetic| cosmetic.id == id)
}

pub fn unlocked_cafe_cosmetic_ids(cafe_stars: u32) -> Vec<String> {
    CAFE_COSMETICS
        .iter()
        .filter(|cosmetic| cafe_stars >= cosmetic.required_stars)
        .map(|cosmetic| cosmetic.id.to_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unlocks_follow_server_owned_star_thresholds() {
        assert_eq!(unlocked_cafe_cosmetic_ids(0), vec!["sakura_pin"]);
        assert_eq!(
            unlocked_cafe_cosmetic_ids(3),
            vec!["sakura_pin", "mint_scarf"]
        );
        assert_eq!(
            unlocked_cafe_cosmetic_ids(5),
            vec!["sakura_pin", "mint_scarf", "tea_hat"]
        );
        assert_eq!(
            unlocked_cafe_cosmetic_ids(8),
            vec!["sakura_pin", "mint_scarf", "tea_hat", "cafe_apron"]
        );
        assert!(cafe_cosmetic("client_invented").is_none());
    }
}
