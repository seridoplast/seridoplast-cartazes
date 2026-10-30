const BASE = import.meta.env.BASE_URL

export function BrandLogo({ className = '' }: { className?: string }) {
  return <span className={`brand-logo ${className}`} aria-label="Seridóplast Cartazes">
    <img className="brand-logo--light" src={`${BASE}logo-light.svg`} alt="Seridóplast Cartazes" />
    <img className="brand-logo--dark" src={`${BASE}logo-dark.svg`} alt="" aria-hidden="true" />
  </span>
}
