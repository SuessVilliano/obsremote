import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:30_000,
  expect:{timeout:5_000},
  fullyParallel:true,
  reporter:'line',
  use:{baseURL:'http://127.0.0.1:3200',trace:'retain-on-failure'},
  webServer:{command:'PORT=3200 REMOTE_PIN= node server.js',url:'http://127.0.0.1:3200/api/health',reuseExistingServer:false,timeout:20_000},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'mobile-chromium',use:{...devices['Pixel 7']}}
  ]
});
