package com.pushparaj.rickshawrush;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.util.Log;

import java.util.Random;

/**
 * Tiny procedural sound engine.
 *
 * Every effect in the game is synthesised sample-by-sample on a background
 * thread and streamed into a single {@link AudioTrack}. That means the APK
 * ships with ZERO audio assets - no .ogg/.wav files, no license worries, and
 * the sound design is just a few numbers you can tune below.
 *
 * Layers per output sample:
 *   1. engine hum   - continuous sawtooth + filtered noise, pitch follows speed
 *   2. one-shot SFX - up to {@link #MAX_VOICES} simultaneous voices
 *   3. soft limiter - keeps the mix from clipping
 */
final class SoundEngine {

    private static final String TAG = "SoundEngine";

    static final int SND_COIN = 0;
    static final int SND_CHAI = 1;
    static final int SND_CRASH = 2;
    static final int SND_SHIELD = 3;
    static final int SND_GAMEOVER = 4;
    static final int SND_LANE = 5;
    static final int SND_TAP = 6;

    private static final int MAX_VOICES = 8;

    private static final int SAMPLE_RATE = 44100;
    private static final float MASTER_VOLUME = 0.55f;

    private final Object lock = new Object();
    private final Random random = new Random();

    private volatile boolean muted;
    private volatile boolean running;
    private volatile boolean engineOn;
    /** True while the game is in the PLAYING state (engine hum is allowed). */
    private volatile boolean engineHumArmed;
    /** 0..1 normalised speed, drives the engine pitch. */
    private volatile float speedNorm = 0.25f;

    // --- voice state (guarded by `lock`) ---
    private final int[] vType = new int[MAX_VOICES];
    private final long[] vStart = new long[MAX_VOICES];
    private final boolean[] vUsed = new boolean[MAX_VOICES];

    // --- synthesiser state ---
    private long sampleIndex;
    private float noiseState;
    private float lastOut;

    private AudioTrack track;
    private Thread thread;

    SoundEngine(Context context) {
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            muted = am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL;
        }
    }

    // -----------------------------------------------------------------------
    // Public control
    // -----------------------------------------------------------------------

    void start() {
        synchronized (lock) {
            if (running) return;
            running = true;
            thread = new Thread(this::mixLoop, "SoundEngine");
            thread.setDaemon(true);
            thread.start();
        }
    }

    void stop() {
        synchronized (lock) {
            running = false;
            lock.notifyAll();
        }
        Thread t = thread;
        if (t != null) {
            try {
                t.join(400);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
        thread = null;
    }

    void pause() {
        synchronized (lock) {
            engineOn = false;
        }
    }

    void resume() {
        synchronized (lock) {
            if (!engineHumArmed) return;
            engineOn = true;
            lock.notifyAll();
        }
    }

    /** Call when the game enters/leaves the PLAYING state. */
    void setEngineHum(boolean on) {
        synchronized (lock) {
            engineHumArmed = on;
            engineOn = on;
            lock.notifyAll();
        }
    }

    /** @param norm 0..1 normalised speed. */
    void setSpeed(float norm) {
        if (norm < 0f) norm = 0f;
        if (norm > 1f) norm = 1f;
        speedNorm = norm;
    }

    void setMuted(boolean m) {
        synchronized (lock) {
            muted = m;
            if (m) {
                for (int i = 0; i < MAX_VOICES; i++) vUsed[i] = false;
            }
            lock.notifyAll();
        }
    }

    boolean isMuted() {
        synchronized (lock) {
            return muted;
        }
    }

    void play(int type) {
        synchronized (lock) {
            if (muted) return;
            // Reuse a finished slot, else steal the oldest one.
            int slot = -1;
            int oldest = 0;
            long oldestStart = Long.MAX_VALUE;
            for (int i = 0; i < MAX_VOICES; i++) {
                if (!vUsed[i]) { slot = i; break; }
                if (vStart[i] < oldestStart) { oldestStart = vStart[i]; oldest = i; }
            }
            if (slot < 0) slot = oldest;
            vType[slot] = type;
            vStart[slot] = sampleIndex;
            vUsed[slot] = true;
        }
    }

    // -----------------------------------------------------------------------
    // Mix thread
    // -----------------------------------------------------------------------

    private void mixLoop() {
        final int frame = 1024;
        short[] buf = new short[frame];
        byte[] bytes = new byte[frame * 2];
        AudioTrack t = null;

        try {
            int minBuf = AudioTrack.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT);
            if (minBuf <= 0) minBuf = SAMPLE_RATE / 5;
            int bufSize = Math.max(minBuf * 2, frame * 8);

            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            AudioFormat fmt = new AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();

            t = new AudioTrack(attrs, fmt, bufSize, AudioTrack.MODE_STREAM,
                    AudioManager.AUDIO_SESSION_ID_GENERATE);
            track = t;
            t.play();

            while (true) {
                boolean alive;
                boolean doEngine;
                boolean isMuted;
                synchronized (lock) {
                    alive = running;
                    doEngine = engineOn && !muted;
                    isMuted = muted;
                }
                if (!alive) break;

                if (isMuted) {
                    // Stay responsive but burn no CPU on synthesis.
                    synchronized (lock) {
                        try {
                            lock.wait(120);
                        } catch (InterruptedException ignored) {
                            Thread.currentThread().interrupt();
                        }
                    }
                    continue;
                }

                for (int i = 0; i < frame; i++) {
                    float s = doEngine ? engineSample() : 0f;
                    s += voicesSample();
                    s *= MASTER_VOLUME;
                    // One-pole soft limiter: cheap and keeps crashes from cracking.
                    lastOut += 0.55f * (s - lastOut);
                    float v = lastOut;
                    if (v > 1f) v = 1f;
                    else if (v < -1f) v = -1f;
                    buf[i] = (short) (v * 32767f);
                }

                for (int i = 0; i < frame; i++) {
                    bytes[i * 2] = (byte) (buf[i] & 0xff);
                    bytes[i * 2 + 1] = (byte) ((buf[i] >> 8) & 0xff);
                }

                int off = 0;
                while (off < bytes.length) {
                    int w = t.write(bytes, off, bytes.length - off);
                    if (w <= 0) {
                        if (w == AudioTrack.ERROR_INVALID_OPERATION
                                || w == AudioTrack.ERROR_BAD_VALUE
                                || w == AudioTrack.ERROR_DEAD_OBJECT) {
                            return;
                        }
                        break;
                    }
                    off += w;
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "audio thread ended: " + e);
        } finally {
            if (t != null) {
                try {
                    if (t.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) t.stop();
                } catch (Throwable ignored) {
                    // ignore
                }
                try {
                    t.release();
                } catch (Throwable ignored) {
                    // ignore
                }
            }
            track = null;
        }
    }

    // -----------------------------------------------------------------------
    // Synthesis
    // -----------------------------------------------------------------------

    /** Continuous rickshaw engine: detuned sawtooth + low-passed noise. */
    private float engineSample() {
        float n = speedNorm;
        float f = 46f + n * 104f;               // 46..150 Hz
        double phase = (sampleIndex * (double) f) / SAMPLE_RATE;

        float saw = (float) (2.0 * (phase - Math.floor(phase + 0.5)));
        float sub = (float) Math.sin(2.0 * Math.PI * phase * 0.5);
        float wob = (float) (0.75 + 0.25 * Math.sin(2.0 * Math.PI * sampleIndex * 6.5 / SAMPLE_RATE));

        float noise = random.nextFloat() * 2f - 1f;
        noiseState += 0.055f * (noise - noiseState);   // one-pole low-pass

        sampleIndex++;
        return (saw * 0.11f + sub * 0.055f) * wob + noiseState * 0.030f;
    }

    /** Sum of all active one-shot voices for the current sample. */
    private float voicesSample() {
        float out = 0f;
        for (int i = 0; i < MAX_VOICES; i++) {
            long age;
            int type;
            synchronized (lock) {
                if (!vUsed[i]) continue;
                age = sampleIndex - vStart[i];
                type = vType[i];
                if (age < 0) age = 0;
            }
            float secs = (float) age / SAMPLE_RATE;

            float seg = 0f;
            float segT = 0f;
            float segDur = 0f;
            float totalDur;
            float freq;
            float vol;
            int wave;   // 0 sine, 1 square, 2 saw, 3 noise

            switch (type) {
                case SND_COIN: {
                    totalDur = 0.16f;
                    if (secs >= totalDur) { seg = finish(i, secs, totalDur); break; }
                    int k = (int) (secs / 0.08f);
                    segDur = 0.08f;
                    segT = secs - k * 0.08f;
                    freq = k == 0 ? 1046.5f : 1567.98f;      // C6 -> G6
                    vol = 0.20f;
                    wave = 1;
                    break;
                }
                case SND_CHAI: {
                    totalDur = 0.24f;
                    if (secs >= totalDur) { seg = finish(i, secs, totalDur); break; }
                    int k = (int) (secs / 0.08f);
                    segDur = 0.08f;
                    segT = secs - k * 0.08f;
                    freq = k == 0 ? 523.25f : (k == 1 ? 783.99f : 1046.5f);  // C5 G5 C6
                    vol = 0.22f;
                    wave = 0;
                    break;
                }
                case SND_SHIELD: {
                    totalDur = 0.30f;
                    if (secs >= totalDur) { seg = finish(i, secs, totalDur); break; }
                    segDur = totalDur;
                    segT = secs;
                    freq = 300f + 700f * (secs / totalDur);  // rising sweep
                    vol = 0.20f;
                    wave = 2;
                    break;
                }
                case SND_CRASH: {
                    totalDur = 0.42f;
                    if (secs >= totalDur) { seg = finish(i, secs, totalDur); break; }
                    segDur = totalDur;
                    segT = secs;
                    float k = secs / totalDur;
                    // Falling thud under a decaying noise burst.
                    freq = 210f - 150f * k;
                    vol = 0.34f * (1f - k) * (1f - k);
                    wave = 3;
                    break;
                }
                case SND_GAMEOVER: {
                    totalDur = 0.66f;
                    if (secs >= totalDur) { seg = finish(i, secs, totalDur); break; }
                    int k = (int) (secs / 0.22f);
                    segDur = 0.22f;
                    segT = secs - k * 0.22f;
                    freq = k == 0 ? 659.25f : (k == 1 ? 523.25f : 392.00f);   // E5 C5 G4
                    vol = 0.24f;
                    wave = 1;
                    break;
                }
                case SND_LANE: {
                    totalDur = 0.05f;
                    if (secs >= totalDur) { seg = finish(i, secs, totalDur); break; }
                    segDur = totalDur;
                    segT = secs;
                    freq = 520f;
                    vol = 0.07f;
                    wave = 0;
                    break;
                }
                case SND_TAP: {
                    totalDur = 0.04f;
                    if (secs >= totalDur) { seg = finish(i, secs, totalDur); break; }
                    segDur = totalDur;
                    segT = secs;
                    freq = 880f;
                    vol = 0.10f;
                    wave = 1;
                    break;
                }
                default: {
                    synchronized (lock) {
                        vUsed[i] = false;
                    }
                    continue;
                }
            }

            // Per-note attack/decay envelope so notes never click.
            float env;
            if (segDur <= 0f) {
                env = 1f - (secs / totalDur);
            } else {
                float rel = segT / segDur;
                float attack = Math.min(1f, segT / 0.004f);
                env = attack * (1f - rel) * (1f - rel);
            }
            if (env < 0f) env = 0f;

            float s;
            if (wave == 3) {
                s = random.nextFloat() * 2f - 1f;
            } else {
                double p = (sampleIndex * (double) freq) / SAMPLE_RATE;
                double fr = p - Math.floor(p);
                if (wave == 0) {
                    s = (float) Math.sin(2.0 * Math.PI * fr);
                } else if (wave == 1) {
                    s = fr < 0.5 ? 1f : -1f;
                    s *= 0.6f;   // square is loud, tame it
                } else {
                    s = (float) (2.0 * fr - 1.0);
                }
            }
            out += s * vol * env;
        }
        return out;
    }

    /** Retire a finished voice and return silence for it. */
    private float finish(int slot, float secs, float totalDur) {
        if (secs >= totalDur) {
            synchronized (lock) {
                vUsed[slot] = false;
            }
        }
        return 0f;
    }
}
