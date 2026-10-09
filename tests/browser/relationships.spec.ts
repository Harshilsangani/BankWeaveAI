import {test,expect} from '@playwright/test';
test('relationship investigation shows keyboard-accessible observed links and survives reload',async({page})=>{
  await page.goto('/#risk-radar');
  await expect(page.locator('.risk-card')).toHaveCount(3,{timeout:20000});
  await page.locator('.risk-card').filter({hasText:'Suspicious device cluster'}).getByRole('button',{name:'Investigate',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Observed relationship map'})).toBeVisible({timeout:20000});
  const node=page.getByRole('button',{name:/Select device/}).first();await node.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.graph-detail')).toContainText('recorded device event');await expect(page.locator('.graph-detail')).toContainText('References: TX-');
  await page.reload();await expect(page.getByRole('heading',{name:'Observed relationship map'})).toBeVisible({timeout:20000});
});
