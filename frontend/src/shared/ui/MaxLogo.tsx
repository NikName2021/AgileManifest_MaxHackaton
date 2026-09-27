import darkWordmark from '../../assets/max/max-full-dark.png'
import lightWordmark from '../../assets/max/max-full-light.png'
import symbol from '../../assets/max/max-symbol.png'

// Original MAX artwork supplied with the project. Preserve proportions and colors.
export function MaxLogo({ icon = false }: { icon?: boolean }) {
  return icon ? (
    <img className="max-symbol" src={symbol} alt="MAX" />
  ) : (
    <span className="max-wordmark" role="img" aria-label="MAX">
      <img className="max-logo-on-light" src={darkWordmark} alt="" />
      <img className="max-logo-on-dark" src={lightWordmark} alt="" />
    </span>
  )
}
