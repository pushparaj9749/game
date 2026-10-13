package com.pushparaj.rickshawrush;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Shader;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The whole game: a fixed-timestep loop on its own thread, drawing to a
 * SurfaceView with Canvas.
 *
 * Design notes
 * ------------
 * - All gameplay happens in a virtual 1080x1920 space that is letterboxed onto
 *   the real screen, so speed and hitboxes feel the same on every device.
 * - There are no bitmaps and no audio files: see {@link Art} and
 *   {@link SoundEngine}. The APK stays tiny and nothing can go missing.
 * - Input is one-handed: tap the left/right half to change lane, or swipe.
 */
final class GameView extends SurfaceView implements SurfaceHolder.Callback {

    private static final String TAG = "GameView";

    // ---- Game states ----
    static final int STATE_MENU = 0;
    static final int STATE_PLAYING = 1;
    static final int STATE_PAUSED = 2;
    static final int STATE_GAMEOVER = 3;

    // ---- Entity types ----
    static final int PICK_NOTE = 0;
    static final int PICK_CHAI = 1;
    static final int OBST_CAR = 10;
    static final int OBST_BUS = 11;
    static final int OBST_TRUCK = 12;
    static final int OBST_COW = 13;
    static final int OBST_POTHOLE = 14;

    private static final int[] CAR_COLORS = {
            (int) 0xFFE23B3BL, (int) 0xFF3D7BFFL, (int) 0xFFF2F2F2L, (int) 0xFF2FBF71L,
            (int) 0xFFFF8A2BL, (int) 0xFF8E5BE8L, (int) 0xFF22C1D6L, (int) 0xFFD94FA3L
    };
    private static final int[] BUS_COLORS = {(int) 0xFFFFB300L, (int) 0xFFE23B3BL, (int) 0xFF2E7D32L, (int) 0xFF1565C0L};
    private static final int[] TRUCK_COLORS = {(int) 0xFF3B6FD9L, (int) 0xFFD9553BL, (int) 0xFF2E8B57L};

    // -----------------------------------------------------------------------
    // Pooled objects
    // -----------------------------------------------------------------------

    /** A traffic vehicle, obstacle or pickup. Pooled to keep GC quiet. */
    static final class Entity {
        int type;
        int lane;
        float x, y, w, h;
        int color;
        float relSpeed;   // multiplier on world scroll speed
        boolean alive;
        float spin;

        void set(int type, int lane, float x, float y, float w, float h, int color, float relSpeed) {
            this.type = type;
            this.lane = lane;
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            this.color = color;
            this.relSpeed = relSpeed;
            this.alive = true;
            this.spin = 0f;
        }
    }

    /** Debris/spark particle. Pooled as well. */
    static final class Particle {
        float x, y, vx, vy, size, life, maxLife, rot, spin;
        int color;
        boolean square;
        boolean alive;

        void set(float x, float y, float vx, float vy, float size, float life,
                 int color, boolean square) {
            this.x = x; this.y = y; this.vx = vx; this.vy = vy;
            this.size = size; this.life = life; this.maxLife = life;
            this.color = color; this.square = square;
            this.rot = 0f; this.spin = 0f; this.alive = true;
        }
    }

    // -----------------------------------------------------------------------
    // Fields
    // -----------------------------------------------------------------------

    private final SurfaceHolder holder;
    private final SoundEngine sound;
    private final SharedPreferences prefs;
    private final String rupee;
    private final Vibrator vibrator;

    private Thread thread;
    private volatile boolean running;

    private int state = STATE_MENU;

    // screen mapping
    private int screenW = 1080, screenH = 1920;
    private float scale = 1f, offX = 0f, offY = 0f;
    private float roadL = 75f, roadR = 1005f, laneW = 310f;

    // progress
    private long score, highScore, totalCoins, gamesPlayed;
    private int lives;
    private float speed, distance, timeAlive;
    private float shieldTime, invulnTime, spawnTimer;
    private long runNotes, runDistance;

    // player
    private int playerLane = 1;
    private float playerX;
    private float playerY;
    private float tilt;
    private float bobPhase;

    // world scroll
    private float roadOffset, sceneryOffset;

    private final List<Entity> entities = new ArrayList<>(48);
    private final List<Entity> entityPool = new ArrayList<>(48);
    private final List<Particle> particles = new ArrayList<>(256);
    private final List<Particle> particlePool = new ArrayList<>(256);

    // input
    private float downX, downY;
    private long downTime;
    private boolean touchHandled;

    // presentation
    private float shakeTime, shakeMag, gameOverCooldown, menuTime;
    private boolean roadDirty = true;
    private Shader roadShader;

    GameView(Context context) {
        super(context);
        holder = getHolder();
        holder.addCallback(this);
        setFocusable(true);
        setKeepScreenOn(true);

        Art.initTypefaces();
        sound = new SoundEngine(context);
        prefs = context.getSharedPreferences(Config.PREFS_NAME, Context.MODE_PRIVATE);
        rupee = context.getString(R.string.rupee);
        vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);

        loadPrefs();
    }

    // -----------------------------------------------------------------------
    // Surface lifecycle
    // -----------------------------------------------------------------------

    @Override
    public void surfaceCreated(SurfaceHolder h) {
        resumeGame();
    }

    @Override
    public void surfaceChanged(SurfaceHolder h, int format, int width, int height) {
        resize(width, height);
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder h) {
        pauseGame();
    }

    void resumeGame() {
        sound.start();
        if (state == STATE_PLAYING) sound.setEngineHum(true);
        running = true;
        if (thread == null || !thread.isAlive()) {
            thread = new Thread(this::loop, "RickshawRush-Render");
            thread.start();
        }
        applyFullscreen();
    }

    void pauseGame() {
        running = false;
        Thread t = thread;
        if (t != null) {
            try {
                t.join(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        thread = null;
        sound.setEngineHum(false);
        sound.stop();
    }

    private void resize(int w, int h) {
        if (w <= 0 || h <= 0) return;
        screenW = w;
        screenH = h;
        float s = Math.min(w / Config.DESIGN_W, h / Config.DESIGN_H);
        scale = s;
        offX = (w - Config.DESIGN_W * s) * 0.5f;
        offY = (h - Config.DESIGN_H * s) * 0.5f;

        float roadW = Config.DESIGN_W * Config.ROAD_WIDTH_RATIO;
        roadL = (Config.DESIGN_W - roadW) * 0.5f;
        roadR = roadL + roadW;
        laneW = roadW / Config.LANES;
        playerY = Config.DESIGN_H * Config.PLAYER_Y_RATIO;
        roadDirty = true;
    }

    private void loadPrefs() {
        highScore = prefs.getLong(Config.KEY_HIGH_SCORE, 0L);
        totalCoins = prefs.getLong(Config.KEY_TOTAL_COINS, 0L);
        gamesPlayed = prefs.getLong(Config.KEY_GAMES_PLAYED, 0L);
        boolean muted = prefs.getBoolean(Config.KEY_MUTED, false);
        sound.setMuted(muted);
    }

    /** Legacy immersive flags, OR-ed once. Inherited from android.view.View. */
    @SuppressWarnings("deprecation")
    private static final int LEGACY_IMMERSIVE =
            SYSTEM_UI_FLAG_FULLSCREEN
                    | SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;

    @SuppressWarnings("deprecation")
    private void applyFullscreen() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = getWindowInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.systemBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                } else {
                    setSystemUiVisibility(LEGACY_IMMERSIVE);
                }
            } else {
                setSystemUiVisibility(LEGACY_IMMERSIVE);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Keep the top edge free of the back-gesture zone so a swipe
                // down never swallows a lane change.
                setSystemGestureExclusionRects(Collections.singletonList(
                        new Rect(0, 0, Math.max(1, screenW), 60)));
            }
        } catch (Throwable t) {
            Log.w(TAG, "fullscreen: " + t);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyFullscreen();
    }

    // -----------------------------------------------------------------------
    // Main loop
    // -----------------------------------------------------------------------

    private void loop() {
        long last = System.nanoTime();
        while (running) {
            long now = System.nanoTime();
            float dt = (now - last) / 1_000_000_000f;
            last = now;
            if (dt > Config.MAX_DELTA) dt = Config.MAX_DELTA;
            if (dt < 0f) dt = 0f;

            menuTime += dt;

            if (state == STATE_PLAYING) {
                update(dt);
            } else if (state == STATE_GAMEOVER) {
                // The world keeps drifting behind the game-over card.
                roadOffset = (roadOffset + speed * 0.12f * dt) % 100000f;
                sceneryOffset = (sceneryOffset + speed * 0.06f * dt) % 100000f;
                updateParticles(dt);
                if (gameOverCooldown > 0f) gameOverCooldown -= dt;
            } else if (state == STATE_MENU) {
                float idle = Config.START_SPEED * 0.55f;
                roadOffset = (roadOffset + idle * dt) % 100000f;
                sceneryOffset = (sceneryOffset + idle * 0.5f * dt) % 100000f;
                updateParticles(dt);
            }

            render();

            long took = (System.nanoTime() - now) / 1_000_000L;
            long sleep = (1000L / Config.TARGET_FPS) - took;
            if (sleep > 1L) {
                try {
                    Thread.sleep(sleep);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------

    private void update(float dt) {
        timeAlive += dt;
        speed = Math.min(Config.MAX_SPEED, speed + Config.SPEED_RAMP * dt);
        distance += speed * dt;
        score += (long) (speed * dt * Config.DISTANCE_SCORE);
        runDistance = (long) (distance / 100f);

        roadOffset = (roadOffset + speed * dt) % 100000f;
        sceneryOffset = (sceneryOffset + speed * 0.5f * dt) % 100000f;

        float speedNorm = (speed - Config.START_SPEED)
                / Math.max(1f, Config.MAX_SPEED - Config.START_SPEED);
        sound.setSpeed(speedNorm);

        if (shieldTime > 0f) shieldTime -= dt;
        if (invulnTime > 0f) invulnTime -= dt;
        if (shakeTime > 0f) shakeTime -= dt;

        // Lane interpolation
        float target = laneCenter(playerLane);
        float dx = target - playerX;
        float step = Config.LANE_SWITCH_SPEED * dt;
        if (Math.abs(dx) <= step) {
            playerX = target;
            tilt = Art.lerp(tilt, 0f, Math.min(1f, dt * 14f));
        } else {
            playerX += Math.signum(dx) * step;
            tilt = Art.lerp(tilt, -Math.signum(dx) * 9f, Math.min(1f, dt * 12f));
        }
        bobPhase += dt * (7f + speedNorm * 9f);

        // Entities
        float playerCX = playerX;
        float playerCY = playerY + (float) Math.sin(bobPhase) * 5f;
        float phw = Config.PLAYER_W * 0.42f;
        float phh = Config.PLAYER_H * 0.42f;

        for (int i = entities.size() - 1; i >= 0; i--) {
            Entity e = entities.get(i);
            e.y += speed * e.relSpeed * dt;
            if (e.type == OBST_COW) {
                e.x += (float) Math.sin(timeAlive * 1.8f + e.spin) * 26f * dt;
            }
            if (e.y - e.h > Config.DESIGN_H + 140f) {
                e.alive = false;
                entities.remove(i);
                entityPool.add(e);
                continue;
            }
            if (!e.alive) {
                entities.remove(i);
                entityPool.add(e);
                continue;
            }
            if (Math.abs(e.x - playerCX) < (e.w * 0.5f + phw)
                    && Math.abs(e.y - playerCY) < (e.h * 0.5f + phh)) {
                onHit(e);
                if (!e.alive) {
                    entities.remove(i);
                    entityPool.add(e);
                }
            }
        }

        // Spawning
        spawnTimer -= dt;
        if (spawnTimer <= 0f) {
            spawnWave(speedNorm);
            float t = Art.lerp(Config.SPAWN_INTERVAL_START, Config.SPAWN_INTERVAL_MIN, speedNorm);
            spawnTimer = t * (0.88f + rand() * 0.24f);
        }

        updateParticles(dt);
    }

    private void onHit(Entity e) {
        if (e.type == PICK_NOTE) {
            e.alive = false;
            score += Config.COIN_VALUE;
            runNotes++;
            sound.play(SoundEngine.SND_COIN);
            burst(e.x, e.y, 9, Art.COL_NOTE, 300f);
            return;
        }
        if (e.type == PICK_CHAI) {
            e.alive = false;
            score += Config.CHAI_VALUE;
            shieldTime = Config.SHIELD_SECONDS;
            sound.play(SoundEngine.SND_CHAI);
            sound.play(SoundEngine.SND_SHIELD);
            burst(e.x, e.y, 16, Art.COL_SHIELD, 420f);
            return;
        }

        if (shieldTime > 0f) {
            // Chai shield eats the obstacle instead of the player.
            e.alive = false;
            score += 25L;
            sound.play(SoundEngine.SND_CRASH);
            burst(e.x, e.y, 22, e.color, 620f);
            shake(0.22f, 9f);
            return;
        }
        if (invulnTime > 0f) return;

        lives--;
        invulnTime = Config.HIT_INVULN_SECONDS;
        sound.play(SoundEngine.SND_CRASH);
        shake(0.45f, 26f);
        burst(playerX, playerY - 30f, 26, (int) 0xFFFF8A2BL, 760f);
        vibrate(65);

        if (lives <= 0) {
            gameOver();
        } else {
            // Wreck the thing we hit so we don't collide with it twice.
            e.alive = false;
            speed = Math.max(Config.START_SPEED, speed * 0.74f);
        }
    }

    private void gameOver() {
        state = STATE_GAMEOVER;
        gameOverCooldown = 0.75f;
        lives = 0;
        sound.setEngineHum(false);
        sound.play(SoundEngine.SND_GAMEOVER);
        vibrate(140);

        boolean best = score > highScore;
        if (best) highScore = score;
        gamesPlayed++;

        SharedPreferences.Editor ed = prefs.edit();
        ed.putLong(Config.KEY_HIGH_SCORE, highScore);
        ed.putLong(Config.KEY_TOTAL_COINS, totalCoins + runNotes);
        ed.putLong(Config.KEY_GAMES_PLAYED, gamesPlayed);
        ed.apply();
        totalCoins += runNotes;
    }

    private void spawnWave(float speedNorm) {
        int blockCount = (speedNorm > 0.35f && rand() < 0.28f + speedNorm * 0.25f) ? 2 : 1;
        boolean[] blocked = new boolean[Config.LANES];
        for (int i = 0; i < blockCount; i++) {
            int lane = (int) (rand() * Config.LANES);
            int guard = 0;
            while (blocked[lane] && guard++ < 8) lane = (int) (rand() * Config.LANES);
            blocked[lane] = true;
        }
        // Always leave at least one lane open.
        boolean anyOpen = false;
        for (boolean b : blocked) if (!b) { anyOpen = true; break; }
        if (!anyOpen) blocked[(int) (rand() * Config.LANES)] = false;

        float spawnY = -320f;

        for (int lane = 0; lane < Config.LANES; lane++) {
            float x = laneCenter(lane);
            if (blocked[lane]) {
                Entity probe = findInLane(lane, spawnY, 540f);
                if (probe != null) continue;
                entities.add(newObstacle(lane, x, spawnY - rand() * 130f, speedNorm));
            } else {
                float r = rand();
                if (r < Config.CHAI_CHANCE && shieldTime <= 0f) {
                    entities.add(newPickup(PICK_CHAI, lane, x, spawnY - rand() * 90f));
                } else if (r < Config.CHAI_CHANCE + Config.COIN_CHANCE) {
                    entities.add(newPickup(PICK_NOTE, lane, x, spawnY - rand() * 90f));
                }
            }
        }
    }

    private Entity newObstacle(int lane, float x, float y, float speedNorm) {
        float r = rand();
        int type;
        float w;
        float h;
        int color;
        float rel;

        if (r < 0.07f) {
            type = OBST_COW;
            w = 150f; h = 168f;
            color = (int) 0xFFF2E7D5L;
            rel = 0.92f;
        } else if (r < 0.16f) {
            type = OBST_POTHOLE;
            w = 132f; h = 96f;
            color = (int) 0xFF22252BL;
            rel = 1.0f;
        } else if (r < 0.30f) {
            type = OBST_BUS;
            w = 196f; h = 440f;
            color = BUS_COLORS[(int) (rand() * BUS_COLORS.length)];
            rel = 0.90f;
        } else if (r < 0.44f) {
            type = OBST_TRUCK;
            w = 190f; h = 384f;
            color = TRUCK_COLORS[(int) (rand() * TRUCK_COLORS.length)];
            rel = 0.94f;
        } else {
            type = OBST_CAR;
            w = 168f; h = 274f;
            color = CAR_COLORS[(int) (rand() * CAR_COLORS.length)];
            rel = 0.97f;
        }

        // Wrong-way traffic arrives faster as the run heats up.
        if (rand() < 0.16f + speedNorm * 0.34f) {
            rel += 0.32f;
        }

        Entity e = obtainEntity();
        e.set(type, lane, x, y, w, h, color, rel);
        e.spin = rand() * 6.28f;
        return e;
    }

    private Entity newPickup(int type, int lane, float x, float y) {
        Entity e = obtainEntity();
        if (type == PICK_CHAI) {
            e.set(type, lane, x, y, 118f, 118f, Art.COL_SHIELD, 1.0f);
        } else {
            e.set(type, lane, x, y, 94f, 130f, Art.COL_NOTE, 1.0f);
        }
        return e;
    }

    private Entity findInLane(int lane, float y, float gap) {
        for (int i = 0; i < entities.size(); i++) {
            Entity e = entities.get(i);
            if (e.lane == lane && Math.abs(e.y - y) < gap) return e;
        }
        return null;
    }

    private Entity obtainEntity() {
        int n = entityPool.size();
        return n > 0 ? entityPool.remove(n - 1) : new Entity();
    }

    private Particle obtainParticle() {
        int n = particlePool.size();
        return n > 0 ? particlePool.remove(n - 1) : new Particle();
    }

    private void updateParticles(float dt) {
        for (int i = particles.size() - 1; i >= 0; i--) {
            Particle p = particles.get(i);
            p.life -= dt;
            if (p.life <= 0f) {
                p.alive = false;
                particles.remove(i);
                particlePool.add(p);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 320f * dt;              // gravity
            p.vx *= (1f - 1.6f * dt);       // drag
            p.rot += p.spin * dt;
        }
    }

    private void burst(float x, float y, int count, int color, float spd) {
        for (int i = 0; i < count; i++) {
            Particle p = obtainParticle();
            float a = rand() * 6.2831853f;
            float v = spd * (0.35f + rand() * 0.9f);
            p.set(x, y, (float) Math.cos(a) * v, (float) Math.sin(a) * v - 90f,
                    8f + rand() * 16f, 0.45f + rand() * 0.55f,
                    Art.mix(color, (int) 0xFFFFFFFFL, rand() * 0.35f), rand() < 0.5f);
            p.spin = (rand() - 0.5f) * 12f;
            particles.add(p);
        }
        if (particles.size() > 320) {
            int over = particles.size() - 320;
            for (int i = 0; i < over; i++) {
                Particle p = particles.remove(0);
                p.alive = false;
                particlePool.add(p);
            }
        }
    }

    private void shake(float t, float mag) {
        shakeTime = t;
        shakeMag = mag;
    }

    private void vibrate(int ms) {
        performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        try {
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(
                            ms, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(ms);
                }
            }
        } catch (Throwable ignored) {
            // vibration is a nicety, never a failure reason
        }
    }

    private float laneCenter(int lane) {
        return roadL + laneW * (lane + 0.5f);
    }

    private float rand() {
        return (float) Math.random();
    }

    // -----------------------------------------------------------------------
    // Input
    // -----------------------------------------------------------------------

    @Override
    public boolean onTouchEvent(MotionEvent ev) {
        int action = ev.getActionMasked();
        float x = (ev.getX() - offX) / scale;
        float y = (ev.getY() - offY) / scale;

        if (action == MotionEvent.ACTION_DOWN) {
            downX = x; downY = y;
            downTime = ev.getEventTime();
            touchHandled = false;
            return true;
        }

        if (action == MotionEvent.ACTION_UP) {
            float dx = x - downX;
            float dy = y - downY;
            long held = ev.getEventTime() - downTime;
            boolean isSwipe = Math.abs(dx) > 55f && Math.abs(dx) > Math.abs(dy) * 1.15f;

            switch (state) {
                case STATE_MENU:
                    handleMenuUp(x, y);
                    break;
                case STATE_PLAYING:
                    if (isSwipe) {
                        moveLane(dx > 0f ? 1 : -1);
                        touchHandled = true;
                    } else if (held < 260 && Math.abs(dx) < 34f && Math.abs(dy) < 34f) {
                        if (isInsidePause(x, y)) {
                            setPaused(true);
                        } else if (isInsideSound(x, y)) {
                            toggleMute();
                        } else {
                            moveLane(x < Config.DESIGN_W * 0.5f ? -1 : 1);
                        }
                        touchHandled = true;
                    }
                    break;
                case STATE_PAUSED:
                    handlePausedUp(x, y);
                    break;
                case STATE_GAMEOVER:
                    if (gameOverCooldown <= 0f) startGame();
                    break;
                default:
                    break;
            }
            return true;
        }
        return true;
    }

    private void handleMenuUp(float x, float y) {
        if (isInsideSound(x, y)) {
            toggleMute();
            return;
        }
        startGame();
    }

    private void handlePausedUp(float x, float y) {
        if (isInsideSound(x, y)) {
            toggleMute();
            return;
        }
        if (isInsidePause(x, y)) {
            setPaused(false);
            return;
        }
        // "RESUME" card in the middle of the screen.
        float cx = Config.DESIGN_W * 0.5f;
        float cy = Config.DESIGN_H * 0.50f;
        if (Math.abs(x - cx) < 220f && Math.abs(y - cy) < 70f) {
            setPaused(false);
        }
    }

    private boolean isInsidePause(float x, float y) {
        float cx = Config.DESIGN_W - 88f;
        float cy = 214f;
        return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= 72f * 72f;
    }

    private boolean isInsideSound(float x, float y) {
        float cx = Config.DESIGN_W - 88f;
        float cy = 96f;
        return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= 72f * 72f;
    }

    private void toggleMute() {
        boolean m = !sound.isMuted();
        sound.setMuted(m);
        prefs.edit().putBoolean(Config.KEY_MUTED, m).apply();
        if (!m) sound.play(SoundEngine.SND_TAP);
    }

    private void moveLane(int dir) {
        int target = playerLane + dir;
        if (target < 0 || target >= Config.LANES) {
            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            return;
        }
        playerLane = target;
        sound.play(SoundEngine.SND_LANE);
        performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
    }

    private void setPaused(boolean paused) {
        if (paused) {
            if (state != STATE_PLAYING) return;
            state = STATE_PAUSED;
            sound.setEngineHum(false);
            sound.play(SoundEngine.SND_TAP);
        } else {
            if (state != STATE_PAUSED) return;
            state = STATE_PLAYING;
            sound.setEngineHum(true);
            sound.play(SoundEngine.SND_TAP);
        }
    }

    private void startGame() {
        for (int i = entities.size() - 1; i >= 0; i--) {
            Entity e = entities.remove(i);
            e.alive = false;
            entityPool.add(e);
        }
        for (int i = particles.size() - 1; i >= 0; i--) {
            Particle p = particles.remove(i);
            p.alive = false;
            particlePool.add(p);
        }

        score = 0L;
        runNotes = 0L;
        runDistance = 0L;
        distance = 0f;
        timeAlive = 0f;
        lives = Config.START_LIVES;
        speed = Config.START_SPEED;
        shieldTime = 0f;
        invulnTime = 0f;
        spawnTimer = 0.55f;
        playerLane = 1;
        playerX = laneCenter(1);
        tilt = 0f;
        bobPhase = 0f;
        shakeTime = 0f;
        roadOffset = 0f;
        sceneryOffset = 0f;

        state = STATE_PLAYING;
        sound.setEngineHum(true);
        sound.play(SoundEngine.SND_TAP);
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    private void render() {
        Canvas c = null;
        try {
            c = holder.lockCanvas();
        } catch (Throwable t) {
            return;
        }
        if (c == null) return;
        try {
            drawFrame(c);
        } catch (Throwable t) {
            Log.e(TAG, "draw failed", t);
        } finally {
            try {
                holder.unlockCanvasAndPost(c);
            } catch (Throwable ignored) {
                // surface went away mid-frame; nothing to do
            }
        }
    }

    /**
     * Paints one frame. Named drawFrame rather than draw because
     * View.draw(Canvas) is public - a private method of that name would be an
     * override with weaker access privileges, which javac rejects.
     */
    private void drawFrame(Canvas c) {
        float dw = Config.DESIGN_W;
        float dh = Config.DESIGN_H;

        c.drawColor(Art.COL_BG);

        if (roadDirty || roadShader == null) {
            roadShader = Art.makeRoadShader(roadL, roadR);
            roadDirty = false;
        }

        c.save();
        c.translate(offX, offY);
        c.scale(scale, scale);

        if (shakeTime > 0f) {
            float m = shakeMag * (shakeTime / 0.45f);
            c.translate((rand() - 0.5f) * m, (rand() - 0.5f) * m);
        }

        Art.drawBackground(c, roadL, roadR, dh, sceneryOffset);
        Art.drawRoad(c, roadL, roadR, dh, roadOffset, roadShader);

        for (int i = 0; i < entities.size(); i++) {
            Entity e = entities.get(i);
            if (e.type == PICK_NOTE) {
                Art.drawNote(c, e.x, e.y, e.w, e.h, rupee, menuTime);
            } else if (e.type == PICK_CHAI) {
                Art.drawChai(c, e.x, e.y, e.w * 0.5f, menuTime, shieldTime > 0f);
            } else {
                Art.drawObstacle(c, e.type, e.x, e.y, e.w, e.h, e.color, menuTime);
            }
        }

        Art.drawParticles(c, particles);

        Art.drawRickshaw(c, playerX, playerY + (float) Math.sin(bobPhase) * 5f,
                Config.PLAYER_W, Config.PLAYER_H, tilt,
                invulnTime > 0f, menuTime, shieldTime > 0f);

        switch (state) {
            case STATE_PLAYING: drawHud(c, dw, dh); break;
            case STATE_PAUSED: drawHud(c, dw, dh); drawPauseScreen(c, dw, dh); break;
            case STATE_MENU: drawMenu(c, dw, dh); break;
            case STATE_GAMEOVER: drawHud(c, dw, dh); drawGameOver(c, dw, dh); break;
            default: break;
        }

        c.restore();

        // Letterbox bars, drawn in real screen space.
        if (offY > 0.5f) {
            c.drawRect(0, 0, screenW, offY, letterPaint());
            c.drawRect(0, screenH - offY, screenW, screenH, letterPaint());
        }
        if (offX > 0.5f) {
            c.drawRect(0, 0, offX, screenH, letterPaint());
            c.drawRect(screenW - offX, 0, screenW, screenH, letterPaint());
        }
    }

    private Paint letterPaint() {
        if (letters == null) {
            letters = new Paint();
            letters.setColor(Art.COL_BG);
            letters.setStyle(Paint.Style.FILL);
        }
        return letters;
    }

    private Paint letters;

    private void drawHud(Canvas c, float dw, float dh) {
        float top = 62f;

        Art.drawTextLeft(c, "SCORE", 52f, top, 30f, Art.COL_TEXT_DIM);
        Art.drawTextLeft(c, String.valueOf(score), 52f, top + 56f, 62f, Art.COL_TEXT);

        for (int i = 0; i < Config.START_LIVES; i++) {
            Art.drawHeart(c, 74f + i * 56f, top + 118f, 22f, i < lives);
        }

        Art.drawTextRight(c, "BEST " + highScore, dw - 52f, top, 30f, Art.COL_TEXT_DIM);

        String spd = String.valueOf((int) (speed / 26f)) + " km/h";
        Art.drawTextRight(c, spd, dw - 52f, top + 52f, 34f, Art.COL_ACCENT);

        if (shieldTime > 0f) {
            float w = 250f;
            float frac = Math.max(0f, shieldTime / Config.SHIELD_SECONDS);
            Art.roundRect(c, dw * 0.5f, top + 18f, w, 26f, 13f, 0x33000000);
            Art.roundRect(c, dw * 0.5f - (w - w * frac) * 0.5f, top + 18f,
                    w * frac, 26f, 13f, Art.COL_SHIELD);
            Art.drawText(c, "CHAI SHIELD", dw * 0.5f, top + 66f, 26f, Art.COL_SHIELD, 1f, false);
        }

        Art.drawSoundButton(c, dw - 88f, 96f, 40f, sound.isMuted());
        if (state == STATE_PLAYING || state == STATE_PAUSED) {
            Art.drawPauseButton(c, dw - 88f, 214f, 40f);
        }
    }

    private void drawMenu(Canvas c, float dw, float dh) {
        Art.dim(c, dw, dh, (int) 0xB005070CL);

        float t = menuTime;
        float cx = dw * 0.5f;

        Art.drawText(c, "RICKSHAW", cx, dh * 0.185f, 104f, Art.COL_LINE_YELLOW, 1f, true);
        Art.drawText(c, "RUSH", cx, dh * 0.255f, 140f, Art.COL_TEXT, 1f, true);
        Art.drawText(c, "bhaago, bachao, jeeto", cx, dh * 0.300f, 34f, Art.COL_ACCENT, 1f, false);

        float pulse = 0.5f + 0.5f * (float) Math.sin(t * 3.2);
        Art.roundRect(c, cx, dh * 0.505f, 470f, 132f, 66f,
                Art.mix(Art.COL_ACCENT, (int) 0xFF00B37EL, 0.35f + 0.3f * pulse));
        Art.drawText(c, "TAP TO START", cx, dh * 0.505f, 50f, (int) 0xFF06231AL, 1f, false);

        Art.drawText(c, "Tap left / right  -  ya swipe karo", cx, dh * 0.605f, 32f,
                Art.COL_TEXT_DIM, 1f, false);
        Art.drawText(c, "Chai = shield,  note = points", cx, dh * 0.645f, 32f,
                Art.COL_TEXT_DIM, 1f, false);

        Art.drawText(c, "HIGH SCORE", cx, dh * 0.735f, 28f, Art.COL_TEXT_DIM, 1f, false);
        Art.drawText(c, String.valueOf(highScore), cx, dh * 0.775f, 60f, Art.COL_TEXT, 1f, false);
        Art.drawText(c, "runs: " + gamesPlayed + "     notes: " + totalCoins,
                cx, dh * 0.815f, 26f, Art.COL_TEXT_DIM, 1f, false);

        Art.drawSoundButton(c, dw - 88f, 96f, 40f, sound.isMuted());
    }

    private void drawPauseScreen(Canvas c, float dw, float dh) {
        Art.dim(c, dw, dh, (int) 0xC4000000L);
        float cx = dw * 0.5f;
        Art.drawText(c, "PAUSED", cx, dh * 0.34f, 96f, Art.COL_TEXT, 1f, false);

        Art.roundRect(c, cx, dh * 0.50f, 440f, 130f, 65f, Art.COL_ACCENT);
        Art.drawText(c, "RESUME", cx, dh * 0.50f, 50f, (int) 0xFF06231AL, 1f, false);

        Art.roundRect(c, cx, dh * 0.605f, 440f, 120f, 60f, 0x22FFFFFF);
        Art.roundRectStroke(c, cx, dh * 0.605f, 440f, 120f, 60f, Art.COL_TEXT_DIM, 3f);
        Art.drawText(c, "QUIT TO MENU", cx, dh * 0.605f, 42f, Art.COL_TEXT, 1f, false);

        Art.drawSoundButton(c, dw - 88f, 96f, 40f, sound.isMuted());
    }

    private void drawGameOver(Canvas c, float dw, float dh) {
        Art.dim(c, dw, dh, (int) 0xD2000000L);
        float cx = dw * 0.5f;

        Art.drawText(c, "GAME OVER", cx, dh * 0.245f, 92f, Art.COL_DANGER, 1f, true);

        boolean best = score > 0 && score >= highScore;
        if (best) {
            float pulse = 0.5f + 0.5f * (float) Math.sin(menuTime * 6f);
            Art.roundRect(c, cx, dh * 0.315f, 320f, 62f, 31f,
                    Art.mix(Art.COL_LINE_YELLOW, (int) 0xFFFF8A2BL, pulse * 0.5f));
            Art.drawText(c, "NEW BEST!", cx, dh * 0.315f, 34f, (int) 0xFF241703L, 1f, false);
        }

        Art.drawText(c, "SCORE", cx, dh * 0.40f, 32f, Art.COL_TEXT_DIM, 1f, false);
        Art.drawText(c, String.valueOf(score), cx, dh * 0.455f, 104f, Art.COL_TEXT, 1f, false);

        Art.drawText(c, "BEST " + highScore, cx, dh * 0.52f, 34f, Art.COL_LINE_YELLOW, 1f, false);

        float rowY = dh * 0.60f;
        Art.drawText(c, "distance   " + runDistance + " m", cx, rowY, 32f, Art.COL_TEXT_DIM, 1f, false);
        Art.drawText(c, "notes      " + runNotes, cx, rowY + 46f, 32f, Art.COL_TEXT_DIM, 1f, false);
        Art.drawText(c, "top speed  " + (int) (speed / 26f) + " km/h",
                cx, rowY + 92f, 32f, Art.COL_TEXT_DIM, 1f, false);

        if (gameOverCooldown <= 0f) {
            float pulse = 0.5f + 0.5f * (float) Math.sin(menuTime * 3.4);
            Art.roundRect(c, cx, dh * 0.845f, 470f, 128f, 64f,
                    Art.mix(Art.COL_ACCENT, (int) 0xFF00B37EL, 0.3f + 0.35f * pulse));
            Art.drawText(c, "TAP TO PLAY AGAIN", cx, dh * 0.845f, 44f, (int) 0xFF06231AL, 1f, false);
        }
    }
}
