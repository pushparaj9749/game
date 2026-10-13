# Rickshaw Rush - ProGuard / R8 rules
# The game is plain Java + Canvas with no reflection, no serialization and no
# libraries, so there is nothing special to keep. If you ever turn minifyEnabled
# on, these rules are the safety net.

-dontwarn android.**

# Keep the Activity entry point (referenced from AndroidManifest by name).
-keep public class com.pushparaj.rickshawrush.MainActivity { public <init>(); }

# Useful stack traces from release builds.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
