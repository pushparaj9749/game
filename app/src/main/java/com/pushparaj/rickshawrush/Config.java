package com.pushparaj.rickshawrush;

/**
 * All tunable numbers for the game live here, so balancing is a one-file job.
 *
 * World coordinates: the game is designed in a virtual 1080 x 1920 portrait
 * space and scaled to the real screen. That way gameplay speed and hitboxes
 * feel identical on a 720p and a 1440p phone.
 */
final class Config {

    private Config() {}

    // ---- Virtual design resolution (portrait) ----
    static final float DESIGN_W = 1080f;
    static final float DESIGN_H = 1920f;

    // ---- Road ----
    static final int LANES = 3;
    /** Road occupies this fraction of the screen width, centred. */
    static final float ROAD_WIDTH_RATIO = 0.86f;
    /** Width of one lane in design units. Computed at runtime. */
    static final float SHOULDER = 26f;      // grass/kerb strip inside the road edge

    // ---- Player rickshaw ----
    static final float PLAYER_W = 168f;
    static final float PLAYER_H = 250f;
    /** How far up from the bottom the player sits. */
    static final float PLAYER_Y_RATIO = 0.74f;
    /** Lane change speed, in design units per second. */
    static final float LANE_SWITCH_SPEED = 2600f;

    // ---- Speed / difficulty ramp ----
    /** Starting scroll speed, design units per second. */
    static final float START_SPEED = 900f;
    static final float MAX_SPEED = 2600f;
    /** Speed gained per second of survival. */
    static final float SPEED_RAMP = 17f;

    // ---- Spawning ----
    /** Seconds between spawn waves, shrinking as speed grows. */
    static final float SPAWN_INTERVAL_START = 1.15f;
    static final float SPAWN_INTERVAL_MIN = 0.52f;
    /** Minimum vertical gap so two waves never overlap unfairly, design units. */
    static final float MIN_WAVE_GAP = 420f;

    // ---- Pickups ----
    static final float CHAI_CHANCE = 0.16f;      // per free lane
    static final float COIN_CHANCE = 0.30f;
    static final int COIN_VALUE = 10;
    static final int CHAI_VALUE = 50;
    /** Seconds of invulnerability granted by a chai. */
    static final float SHIELD_SECONDS = 3.0f;

    // ---- Lives ----
    static final int START_LIVES = 3;
    /** Invulnerability blink after taking a hit. */
    static final float HIT_INVULN_SECONDS = 1.6f;

    // ---- Scoring ----
    /** Points per design-unit of distance travelled. */
    static final float DISTANCE_SCORE = 0.02f;

    // ---- Visual ----
    static final int TARGET_FPS = 60;
    static final float MAX_DELTA = 1f / 20f;   // clamp huge frame gaps (e.g. after a pause)

    // ---- Persistence ----
    static final String PREFS_NAME = "rickshaw_rush";
    static final String KEY_HIGH_SCORE = "high_score";
    static final String KEY_TOTAL_COINS = "total_coins";
    static final String KEY_GAMES_PLAYED = "games_played";
    static final String KEY_MUTED = "muted";
}
