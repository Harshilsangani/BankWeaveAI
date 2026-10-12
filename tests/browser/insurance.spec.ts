import {test,expect} from '@playwright/test';
test('insurance ledger uses canonical customers and appears inline in analyst chat',async({page})=>{
  await page.goto('/#ai-analyst');
  await expect(page.getByRole('heading',{name:'Hello, Analyst.'})).toBeVisible({timeout:20000});
  await page.getByLabel('Ask anything about your banking data').fill('Show insurance coverage and policies expiring');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.getByRole('heading',{name:'Insurance coverage & expiry'})).toBeVisible({timeout:20000});
  await expect(page.locator('.chat-thread')).toContainText('customers have active policies');
  await page.goto('/#data-workspace');
  await page.getByLabel('Search records').fill('CUS-00002');
  await page.locator('.customer-name').first().click();
  await page.getByText('Insurance policies & coverage',{exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('INS-CUS-00002');
});
