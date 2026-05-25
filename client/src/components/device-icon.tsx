import android from '../assets/devices/android.svg'
import androidTablet from '../assets/devices/android_tablet.svg'
import androidtv from '../assets/devices/androidtv.svg'
import appletv from '../assets/devices/appletv.svg'
import badgeAndroid from '../assets/devices/badge_android.svg'
import badgeApple from '../assets/devices/badge_apple.svg'
import badgeLinux from '../assets/devices/badge_linux.svg'
import badgeWindows from '../assets/devices/badge_windows.svg'
import ipad from '../assets/devices/ipad.svg'
import iphone from '../assets/devices/iphone.svg'
import linux from '../assets/devices/linux.svg'
import mac from '../assets/devices/mac.svg'
import other from '../assets/devices/other.svg'
import router from '../assets/devices/router.svg'
import windows from '../assets/devices/windows.svg'

// vite-plugin-svgo replaces each `.svg` import with an optimized SVG markup string.
const SPRITES: Record<string, string> = {
  iphone,
  android,
  mac,
  windows,
  linux,
  appletv,
  androidtv,
  ipad,
  android_tablet: androidTablet,
  router,
  other,
}

/** Which OS badge (if any) overlays each device sprite. */
const BADGES: Record<string, string> = {
  iphone: badgeApple,
  android: badgeAndroid,
  mac: badgeApple,
  windows: badgeWindows,
  linux: badgeLinux,
  appletv: badgeApple,
  androidtv: badgeAndroid,
  ipad: badgeApple,
  android_tablet: badgeAndroid,
}

interface Props {
  slug: string
  fallback?: string
  className?: string
  /** Show the OS badge overlay in the bottom-right (default true). */
  showBadge?: boolean
}

const svgFill = '[&_svg]:h-full [&_svg]:w-full [&_svg]:block'

export function DeviceIcon({slug, fallback = '❓', className = 'h-10 w-10', showBadge = true}: Props) {
  const src = SPRITES[slug]
  if (!src) return <span className={className}>{fallback}</span>
  const badge = showBadge ? BADGES[slug] : undefined
  return (
    <span className={`relative inline-block ${className}`}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG markup comes from bundled Vite imports, not user input. */}
      <span aria-hidden="true" className={`block h-full w-full ${svgFill}`} dangerouslySetInnerHTML={{__html: src}} />
      {badge && (
        <span
          aria-hidden="true"
          className={`absolute right-0 bottom-0 block h-1/3 w-1/3 opacity-70 ${svgFill}`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Badge SVG markup comes from bundled Vite imports.
          dangerouslySetInnerHTML={{__html: badge}}
        />
      )}
    </span>
  )
}
