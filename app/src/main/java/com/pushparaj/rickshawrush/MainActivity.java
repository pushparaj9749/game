package com.pushparaj.rickshawrush;

import android.app.Activity;
import android.os.Bundle;

/**
 * Entry point. Hosts the full-screen game surface.
 */
public class MainActivity extends Activity {

    private GameView gameView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        gameView = new GameView(this);
        setContentView(gameView);
    }

    @Override
    protected void onResume() {
        super.onResume();
        gameView.resumeGame();
    }

    @Override
    protected void onPause() {
        super.onPause();
        gameView.pauseGame();
    }
}
