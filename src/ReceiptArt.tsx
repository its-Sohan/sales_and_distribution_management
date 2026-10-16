import logo from './assets/mic-logo.jpg'

// Brand badge (MIC · Masum IT Cottage). Decorative: the brand name is printed as text beside it.
export function CottageLogo({ className = '' }: { className?: string }) {
  return <img className={className} src={logo} alt="" aria-hidden="true" draggable={false} decoding="sync"/>
}
