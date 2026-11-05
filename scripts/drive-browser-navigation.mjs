/** Follow the same landing-page entry path as a user before choosing a wallet. */
export function landingFrame(page) {
  return page.frameLocator('iframe[title="Filecoin Drive — interactive storage explorer"]')
}

export async function waitForLanding(page) {
  await landingFrame(page).getByRole('button', { name: 'Open Drive ↗', exact: true }).waitFor()
}

export async function openDrive(page) {
  await landingFrame(page).getByRole('button', { name: 'Open Drive ↗', exact: true }).click()
  await page.getByRole('dialog', { name: 'Your wallet. Your drive.', exact: true }).waitFor()
}
