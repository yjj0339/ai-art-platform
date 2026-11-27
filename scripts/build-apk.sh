#!/usr/bin/env bash
# 打安卓安装包（不需要 Gradle / Android Studio）
# 依赖：D:\ruanjian\gongju 下的 JDK17 + Android SDK(build-tools 34 + platform android-34)
# 用法：bash scripts/build-apk.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JDK_HOME="${JDK_HOME:-D:/ruanjian/gongju/jdk17/jdk-17.0.2}"
SDK_ROOT="${SDK_ROOT:-D:/ruanjian/gongju/android-sdk}"
BT="$SDK_ROOT/build-tools/34.0.0"
ANDROID_JAR="$SDK_ROOT/platforms/android-34/android.jar"

JAVAC="$JDK_HOME/bin/javac.exe"
JAR="$JDK_HOME/bin/jar.exe"
KEYTOOL="$JDK_HOME/bin/keytool.exe"

export JAVA_HOME="$JDK_HOME"

APP_DIR="$ROOT/android"
BUILD="$APP_DIR/build"
DIST="$ROOT/dist"
KS="$APP_DIR/release.keystore"
# 签名口令不写在代码里：先看环境变量 APK_KEYSTORE_PASS，再读 android/keystore.local（本地文件，不进仓库）
KS_PASS="${APK_KEYSTORE_PASS:-}"
if [ -z "$KS_PASS" ] && [ -f "$APP_DIR/keystore.local" ]; then
  KS_PASS=$(sed -n 's/^APK_KEYSTORE_PASS=//p' "$APP_DIR/keystore.local" | tr -d '\r' | head -1)
fi
[ -n "$KS_PASS" ] || { echo "缺少签名口令：设置环境变量 APK_KEYSTORE_PASS，或在 android/keystore.local 里写一行 APK_KEYSTORE_PASS=口令（已有 release.keystore 时要用原来的口令）"; exit 1; }
KS_ALIAS="aiclass"
APK_NAME="AI美术课堂.apk"

for f in "$BT/aapt2.exe" "$BT/d8.bat" "$BT/zipalign.exe" "$BT/apksigner.bat" "$ANDROID_JAR" "$JAVAC"; do
  [ -e "$f" ] || { echo "缺少工具：$f"; exit 1; }
done

echo "[1/7] 准备输出目录"
# 注意：这里刻意不做 rm -rf 清理。各步骤都是覆盖写，重复构建安全。
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$DIST"

cd "$APP_DIR"

echo "[2/7] 编译资源 (aapt2 compile)"
"$BT/aapt2.exe" compile --dir res -o "$BUILD/res.zip"

echo "[3/7] 打包资源 + 清单 (aapt2 link)"
"$BT/aapt2.exe" link \
  -o "$BUILD/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest AndroidManifest.xml \
  -A assets \
  --java "$BUILD/gen" \
  --min-sdk-version 21 \
  --target-sdk-version 34 \
  --version-code 1 \
  --version-name 1.0 \
  "$BUILD/res.zip"

echo "[4/7] 编译 Java"
# ⚠️ 必须用相对路径：Windows 版 javac 不认 /d/... 这种 MSYS 路径
find src build/gen -name "*.java" > build/sources.txt
"$JAVAC" -source 8 -target 8 -encoding UTF-8 -nowarn \
  -bootclasspath "$ANDROID_JAR" \
  -d build/classes \
  "@build/sources.txt"

echo "[5/7] 转 dex (d8)"
CLASSES=$(find build/classes -name "*.class" | tr '\n' ' ')
"$BT/d8.bat" --lib "$ANDROID_JAR" --min-api 21 --output build/dex $CLASSES

"$JAR" uf build/base.apk -C build/dex classes.dex

echo "[6/7] 对齐 (zipalign)"
"$BT/zipalign.exe" -p -f 4 build/base.apk build/aligned.apk

if [ ! -e "$KS" ]; then
  echo "      生成签名用 keystore"
  "$KEYTOOL" -genkeypair -v -keystore "$KS" -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=MeiJia Art Class, OU=Art, O=MeiJia, L=Zhuzhou, ST=Hunan, C=CN" >/dev/null 2>&1
fi

echo "[7/7] 签名 (apksigner)"
"$BT/apksigner.bat" sign \
  --ks "$KS" --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --out "$DIST/$APK_NAME" build/aligned.apk

"$BT/apksigner.bat" verify --print-certs "$DIST/$APK_NAME" | head -4

echo
echo "打包完成：$DIST/$APK_NAME"
ls -lh "$DIST/$APK_NAME"
