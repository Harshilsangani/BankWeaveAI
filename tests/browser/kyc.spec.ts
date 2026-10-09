import {test,expect} from '@playwright/test';
test('KYC review requires evidence references and preserves a pending-verification decision',async({page})=>{
  await page.goto('/#data-workspace');await page.getByLabel('Search records').fill('CUS-00003');await page.locator('.customer-name').first().click();await page.getByText('KYC review cases',{exact:true}).click();
  await page.getByLabel('New KYC review reason').fill('Synthetic staff documentation review');await page.getByRole('button',{name:'Open KYC review',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Identity verification: not performed.');
  await page.getByLabel(/KYC evidence type/).selectOption('Identity proof reference');await page.getByLabel(/KYC reference/).fill('FICTIONAL-ID-REF');await page.getByLabel(/KYC note/).fill('Identity reference recorded; authenticity is unverified');await page.getByRole('button',{name:'Save KYC review'}).click();
  await page.getByLabel(/KYC evidence type/).selectOption('Address proof reference');await page.getByLabel(/KYC reference/).fill('FICTIONAL-ADDRESS-REF');await page.getByLabel(/KYC note/).fill('Address reference recorded; external verification is still pending');await page.getByLabel(/KYC status/).selectOption('Reviewed pending verification');await page.getByRole('button',{name:'Save KYC review'}).click();
  await expect(page.getByRole('dialog')).toContainText('Reviewed pending verification');
  await page.reload();await page.getByLabel('Search records').fill('CUS-00003');await page.locator('.customer-name').first().click();await page.getByText('KYC review cases',{exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Reviewed pending verification');
});
