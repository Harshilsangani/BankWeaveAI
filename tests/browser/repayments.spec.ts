import {test,expect} from '@playwright/test';
test('loan repayment evidence appears in chat and the same customer overview',async({page})=>{
  await page.goto('/#ai-analyst');
  await expect(page.getByRole('heading',{name:'Hello, Alex.'})).toBeVisible({timeout:20000});
  await page.getByLabel('Ask anything about your banking data').fill('Show loan repayments and overdue evidence');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.getByRole('heading',{name:'Repayment evidence & delinquency'})).toBeVisible({timeout:20000});
  await expect(page.locator('.chat-thread')).toContainText('765 loans');
  await expect(page.locator('.chat-thread')).toContainText('15 days');
  await page.goto('/#data-workspace');
  await page.getByLabel('Customer products').selectOption('loans');
  await page.locator('.customer-name').first().click();
  await page.getByText('Repayment ledger & overdue evidence',{exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('48 equal principal installments');
});
