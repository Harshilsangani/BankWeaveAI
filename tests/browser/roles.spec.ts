import {test,expect} from '@playwright/test';
test('viewer UI and direct API both deny customer writes',async ({page})=>{
  await page.goto('/#settings');
  await expect(page.getByLabel('Local staff role')).toHaveValue('customer_operator');
  await page.getByLabel('Local staff role').selectOption('viewer');
  await expect(page.getByLabel('Local staff role')).toHaveValue('viewer');
  await page.goto('/#data-workspace');
  await expect(page.getByRole('button',{name:'Add customer',exact:true})).toBeDisabled();
  const response=await page.evaluate(async()=>{
    const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json','x-risklens-role':'viewer'},body:JSON.stringify({fields:{fullName:'Unauthorized',dateOfBirth:'1990-01-01'}})});
    return {status:r.status,body:await r.json()};
  });
  expect(response.status).toBe(403);
  expect(response.body.error).toContain('permission');
});
