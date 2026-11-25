/// <reference types="svelte" />
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { initDataset } from './lib/data/generator.js';

// 视景系统工程师导入机场测绘资料（本工具内置一份合成测绘数据集，结构与真实导入一致）
initDataset();

const app = mount(App, {
  target: document.getElementById('app')
});

export default app;
