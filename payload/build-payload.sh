#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

AJAR="${ANDROID_JAR:?set ANDROID_JAR}"
mkdir -p build/classes build/dex libs

[ -f libs/okhttp.jar ] || curl -sLo libs/okhttp.jar https://repo1.maven.org/maven2/com/squareup/okhttp3/okhttp/4.12.0/okhttp-4.12.0.jar
[ -f libs/okio.jar ]   || curl -sLo libs/okio.jar   https://repo1.maven.org/maven2/com/squareup/okio/okio-jvm/3.6.0/okio-jvm-3.6.0.jar

javac -nowarn -source 8 -target 8 -bootclasspath "$AJAR" \
      -cp libs/okhttp.jar:libs/okio.jar \
      -d build/classes $(find java -name '*.java')

"${BUILD_TOOLS}/d8" --min-api 24 --lib "$AJAR" --output build/dex \
      $(find build/classes -name '*.class') libs/okhttp.jar libs/okio.jar

cp build/dex/classes.dex build/classes.dex
echo "OK -> payload/build/classes.dex"
