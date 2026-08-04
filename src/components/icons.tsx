type IconProps = {
  size?: number
  className?: string
}

function baseProps({ size = 16, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className,
  } as const
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function PeopleIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.8" />
      <path d="M16 14.5c2.6.3 5.5 1.9 5.5 5.5" />
    </svg>
  )
}

export function ChatPlusIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M12 8.5v5M9.5 11h5" />
    </svg>
  )
}

export function GroupIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.7 2.9-6 6.5-6s6.5 2.3 6.5 6" />
      <circle cx="17.5" cy="9.5" r="2.4" />
      <path d="M18 14.8c2.2.2 4 1.7 4 4.7" />
    </svg>
  )
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5.5 4.4a1 1 0 0 0 1.7-.8V6.4a1 1 0 0 0-1.7-.8L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  )
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  )
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 2.5 20 6v6c0 4.6-3.2 8.4-8 9.5C7.2 20.4 4 16.6 4 12V6l8-3.5Z" />
      <path d="M12 7v4" />
      <circle cx="12" cy="13.5" r="1.4" />
    </svg>
  )
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  )
}

export function AttachIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

export function TimerIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9 2h6" />
    </svg>
  )
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  )
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3.5" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function VideoIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="2.5" y="5.5" width="13" height="13" rx="2" />
      <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
    </svg>
  )
}

export function LocationIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M11 12h1v4h1" />
    </svg>
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function QrCodeIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM17 17h4v4h-4zM14 20h3v1h-3z" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

export function UserPlusIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="17" y1="11" x2="23" y2="11" />
    </svg>
  )
}

export function UserMinusIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="17" y1="11" x2="23" y2="11" />
    </svg>
  )
}

export function PaletteIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.7-.75 1.7-1.7 0-.42-.16-.8-.43-1.09-.27-.29-.43-.68-.43-1.11 0-.93.76-1.7 1.7-1.7h2.5c3.04 0 5.5-2.46 5.5-5.5C22 6.5 17.5 2 12 2Z" />
    </svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

export function DesktopIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

export function SmartphoneIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth={2.5} />
    </svg>
  )
}

export function ServerIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth={2.5} />
      <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth={2.5} />
    </svg>
  )
}

export function DatabaseIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21.5 2v6h-6" />
      <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}


