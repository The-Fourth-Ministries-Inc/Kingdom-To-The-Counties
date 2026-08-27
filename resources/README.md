# Native store assets

These files are copied into the Capacitor Android and iOS projects **after**
`npx cap add` in hosted CI. They replace the default Capacitor placeholder
icon and splash so a signed build is not uploaded with the Capacitor logo.

| File | Use |
| --- | --- |
| `icon.png` | 1024×1024 opaque RGB source (no alpha). App Store icon and iOS `AppIcon-512@2x.png`. |
| `splash.png` | 2732×2732 cream launch image with the K2C mark. |
| `ios/AppIcon-1024.png` | Same 1024×1024 icon, kept next to the iOS copy target. |
| `android/mipmap-*/` | Density-specific launcher / adaptive-foreground PNGs. |

Source artwork is the in-repo `favicon.svg` (K2C mark on cream `#F5F2E9`).
Do not commit `android/` or `ios/` project folders; CI generates those.
