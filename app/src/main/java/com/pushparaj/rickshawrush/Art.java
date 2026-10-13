package com.pushparaj.rickshawrush;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.util.List;

/**
 * All artwork in Rickshaw Rush is drawn procedurally with Canvas primitives.
 *
 * Why: no PNGs means no density buckets, no scaling blur, a ~200 KB APK, and
 * every colour is one constant away from being re-themed.
 *
 * Everything is drawn in a virtual 1080x1920 design space; the caller
 * (GameView) applies the scale/translate before calling in here.
 */
final class Art {

    private Art() {}

    // ---- Shared paints (reused every frame - never allocate while drawing) ----
    private static final Paint FILL = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint STROKE = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint TEXT = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final RectF R = new RectF();
    private static final Path P = new Path();
    private static final float[] RADII8 = new float[8];

    // ---- Palette ----
    static final int COL_GRASS_DARK = 0xFF14331FL;
    static final int COL_GRASS = 0xFF1D4A2CL;
    static final int COL_ASPHALT_TOP = 0xFF2C3038L;
    static final int COL_ASPHALT_BOT = 0xFF3A3F49L;
    static final int COL_LINE_WHITE = 0xFFEDEFF2L;
    static final int COL_LINE_YELLOW = 0xFFFFC400L;
    static final int COL_BG = 0xFF10131AL;

    static final int COL_RICKSHAW_BODY = 0xFFE8C21AL;
    static final int COL_RICKSHAW_BODY_DARK = 0xFFB99400L;
    static final int COL_RICKSHAW_ROOF = 0xFF1E6B3CL;
    static final int COL_RICKSHAW_ROOF_DARK = 0xFF14502CL;

    static final int COL_TEXT = 0xFFFFFFFFL;
    static final int COL_TEXT_DIM = 0xB3FFFFFFL;
    static final int COL_ACCENT = 0xFF00E5A0L;
    static final int COL_DANGER = 0xFFFF4D5EL;
    static final int COL_NOTE = 0xFF3FA65CL;
    static final int COL_NOTE_DARK = 0xFF2C7A42L;
    static final int COL_SHIELD = 0xFF5AD2FFL;

    static void initTypefaces() {
        TEXT.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static void rr(Canvas c, float cx, float cy, float w, float h, float rad, int color) {
        float hw = w * 0.5f, hh = h * 0.5f;
        R.set(cx - hw, cy - hh, cx + hw, cy + hh);
        FILL.setShader(null);
        FILL.setColor(color);
        FILL.setStyle(Paint.Style.FILL);
        c.drawRoundRect(R, rad, rad, FILL);
    }

    private static void rrStroke(Canvas c, float cx, float cy, float w, float h,
                                 float rad, int color, float width) {
        float hw = w * 0.5f, hh = h * 0.5f;
        R.set(cx - hw, cy - hh, cx + hw, cy + hh);
        STROKE.setColor(color);
        STROKE.setStyle(Paint.Style.STROKE);
        STROKE.setStrokeWidth(width);
        c.drawRoundRect(R, rad, rad, STROKE);
    }

    /** Inflate the shared RectF as an oval centred on (cx, cy). */
    private static RectF oval(float cx, float cy, float w, float h) {
        float hw = w * 0.5f, hh = h * 0.5f;
        R.set(cx - hw, cy - hh, cx + hw, cy + hh);
        return R;
    }

    private static void circ(Canvas c, float cx, float cy, float r, int color) {
        FILL.setShader(null);
        FILL.setColor(color);
        FILL.setStyle(Paint.Style.FILL);
        c.drawCircle(cx, cy, r, FILL);
    }

    private static void circStroke(Canvas c, float cx, float cy, float r, int color, float w) {
        STROKE.setColor(color);
        STROKE.setStyle(Paint.Style.STROKE);
        STROKE.setStrokeWidth(w);
        c.drawCircle(cx, cy, r, STROKE);
    }

    /** HSV -> ARGB without allocating a float[] every call. */
    static int hsv(float h, float s, float v, int alpha) {
        h = ((h % 360f) + 360f) % 360f;
        if (s < 0f) s = 0f; else if (s > 1f) s = 1f;
        if (v < 0f) v = 0f; else if (v > 1f) v = 1f;
        float c = v * s;
        float hp = h / 60f;
        float x = c * (1f - Math.abs((hp % 2f) - 1f));
        float r = 0f, g = 0f, b = 0f;
        if (hp < 1f) { r = c; g = x; }
        else if (hp < 2f) { r = x; g = c; }
        else if (hp < 3f) { g = c; b = x; }
        else if (hp < 4f) { g = x; b = c; }
        else if (hp < 5f) { r = x; b = c; }
        else { r = c; b = x; }
        float m = v - c;
        return (alpha << 24)
                | (clampByte((r + m) * 255f) << 16)
                | (clampByte((g + m) * 255f) << 8)
                | clampByte((b + m) * 255f);
    }

    private static int clampByte(float f) {
        int i = (int) (f + 0.5f);
        return i < 0 ? 0 : (i > 255 ? 255 : i);
    }

    static int mix(int a, int b, float t) {
        if (t < 0f) t = 0f; else if (t > 1f) t = 1f;
        int aa = (a >>> 24) & 0xff, ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
        int ba = (b >>> 24) & 0xff, br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
        return (((int) (aa + (ba - aa) * t)) << 24)
                | (((int) (ar + (br - ar) * t)) << 16)
                | (((int) (ag + (bg - ag) * t)) << 8)
                | ((int) (ab + (bb - ab) * t));
    }

    static float lerp(float a, float b, float t) {
        return a + (b - a) * t;
    }

    /** Deterministic pseudo-random in 0..1 from an integer seed. */
    static float hash01(int seed) {
        int x = seed * 1103515245 + 12345;
        x ^= (x >>> 15);
        x *= 2246822519;
        x ^= (x >>> 13);
        return ((x & 0x7fffffff) % 10000) / 10000f;
    }

    // -----------------------------------------------------------------------
    // Background: grass, roadside buildings, trees
    // -----------------------------------------------------------------------

    static void drawBackground(Canvas c, float roadL, float roadR, float designH,
                               float sceneryOffset) {
        // Grass
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(COL_GRASS_DARK);
        c.drawRect(0, 0, roadL, designH, FILL);
        c.drawRect(roadR, 0, Config.DESIGN_W, designH, FILL);

        // Grass texture stripes (slow parallax)
        FILL.setColor(COL_GRASS);
        float stripeH = 90f;
        float period = stripeH * 2f;
        float off = sceneryOffset % period;
        for (float y = -period + off; y < designH + period; y += period) {
            c.drawRect(0, y, roadL - 6f, y + stripeH, FILL);
            c.drawRect(roadR + 6f, y, Config.DESIGN_W, y + stripeH, FILL);
        }

        // Roadside buildings (medium parallax), only in the grass strips.
        float slot = 300f;
        int base = (int) Math.floor((sceneryOffset * 1.35f) / slot);
        for (int i = base - 1; i <= base + (int) (designH / slot) + 2; i++) {
            float top = i * slot - sceneryOffset * 1.35f;
            if (top > designH + slot || top + slot < -slot) continue;
            float h0 = hash01(i * 7 + 1);
            float h1 = hash01(i * 13 + 5);
            drawBuilding(c, roadL * 0.5f, top, roadL * 0.80f, slot * 0.86f, h0);
            drawBuilding(c, roadR + (Config.DESIGN_W - roadR) * 0.5f, top + slot * 0.35f,
                    (Config.DESIGN_W - roadR) * 0.80f, slot * 0.86f, h1);
        }
    }

    private static void drawBuilding(Canvas c, float cx, float cy, float w, float h, float seed) {
        int tone = (int) (seed * 3f);
        int col = tone == 0 ? 0xFF2A3550L : (tone == 1 ? 0xFF3A2C4EL : 0xFF25403CL);
        rr(c, cx, cy + h * 0.5f, w, h, 10f, col);
        // Roof highlight
        rr(c, cx, cy + h * 0.5f - h * 0.06f, w * 0.86f, h * 0.10f, 6f,
                mix(col, Color.WHITE, 0.16f));
        // Windows, lit deterministically
        float cols = 3f, rows = 4f;
        float gx = w * 0.72f / cols, gy = h * 0.66f / rows;
        float x0 = cx - w * 0.36f + gx * 0.5f, y0 = cy + h * 0.30f;
        for (int r = 0; r < rows; r++) {
            for (int q = 0; q < cols; q++) {
                float s = hash01((int) (seed * 977f) + r * 31 + q * 7);
                int win = s > 0.55f ? 0xFFFFD27AL : 0xFF1A2233L;
                rr(c, x0 + q * gx, y0 + r * gy, gx * 0.56f, gy * 0.50f, 2f, win);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Road
    // -----------------------------------------------------------------------

    static void drawRoad(Canvas c, float roadL, float roadR, float designH, float roadOffset,
                         Shader roadShader) {
        float w = roadR - roadL;

        // Kerb
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(0xFF5C616BL);
        c.drawRect(roadL - 14f, 0, roadL, designH, FILL);
        c.drawRect(roadR, 0, roadR + 14f, designH, FILL);
        FILL.setColor(0xFF8A8F99L);
        c.drawRect(roadL - 14f, 0, roadL - 8f, designH, FILL);
        c.drawRect(roadR + 8f, 0, roadR + 14f, designH, FILL);

        // Asphalt
        FILL.setColor(COL_ASPHALT_BOT);
        if (roadShader != null) {
            FILL.setShader(roadShader);
        }
        c.drawRect(roadL, 0, roadR, designH, FILL);
        FILL.setShader(null);

        // Asphalt speckle for texture
        FILL.setColor(0x14FFFFFF);
        float speck = 64f;
        int base = (int) Math.floor(roadOffset / speck);
        for (int i = base - 1; i <= base + (int) (designH / speck) + 2; i++) {
            float y = i * speck - roadOffset;
            for (int q = 0; q < 3; q++) {
                float hx = hash01(i * 17 + q * 3);
                float hy = hash01(i * 29 + q * 11);
                float x = roadL + hx * w;
                c.drawRect(x, y + hy * speck, x + 3f + hx * 5f, y + hy * speck + 2.5f, FILL);
            }
        }

        // Edge lines (solid yellow)
        FILL.setColor(COL_LINE_YELLOW);
        c.drawRect(roadL + 16f, 0, roadL + 28f, designH, FILL);
        c.drawRect(roadR - 28f, 0, roadR - 16f, designH, FILL);

        // Lane dividers (dashed white), scrolling
        float laneW = w / Config.LANES;
        float dashOn = 92f, dashOff = 78f, period = dashOn + dashOff;
        float off = roadOffset % period;
        FILL.setColor(COL_LINE_WHITE);
        for (int i = 1; i < Config.LANES; i++) {
            float x = roadL + laneW * i;
            for (float y = -period + off; y < designH + period; y += period) {
                c.drawRect(x - 7f, y, x + 7f, y + dashOn, FILL);
            }
        }
    }

    static Shader makeRoadShader(float roadL, float roadR) {
        return new LinearGradient(roadL, 0, roadR, 0,
                new int[]{COL_ASPHALT_TOP, COL_ASPHALT_BOT, COL_ASPHALT_TOP},
                new float[]{0f, 0.5f, 1f}, Shader.TileMode.CLAMP);
    }

    // -----------------------------------------------------------------------
    // Player rickshaw (rear three-quarter, top-down)
    // -----------------------------------------------------------------------

    static void drawRickshaw(Canvas c, float cx, float cy, float w, float h,
                             float tilt, boolean blink, float time, boolean shielded) {
        if (blink && ((int) (time * 12f)) % 2 == 0) return;   // i-frames flicker

        c.save();
        c.translate(cx, cy);
        c.rotate(tilt);

        // Ground shadow
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(0x55000000);
        c.drawOval(oval(-w * 0.02f, h * 0.46f, w * 1.06f, h * 0.20f), FILL);

        // Wheels
        int wheelCol = 0xFF15171CL;
        rr(c, -w * 0.46f, h * 0.30f, w * 0.15f, h * 0.20f, 6f, wheelCol);
        rr(c, w * 0.46f, h * 0.30f, w * 0.15f, h * 0.20f, 6f, wheelCol);
        rr(c, 0f, -h * 0.44f, w * 0.13f, h * 0.15f, 5f, wheelCol);   // front wheel

        // Body / bonnet
        rr(c, 0f, -h * 0.18f, w * 0.66f, h * 0.40f, 16f, COL_RICKSHAW_BODY_DARK);
        rr(c, 0f, -h * 0.16f, w * 0.58f, h * 0.36f, 14f, COL_RICKSHAW_BODY);

        // Passenger cabin
        rr(c, 0f, h * 0.20f, w * 0.90f, h * 0.46f, 18f, COL_RICKSHAW_BODY_DARK);
        rr(c, 0f, h * 0.21f, w * 0.82f, h * 0.42f, 16f, COL_RICKSHAW_BODY);

        // Canopy (roof) with scalloped rear edge
        rr(c, 0f, h * 0.16f, w * 0.86f, h * 0.40f, 20f, COL_RICKSHAW_ROOF_DARK);
        rr(c, 0f, h * 0.15f, w * 0.80f, h * 0.36f, 18f, COL_RICKSHAW_ROOF);
        FILL.setColor(0xFF0E3D21L);
        float sc = w * 0.80f / 7f;
        for (int i = 0; i < 7; i++) {
            float sx = -w * 0.40f + sc * (i + 0.5f);
            c.drawCircle(sx, h * 0.33f, sc * 0.30f, FILL);
        }
        // Roof centre stripe
        rr(c, 0f, h * 0.15f, w * 0.10f, h * 0.36f, 6f, COL_LINE_YELLOW);

        // Windshield
        rr(c, 0f, -h * 0.06f, w * 0.54f, h * 0.13f, 8f, 0xFF9FD8EAL);
        rr(c, 0f, -h * 0.075f, w * 0.50f, h * 0.05f, 5f, 0xFFD6F1FAL);

        // Driver
        circ(c, 0f, -h * 0.24f, w * 0.10f, 0xFF6B4A2FL);       // head
        rr(c, 0f, -h * 0.30f, w * 0.22f, h * 0.055f, 6f, 0xFF2B2B33L);  // hair/cap
        rr(c, 0f, -h * 0.16f, w * 0.34f, h * 0.10f, 8f, 0xFF3D6FB5L);   // shoulders

        // Headlights + indicators
        circ(c, -w * 0.24f, -h * 0.36f, w * 0.055f, 0xFFFFF3B0L);
        circ(c, w * 0.24f, -h * 0.36f, w * 0.055f, 0xFFFFF3B0L);
        circ(c, -w * 0.36f, h * 0.40f, w * 0.045f, 0xFFFF4D3DL);
        circ(c, w * 0.36f, h * 0.40f, w * 0.045f, 0xFFFF4D3DL);

        // Mirrors
        STROKE.setStyle(Paint.Style.STROKE);
        STROKE.setStrokeWidth(w * 0.022f);
        STROKE.setColor(0xFF2A2D34L);
        STROKE.setStrokeCap(Paint.Cap.ROUND);
        c.drawLine(-w * 0.33f, -h * 0.28f, -w * 0.52f, -h * 0.31f, STROKE);
        c.drawLine(w * 0.33f, -h * 0.28f, w * 0.52f, -h * 0.31f, STROKE);
        circ(c, -w * 0.54f, -h * 0.315f, w * 0.038f, 0xFF9FD8EAL);
        circ(c, w * 0.54f, -h * 0.315f, w * 0.038f, 0xFF9FD8EAL);

        // Number plate
        rr(c, 0f, h * 0.44f, w * 0.30f, h * 0.055f, 4f, 0xFFF2F2F2L);
        rr(c, 0f, h * 0.44f, w * 0.26f, h * 0.028f, 2f, 0xFF333333L);

        c.restore();

        if (shielded) {
            float pulse = 1f + 0.06f * (float) Math.sin(time * 9.0);
            circStroke(c, cx, cy, w * 0.72f * pulse, COL_SHIELD, w * 0.055f);
            circStroke(c, cx, cy, w * 0.62f * pulse, 0x555AD2FF, w * 0.10f);
        }
    }

    // -----------------------------------------------------------------------
    // Traffic + obstacles
    // -----------------------------------------------------------------------

    static void drawObstacle(Canvas c, int type, float cx, float cy, float w, float h,
                             int color, float time) {
        switch (type) {
            case GameView.OBST_CAR: drawCar(c, cx, cy, w, h, color); break;
            case GameView.OBST_BUS: drawBus(c, cx, cy, w, h, color); break;
            case GameView.OBST_TRUCK: drawTruck(c, cx, cy, w, h, color); break;
            case GameView.OBST_COW: drawCow(c, cx, cy, w, h, time); break;
            case GameView.OBST_POTHOLE: drawPothole(c, cx, cy, w, h); break;
            default: rr(c, cx, cy, w, h, 12f, color); break;
        }
    }

    private static void drawCar(Canvas c, float cx, float cy, float w, float h, int color) {
        int dark = mix(color, Color.BLACK, 0.35f);
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(0x55000000);
        c.drawOval(oval(-w * 0.03f + cx, cy + h * 0.46f, w * 1.05f, h * 0.18f), FILL);

        // Wheels
        rr(c, cx - w * 0.47f, cy - h * 0.24f, w * 0.13f, h * 0.17f, 5f, 0xFF15171CL);
        rr(c, cx + w * 0.47f, cy - h * 0.24f, w * 0.13f, h * 0.17f, 5f, 0xFF15171CL);
        rr(c, cx - w * 0.47f, cy + h * 0.26f, w * 0.13f, h * 0.17f, 5f, 0xFF15171CL);
        rr(c, cx + w * 0.47f, cy + h * 0.26f, w * 0.13f, h * 0.17f, 5f, 0xFF15171CL);

        // Body
        rr(c, cx, cy, w * 0.92f, h * 0.96f, w * 0.20f, color);
        rr(c, cx, cy - h * 0.30f, w * 0.86f, h * 0.34f, w * 0.16f, dark);   // bonnet shade
        // Roof
        rr(c, cx, cy + h * 0.02f, w * 0.74f, h * 0.46f, w * 0.16f, mix(color, Color.BLACK, 0.18f));
        // Rear window
        rr(c, cx, cy + h * 0.20f, w * 0.60f, h * 0.14f, 6f, 0xFF9FD8EAL);
        // Front windshield
        rr(c, cx, cy - h * 0.16f, w * 0.62f, h * 0.13f, 6f, 0xFFBFE6F2L);
        // Tail lights
        rr(c, cx - w * 0.30f, cy + h * 0.42f, w * 0.20f, h * 0.055f, 4f, 0xFFFF3B30L);
        rr(c, cx + w * 0.30f, cy + h * 0.42f, w * 0.20f, h * 0.055f, 4f, 0xFFFF3B30L);
        // Plate
        rr(c, cx, cy + h * 0.43f, w * 0.20f, h * 0.045f, 3f, 0xFFF0F0F0L);
    }

    private static void drawBus(Canvas c, float cx, float cy, float w, float h, int color) {
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(0x55000000);
        c.drawOval(oval(cx - w * 0.03f, cy + h * 0.47f, w * 1.04f, h * 0.14f), FILL);

        rr(c, cx - w * 0.48f, cy - h * 0.30f, w * 0.14f, h * 0.13f, 5f, 0xFF15171CL);
        rr(c, cx + w * 0.48f, cy - h * 0.30f, w * 0.14f, h * 0.13f, 5f, 0xFF15171CL);
        rr(c, cx - w * 0.48f, cy + h * 0.30f, w * 0.14f, h * 0.13f, 5f, 0xFF15171CL);
        rr(c, cx + w * 0.48f, cy + h * 0.30f, w * 0.14f, h * 0.13f, 5f, 0xFF15171CL);

        rr(c, cx, cy, w * 0.94f, h * 0.98f, w * 0.14f, color);
        rr(c, cx, cy, w * 0.86f, h * 0.92f, w * 0.11f, mix(color, Color.WHITE, 0.10f));
        // Stripe
        rr(c, cx, cy + h * 0.02f, w * 0.86f, h * 0.10f, 4f, mix(color, Color.BLACK, 0.45f));
        // Window rows
        int rows = 6;
        for (int i = 0; i < rows; i++) {
            float wy = cy - h * 0.36f + (h * 0.72f / (rows - 1)) * i;
            rr(c, cx - w * 0.28f, wy, w * 0.20f, h * 0.075f, 4f, 0xFFA9DCEFL);
            rr(c, cx + w * 0.28f, wy, w * 0.20f, h * 0.075f, 4f, 0xFFA9DCEFL);
        }
        // Rear window + lights
        rr(c, cx, cy - h * 0.42f, w * 0.62f, h * 0.075f, 5f, 0xFFC7E9F6L);
        rr(c, cx - w * 0.34f, cy + h * 0.44f, w * 0.16f, h * 0.05f, 3f, 0xFFFF3B30L);
        rr(c, cx + w * 0.34f, cy + h * 0.44f, w * 0.16f, h * 0.05f, 3f, 0xFFFF3B30L);
        // Destination board
        rr(c, cx, cy + h * 0.36f, w * 0.44f, h * 0.07f, 4f, 0xFF1B1B22L);
    }

    private static void drawTruck(Canvas c, float cx, float cy, float w, float h, int color) {
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(0x55000000);
        c.drawOval(oval(cx - w * 0.03f, cy + h * 0.47f, w * 1.05f, h * 0.14f), FILL);

        // Cab
        rr(c, cx, cy - h * 0.34f, w * 0.80f, h * 0.26f, 12f, color);
        rr(c, cx, cy - h * 0.36f, w * 0.62f, h * 0.10f, 6f, 0xFFA9DCEFL);
        // Cargo box
        rr(c, cx, cy + h * 0.10f, w * 0.94f, h * 0.72f, 10f, mix(color, Color.BLACK, 0.25f));
        rr(c, cx, cy + h * 0.10f, w * 0.86f, h * 0.66f, 8f, 0xFFD8D2C4L);
        // Tarpaulin ribs
        FILL.setColor(0xFFB6AE9CL);
        for (int i = 0; i < 4; i++) {
            float ry = cy - h * 0.16f + (h * 0.56f / 3f) * i;
            c.drawRect(cx - w * 0.40f, ry, cx + w * 0.40f, ry + h * 0.025f, FILL);
        }
        // "HORN OK PLEASE" stripe
        rr(c, cx, cy + h * 0.38f, w * 0.80f, h * 0.09f, 4f, 0xFFE23B3BL);
        // Wheels + lights
        rr(c, cx - w * 0.48f, cy + h * 0.30f, w * 0.14f, h * 0.16f, 5f, 0xFF15171CL);
        rr(c, cx + w * 0.48f, cy + h * 0.30f, w * 0.14f, h * 0.16f, 5f, 0xFF15171CL);
        rr(c, cx - w * 0.32f, cy + h * 0.45f, w * 0.14f, h * 0.05f, 3f, 0xFFFF3B30L);
        rr(c, cx + w * 0.32f, cy + h * 0.45f, w * 0.14f, h * 0.05f, 3f, 0xFFFF3B30L);
    }

    private static void drawCow(Canvas c, float cx, float cy, float w, float h, float time) {
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(0x55000000);
        c.drawOval(oval(cx - w * 0.04f, cy + h * 0.44f, w * 1.05f, h * 0.16f), FILL);

        // Legs
        rr(c, cx - w * 0.28f, cy + h * 0.28f, w * 0.12f, h * 0.28f, 5f, 0xFFD9CBB4L);
        rr(c, cx + w * 0.28f, cy + h * 0.28f, w * 0.12f, h * 0.28f, 5f, 0xFFD9CBB4L);
        rr(c, cx - w * 0.28f, cy - h * 0.22f, w * 0.12f, h * 0.26f, 5f, 0xFFD9CBB4L);
        rr(c, cx + w * 0.28f, cy - h * 0.22f, w * 0.12f, h * 0.26f, 5f, 0xFFD9CBB4L);

        // Body
        rr(c, cx, cy, w * 0.72f, h * 0.86f, w * 0.30f, 0xFFF2E7D5L);
        // Patches
        circ(c, cx - w * 0.12f, cy + h * 0.10f, w * 0.13f, 0xFF6B5544L);
        circ(c, cx + w * 0.14f, cy - h * 0.18f, w * 0.10f, 0xFF6B5544L);
        // Head
        rr(c, cx, cy - h * 0.36f, w * 0.40f, h * 0.26f, 12f, 0xFFEAD9C0L);
        rr(c, cx, cy - h * 0.30f, w * 0.26f, h * 0.10f, 8f, 0xFFD9A9A0L);   // muzzle
        // Horns
        STROKE.setStyle(Paint.Style.STROKE);
        STROKE.setStrokeCap(Paint.Cap.ROUND);
        STROKE.setStrokeWidth(w * 0.055f);
        STROKE.setColor(0xFFC9BBA3L);
        c.drawLine(cx - w * 0.16f, cy - h * 0.44f, cx - w * 0.26f, cy - h * 0.52f, STROKE);
        c.drawLine(cx + w * 0.16f, cy - h * 0.44f, cx + w * 0.26f, cy - h * 0.52f, STROKE);
        // Ears + eyes
        circ(c, cx - w * 0.20f, cy - h * 0.37f, w * 0.055f, 0xFFE0CDB2L);
        circ(c, cx + w * 0.20f, cy - h * 0.37f, w * 0.055f, 0xFFE0CDB2L);
        circ(c, cx - w * 0.08f, cy - h * 0.40f, w * 0.028f, 0xFF22222AL);
        circ(c, cx + w * 0.08f, cy - h * 0.40f, w * 0.028f, 0xFF22222AL);
        // Tail swish
        float sw = (float) Math.sin(time * 5.0) * w * 0.10f;
        STROKE.setColor(0xFFE3D6C1L);
        STROKE.setStrokeWidth(w * 0.045f);
        c.drawLine(cx, cy + h * 0.42f, cx + sw, cy + h * 0.60f, STROKE);
    }

    private static void drawPothole(Canvas c, float cx, float cy, float w, float h) {
        FILL.setStyle(Paint.Style.FILL);
        // Cracked rim
        FILL.setColor(0xFF22252BL);
        P.reset();
        int pts = 11;
        for (int i = 0; i <= pts; i++) {
            float a = (float) (i / (double) pts) * (float) (Math.PI * 2.0);
            float rr2 = 0.78f + 0.24f * hash01(i * 37 + 3);
            float px = cx + (float) Math.cos(a) * w * 0.5f * rr2;
            float py = cy + (float) Math.sin(a) * h * 0.5f * rr2;
            if (i == 0) P.moveTo(px, py); else P.lineTo(px, py);
        }
        P.close();
        c.drawPath(P, FILL);
        // Water inside
        FILL.setColor(0xFF12141AL);
        c.drawOval(oval(cx, cy, w * 0.72f, h * 0.66f), FILL);
        FILL.setColor(0x335AD2FF);
        c.drawOval(oval(cx - w * 0.10f, cy - h * 0.08f, w * 0.30f, h * 0.18f), FILL);
    }

    // -----------------------------------------------------------------------
    // Pickups
    // -----------------------------------------------------------------------

    static void drawNote(Canvas c, float cx, float cy, float w, float h, String rupee, float time) {
        float bob = (float) Math.sin(time * 4.0) * h * 0.06f;
        cy += bob;
        circ(c, cx, cy, w * 0.72f, 0x223FA65C);
        rr(c, cx, cy, w, h, 6f, COL_NOTE_DARK);
        rr(c, cx, cy - h * 0.02f, w * 0.94f, h * 0.90f, 5f, COL_NOTE);
        rrStroke(c, cx, cy - h * 0.02f, w * 0.80f, h * 0.76f, 4f, 0xFFEAF7EEL, 2.5f);
        circ(c, cx, cy - h * 0.02f, h * 0.26f, 0xFFEAF7EEL);
        TEXT.setTextAlign(Paint.Align.CENTER);
        TEXT.setColor(COL_NOTE_DARK);
        TEXT.setTextSize(h * 0.42f);
        TEXT.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        TEXT.setTextSkewX(0f);
        c.drawText(rupee, cx, cy - h * 0.02f + baselineFix(TEXT, h * 0.42f), TEXT);
        // Shine sweep
        float s = (time * 1.4f) % 1.6f - 0.3f;
        FILL.setColor(0x44FFFFFF);
        c.drawRect(cx - w * 0.5f + w * s, cy - h * 0.5f, cx - w * 0.5f + w * (s + 0.14f), cy + h * 0.5f, FILL);
    }

    static void drawChai(Canvas c, float cx, float cy, float r, float time, boolean shieldActive) {
        float bob = (float) Math.sin(time * 3.4 + 1.0) * r * 0.10f;
        cy += bob;
        circ(c, cx, cy, r * 1.45f, 0x225AD2FF);
        // Saucer
        circ(c, cx, cy, r, 0xFFF2F4F7L);
        circ(c, cx, cy, r * 0.92f, 0xFFDDE2E8L);
        // Cup
        circ(c, cx, cy, r * 0.66f, 0xFFFFFFFFL);
        circStroke(c, cx, cy, r * 0.66f, 0xFFB9C2CCL, r * 0.07f);
        // Tea
        circ(c, cx, cy, r * 0.52f, 0xFFC97B3CL);
        circ(c, cx - r * 0.14f, cy - r * 0.14f, r * 0.17f, 0xFFE0A066L);
        // Handle
        circStroke(c, cx + r * 0.80f, cy, r * 0.24f, 0xFFFFFFFFL, r * 0.11f);
        // Steam
        STROKE.setStyle(Paint.Style.STROKE);
        STROKE.setStrokeCap(Paint.Cap.ROUND);
        STROKE.setStrokeWidth(r * 0.10f);
        STROKE.setColor(0x99FFFFFFL);
        for (int i = 0; i < 2; i++) {
            float ph = time * 2.6f + i * 1.7f;
            float sx = cx - r * 0.22f + i * r * 0.44f;
            P.reset();
            P.moveTo(sx, cy - r * 0.75f);
            P.quadTo(sx + (float) Math.sin(ph) * r * 0.30f, cy - r * 1.15f,
                    sx + (float) Math.sin(ph + 1.2f) * r * 0.22f, cy - r * 1.55f);
            c.drawPath(P, STROKE);
        }
        if (shieldActive) {
            circStroke(c, cx, cy, r * 1.55f, 0xAA5AD2FFL, r * 0.09f);
        }
    }

    // -----------------------------------------------------------------------
    // Particles
    // -----------------------------------------------------------------------

    static void drawParticles(Canvas c, List<Particle> ps) {
        FILL.setStyle(Paint.Style.FILL);
        for (int i = 0; i < ps.size(); i++) {
            Particle p = ps.get(i);
            if (!p.alive) continue;
            float t = p.life / p.maxLife;
            int col = p.color;
            int a = (int) (((col >>> 24) & 0xff) * t);
            col = (a << 24) | (col & 0x00FFFFFF);
            FILL.setColor(col);
            if (p.square) {
                c.save();
                c.translate(p.x, p.y);
                c.rotate(p.rot);
                c.drawRect(-p.size * 0.5f, -p.size * 0.5f, p.size * 0.5f, p.size * 0.5f, FILL);
                c.restore();
            } else {
                c.drawCircle(p.x, p.y, p.size * 0.5f * (0.4f + 0.6f * t), FILL);
            }
        }
    }

    // -----------------------------------------------------------------------
    // HUD
    // -----------------------------------------------------------------------

    static void drawHeart(Canvas c, float cx, float cy, float r, boolean full) {
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(full ? COL_DANGER : 0x33FFFFFF);
        P.reset();
        P.moveTo(cx, cy + r * 0.75f);
        P.cubicTo(cx - r * 1.35f, cy - r * 0.25f, cx - r * 0.55f, cy - r * 1.10f, cx, cy - r * 0.42f);
        P.cubicTo(cx + r * 0.55f, cy - r * 1.10f, cx + r * 1.35f, cy - r * 0.25f, cx, cy + r * 0.75f);
        P.close();
        c.drawPath(P, FILL);
        if (full) {
            FILL.setColor(0x55FFFFFF);
            c.drawCircle(cx - r * 0.34f, cy - r * 0.30f, r * 0.18f, FILL);
        }
    }

    static void drawPauseButton(Canvas c, float cx, float cy, float r) {
        circ(c, cx, cy, r, 0x33000000);
        circStroke(c, cx, cy, r, 0x66FFFFFF, 3f);
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(COL_TEXT);
        c.drawRect(cx - r * 0.34f, cy - r * 0.38f, cx - r * 0.10f, cy + r * 0.38f, FILL);
        c.drawRect(cx + r * 0.10f, cy - r * 0.38f, cx + r * 0.34f, cy + r * 0.38f, FILL);
    }

    static void drawSoundButton(Canvas c, float cx, float cy, float r, boolean muted) {
        circ(c, cx, cy, r, 0x33000000);
        circStroke(c, cx, cy, r, 0x66FFFFFF, 3f);
        FILL.setStyle(Paint.Style.FILL);
        FILL.setColor(COL_TEXT);
        // Speaker body
        P.reset();
        P.moveTo(cx - r * 0.42f, cy - r * 0.18f);
        P.lineTo(cx - r * 0.14f, cy - r * 0.18f);
        P.lineTo(cx + r * 0.16f, cy - r * 0.46f);
        P.lineTo(cx + r * 0.16f, cy + r * 0.46f);
        P.lineTo(cx - r * 0.14f, cy + r * 0.18f);
        P.lineTo(cx - r * 0.42f, cy + r * 0.18f);
        P.close();
        c.drawPath(P, FILL);
        STROKE.setStyle(Paint.Style.STROKE);
        STROKE.setStrokeCap(Paint.Cap.ROUND);
        STROKE.setStrokeWidth(r * 0.11f);
        if (muted) {
            STROKE.setColor(COL_DANGER);
            c.drawLine(cx + r * 0.26f, cy - r * 0.30f, cx + r * 0.62f, cy + r * 0.30f, STROKE);
            c.drawLine(cx + r * 0.62f, cy - r * 0.30f, cx + r * 0.26f, cy + r * 0.30f, STROKE);
        } else {
            STROKE.setColor(COL_TEXT);
            STROKE.setStyle(Paint.Style.STROKE);
            R.set(cx + r * 0.16f, cy - r * 0.34f, cx + r * 0.80f, cy + r * 0.34f);
            c.drawArc(R, -55f, 110f, false, STROKE);
        }
    }

    /** Vertical offset that centres text on cy for a given text size. */
    static float baselineFix(Paint p, float textSize) {
        Paint.FontMetrics fm = p.getFontMetrics();
        return -(fm.ascent + fm.descent) * 0.5f;
    }

    static void drawText(Canvas c, String s, float cx, float cy, float size, int color,
                         float alpha, boolean italic) {
        TEXT.setTextAlign(Paint.Align.CENTER);
        TEXT.setTextSize(size);
        TEXT.setColor(color);
        TEXT.setAlpha((int) (alpha * ((color >>> 24) & 0xff)));
        TEXT.setTextSkewX(italic ? -0.18f : 0f);
        c.drawText(s, cx, cy + baselineFix(TEXT, size), TEXT);
        TEXT.setTextSkewX(0f);
    }

    /** Left-aligned text; returns the advance width. */
    static float drawTextLeft(Canvas c, String s, float x, float cy, float size, int color) {
        TEXT.setTextAlign(Paint.Align.LEFT);
        TEXT.setTextSize(size);
        TEXT.setColor(color);
        float w = TEXT.measureText(s);
        c.drawText(s, x, cy + baselineFix(TEXT, size), TEXT);
        return w;
    }

    static float drawTextRight(Canvas c, String s, float x, float cy, float size, int color) {
        TEXT.setTextAlign(Paint.Align.RIGHT);
        TEXT.setTextSize(size);
        TEXT.setColor(color);
        float w = TEXT.measureText(s);
        c.drawText(s, x, cy + baselineFix(TEXT, size), TEXT);
        return w;
    }

    static void fillRect(Canvas c, float l, float t, float r, float b, int color) {
        FILL.setStyle(Paint.Style.FILL);
        FILL.setShader(null);
        FILL.setColor(color);
        c.drawRect(l, t, r, b, FILL);
    }

    static void roundRect(Canvas c, float cx, float cy, float w, float h, float rad, int color) {
        rr(c, cx, cy, w, h, rad, color);
    }

    static void roundRectStroke(Canvas c, float cx, float cy, float w, float h,
                                float rad, int color, float width) {
        rrStroke(c, cx, cy, w, h, rad, color, width);
    }

    static void circle(Canvas c, float cx, float cy, float r, int color) {
        circ(c, cx, cy, r, color);
    }

    static void dim(Canvas c, float w, float h, int color) {
        FILL.setStyle(Paint.Style.FILL);
        FILL.setShader(null);
        FILL.setColor(color);
        c.drawRect(0, 0, w, h, FILL);
    }
}
