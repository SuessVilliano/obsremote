import {test,expect} from '@playwright/test';

test('dashboard shell loads and tabs navigate',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Command Center'})).toBeVisible();
  await expect(page.locator('#dashboard')).toBeVisible();
  await page.getByRole('button',{name:/Music/i}).click();
  await expect(page.getByRole('heading',{name:'Library & playlists'})).toBeVisible();
  await page.getByRole('button',{name:/Destinations/i}).click();
  await expect(page.getByRole('heading',{name:'Destinations'})).toBeVisible();
  await page.getByRole('button',{name:/AI/i}).click();
  await expect(page.getByRole('heading',{name:'Producer copilot'})).toBeVisible();
});

test('theme toggles and floating AI opens and closes',async({page})=>{
  await page.goto('/');
  const before=await page.locator('html').getAttribute('data-theme');
  await page.locator('#themeToggle').click();
  const after=await page.locator('html').getAttribute('data-theme');
  expect(after).not.toBe(before);
  await page.locator('#aiFab').click();
  await expect(page.locator('#aiWidget')).toBeVisible();
  await page.locator('#aiClose').click();
  await expect(page.locator('#aiWidget')).toBeHidden();
});

test('mobile drawer stays off-canvas until requested',async({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('mobile'),'mobile-only assertion');
  await page.goto('/');
  const nav=page.locator('#sideNav');
  await expect(nav).not.toHaveClass(/open/);
  await page.locator('#navToggle').click();
  await expect(nav).toHaveClass(/open/);
  await page.getByRole('button',{name:/Sounds/i}).click();
  await expect(page.getByRole('heading',{name:'Sounds & voice drops'})).toBeVisible();
  await expect(nav).not.toHaveClass(/open/);
});
