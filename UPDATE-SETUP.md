# Resistine Auto-Update Setup

This guide covers the auto-update infrastructure for both macOS (Sparkle) and Windows (WinSparkle/appcast-based).

## Overview

- **appcast.xml**: Central feed containing all macOS and Windows update information
- **releases/mac/**: Signed macOS DMG installers
- **releases/windows/**: Windows .exe installers
- **releases/android/**: Android APK files

## Publishing a Windows Update

### 1. Build the Windows Installer

On Windows, from the `Resistine-Desktop` repository:

```powershell
# Build the installer
.\scripts\build\build-windows-installer.ps1

# Output: dist\installers\Resistine-Setup-X.X.X.exe
```

### 2. Get File Information

```powershell
$file = "dist\installers\Resistine-Setup-2026.03.19.exe"
$length = (Get-Item $file).Length
Write-Host "File size: $length bytes"
```

### 3. Upload to GitHub Pages

Copy the .exe file to this repository:

```bash
# In resistine.github.io directory
cp /path/to/Resistine-Setup-2026.03.19.exe releases/windows/
git add releases/windows/Resistine-Setup-2026.03.19.exe
```

### 4. Update appcast.xml

Edit `appcast.xml` and add a new Windows `<item>` block (or update the existing one):

```xml
<!-- Windows Version 2026.03.19 -->
<item os="Windows">
  <title>Version 2026.03.19</title>
  <description><![CDATA[
    <h2>What's New</h2>
    <ul>
      <li>Your feature here</li>
    </ul>
  ]]></description>
  <pubDate>Wed, 20 Mar 2026 12:00:00 +0000</pubDate>
  <enclosure
    url="https://resistine.github.io/releases/windows/Resistine-Setup-2026.03.19.exe"
    sparkle:version="2026.03.19"
    sparkle:shortVersionString="2026.03.19"
    length="ACTUAL_FILE_SIZE_IN_BYTES"
    type="application/octet-stream"
  />
</item>
```

### 5. Publish

```bash
git add appcast.xml releases/windows/Resistine-Setup-2026.03.19.exe
git commit -m "Release Windows v2026.03.19"
git push origin main
```

## Client-Side Integration

### Activating Auto-Updates in the App

In your main application (e.g., `gui/tray.py` or main entry point):

```python
from plugins.updater import BackgroundUpdateChecker

# Initialize and start background update checker
update_checker = BackgroundUpdateChecker(check_interval_hours=24)
update_checker.start()

# On app shutdown:
update_checker.stop()
```

### Manual Update Check

```python
from plugins.updater.windows_updater import WindowsUpdater

updater = WindowsUpdater()
has_update, version, url, description = updater.check_for_updates()

if has_update:
    print(f"Update available: {version}")
    print(f"Description: {description}")

    # Download
    if updater.download_update():
        # Launch installer
        updater.install_update(installer_path)
```

### Handling Update Notifications

You can hook into the update check to show UI notifications:

```python
from plugins.updater.windows_updater import WindowsUpdater

class AppUpdater:
    def __init__(self, gui_callback=None):
        self.updater = WindowsUpdater()
        self.gui_callback = gui_callback

    def check_and_notify(self):
        has_update, version, url, desc = self.updater.check_for_updates()

        if has_update and self.gui_callback:
            # Show notification/dialog in GUI
            self.gui_callback(version, desc)
```

## Version Management

### Version Format

- **Date-based**: `2026.03.19` (YYYY.MM.DD)
- **Semantic**: `1.0.5` (MAJOR.MINOR.PATCH)

### Updating Version

Update in `packaging/Resistine.spec`:

```
VERSION = '2026.03.19'
```

The updater reads this file to determine the current version.

## macOS Updates (Existing)

macOS updates use signed DMG files with Sparkle's EdDSA signatures:

1. Build DMG: `./scripts/build/build-distribution.sh`
2. Sign: `scripts/sparkle-tools/sign_update dist/Resistine-Installer.dmg`
3. Add signed DMG to appcast.xml with signature
4. Push to `releases/mac/`

## Testing Updates Locally

### Test the Appcast Parser

```python
from plugins.updater.windows_updater import WindowsUpdater

updater = WindowsUpdater()
has_update, version, url, desc = updater.check_for_updates()
print(f"Has update: {has_update}, Version: {version}")
```

### Mock Update Check

Create a test appcast.xml with a newer version to verify the update flow works.

## Troubleshooting

### Update Not Appearing

1. Check appcast.xml is valid XML: `python -m xml.etree.ElementTree appcast.xml`
2. Verify version comparison logic (numeric for dates, semantic versioning)
3. Ensure `sparkle:version` attribute is present
4. Check GitHub Pages is serving the file: `curl https://resistine.github.io/appcast.xml`

### Download Failing

1. Verify file exists and is accessible: `curl -I https://resistine.github.io/releases/windows/Resistine-Setup-VERSION.exe`
2. Check file size is correct in appcast.xml `<length>` attribute
3. Verify network connectivity

### Version Not Recognized

The updater expects numeric versions like `2026.03.19` for date-based or `1.0.5` for semantic.
Ensure your version in `Resistine.spec` matches the appcast entry.
