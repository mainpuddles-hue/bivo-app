import React from 'react'
import Svg, { Path, Circle } from 'react-native-svg'

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
}

function Icon({ size = 22, color = '#1A1D1F', strokeWidth: sw = 1.6, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  )
}

export function BackIcon(p: IconProps) {
  return <Icon {...p}><Path d="M15 4 7 12l8 8" /></Icon>
}
export function CloseIcon(p: IconProps) {
  return <Icon {...p}><Path d="M6 6l12 12" /><Path d="M18 6 6 18" /></Icon>
}
export function CheckIcon(p: IconProps) {
  return <Icon {...p}><Path d="M5 13l4 4L19 7" /></Icon>
}
export function SearchIcon(p: IconProps) {
  return <Icon {...p}><Circle cx={11} cy={11} r={7} /><Path d="m20 20-3.5-3.5" /></Icon>
}
export function CameraIcon(p: IconProps) {
  return <Icon {...p}><Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" /><Circle cx={12} cy={13} r={3} /></Icon>
}
export function QRCodeIcon(p: IconProps) {
  return <Icon {...p}><Path d="M3 3h7v7H3z" /><Path d="M14 3h7v7h-7z" /><Path d="M3 14h7v7H3z" /><Path d="M14 14h3v3h-3z" /><Path d="M17 17h4v4h-4z" /></Icon>
}
export function PinIcon(p: IconProps) {
  return <Icon {...p}><Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><Circle cx={12} cy={10} r={3} /></Icon>
}
export function HomeIcon(p: IconProps) {
  return <Icon {...p}><Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><Path d="M9 22V12h6v10" /></Icon>
}
export function PlusIcon(p: IconProps) {
  return <Icon {...p}><Path d="M12 5v14" /><Path d="M5 12h14" /></Icon>
}
export function ChatIcon(p: IconProps) {
  return <Icon {...p}><Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>
}
export function ClockIcon(p: IconProps) {
  return <Icon {...p}><Circle cx={12} cy={12} r={10} /><Path d="M12 6v6l4 2" /></Icon>
}
export function StarIcon(p: IconProps) {
  return (
    <Svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill={p.color ?? '#1A1D1F'} stroke={p.color ?? '#1A1D1F'} strokeWidth={p.strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  )
}
export function StarOIcon(p: IconProps) {
  return (
    <Svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke={p.color ?? '#1A1D1F'} strokeWidth={p.strokeWidth ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  )
}
