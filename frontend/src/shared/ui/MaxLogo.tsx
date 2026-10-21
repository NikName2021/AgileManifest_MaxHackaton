import darkWordmark from '../../assets/max/max-wordmark-light.svg'
import lightWordmark from '../../assets/max/max-wordmark-dark.svg'

// Original MAX artwork supplied with the project. Preserve proportions and colors.
export function MaxLogo() {
  return (
    <span className="max-wordmark" role="img" aria-label="MAX">
      <img className="max-logo-on-light" src={darkWordmark} alt="" />
      <img className="max-logo-on-dark" src={lightWordmark} alt="" />
    </span>
  )
}
