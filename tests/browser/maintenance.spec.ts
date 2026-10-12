import {test,expect} from '@playwright/test';
test('lost maintenance response retries once and guarded reversal preserves history',async({page})=>{
  await page.addInitScript(() => localStorage.setItem('risklens-role','admin'));
  await page.goto('/#data-workspace');await page.getByLabel('Search records').fill('CUS-00002');await page.locator('.customer-name').first().click();await page.getByText('Controlled record maintenance',{exact:true}).click();
  await expect(page.getByLabel('Record workflow')).toBeVisible({timeout:20000});
  const requests:string[]=[];
  await page.route('**/api/maintenance',async route=>{
    if(route.request().method()==='POST' && route.request().postDataJSON().action==='accounts') {
      requests.push(route.request().postDataJSON().requestId);
      if(requests.length===1){await route.fetch();await route.abort();return;}
    }
    await route.continue();
  });
  await page.getByLabel('Record maintenance reason').fill('Reviewed synthetic account observation for demo');await page.getByLabel('Confirm record observation').check();await page.getByRole('button',{name:'Record observation',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('service is unreachable');
  await page.getByRole('button',{name:'Record observation',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Saved operation recovered');expect(requests).toHaveLength(2);expect(requests[0]).toBe(requests[1]);
  await page.getByLabel('Record reversal reason').fill('Reversing this demo observation preserves source records');await page.getByRole('button',{name:/^Reverse MAINT-/}).click();
  await expect(page.getByRole('dialog')).toContainText('Operation reversed');
  await page.reload();await page.getByLabel('Search records').fill('CUS-00002');await page.locator('.customer-name').first().click();await page.getByText('Controlled record maintenance',{exact:true}).click();
  await expect(page.getByRole('dialog').locator('.badge').filter({hasText:'reversed'})).toBeVisible({timeout:15000});
});
