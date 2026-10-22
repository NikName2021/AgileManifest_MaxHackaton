export const applicationChanged = () =>
  window.dispatchEvent(new Event('season:applications-changed'))
