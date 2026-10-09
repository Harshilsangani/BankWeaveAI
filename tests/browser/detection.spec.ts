import {test,expect} from '@playwright/test';
test('Radar exposes recorded rule facts and reuses unchanged snapshot runs',async({page})=>{
  await page.goto('/#risk-radar');
  // First paint computes and records the full snapshot analysis (10k customers).
  await expect(page.locator('.risk-grid .risk-card')).toHaveCount(3,{timeout:30000});
  await page.getByText('Rule & recorded run',{exact:false}).first().click();
  await expect(page.locator('.risk-grid')).toContainText('at least 25 records and ≥20% count increase');
  await expect(page.locator('.risk-grid')).toContainText('Observed: 1091 vs 833');
  await page.getByRole('button',{name:'Run detection',exact:true}).click();
  await expect(page.getByText('Existing snapshot reused',{exact:false})).toBeVisible();
  await page.reload();
  await expect(page.locator('.risk-grid .risk-card')).toHaveCount(3);
});
