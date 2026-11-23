FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android \
    JAVA_TOOL_OPTIONS="-Xmx256m"

RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless apktool unzip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Android SDK: sirf platform-34 jar + build-tools (zipalign, apksigner)
RUN mkdir -p /opt/android/cmdline-tools \
 && curl -fsSL -o /tmp/t.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
 && unzip -q /tmp/t.zip -d /opt/android/cmdline-tools \
 && mv /opt/android/cmdline-tools/cmdline-tools /opt/android/cmdline-tools/latest \
 && rm /tmp/t.zip
ENV PATH="/opt/android/cmdline-tools/latest/bin:${PATH}"

RUN yes | sdkmanager --licenses > /dev/null 2>&1 || true
RUN sdkmanager "platforms;android-34" "build-tools;34.0.0" > /dev/null

ENV ANDROID_JAR=/opt/android/platforms/android-34/android.jar \
    BUILD_TOOLS=/opt/android/build-tools/34.0.0 \
    KEYSTORE=/app/keys/arpit.jks \
    KS_PASS=Arpit@2026 \
    KS_ALIAS=arpit \
    NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm i --omit=dev
COPY . .

# payload dex image build ke waqt — runtime pe javac nahi chahiye
RUN npm run payload

# keystore committed ho to wahi use hoga, warna ek baar generate
RUN mkdir -p /app/keys && \
    if [ ! -f /app/keys/arpit.jks ]; then \
      keytool -genkeypair -v -keystore /app/keys/arpit.jks -alias arpit \
        -keyalg RSA -keysize 2048 -validity 10000 -storepass "$KS_PASS" -dname "CN=Arpit"; \
    fi

EXPOSE 3000
CMD ["node", "--max-old-space-size=192", "src/server.js"]
