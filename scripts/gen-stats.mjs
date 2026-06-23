#!/usr/bin/env node
// 自托管的 GitHub 统计卡：用官方 API 拉公开数据，生成一张 stats.svg 提交进仓库。
// 不依赖 github-readme-stats 等第三方实例（公共实例常被限流、GitHub camo 拉不到 → 主页空白）。
// 引用本地 SVG 走 GitHub 自己的图床，永远显示得出来。
//
// Action 用 github.token；本地用 `gh auth token`（Node fetch 不认系统代理，本地需配 HTTPS_PROXY）。

import { writeFile } from 'node:fs/promises';

const USER = process.env.STATS_USER || 'ZerbLion';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

async function gh(p) {
  const r = await fetch(`https://api.github.com${p}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'zerblion-stats',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status} for ${p}`);
  return r.json();
}

const user = await gh(`/users/${USER}`);

let repos = [];
for (let page = 1; ; page++) {
  const batch = await gh(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
  repos = repos.concat(batch);
  if (batch.length < 100) break;
}
const stars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
const langCount = {};
for (const r of repos) if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
const topLangs = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);

const stats = [
  ['Public repos', user.public_repos],
  ['Total stars', stars],
  ['Followers', user.followers],
  ['Following', user.following],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 450, H = 208;
const rows = stats.map(([label, value], i) => {
  const y = 78 + i * 28;
  return `  <circle cx="30" cy="${y - 5}" r="3" fill="#2f80ed"/>
  <text x="44" y="${y}" class="label">${esc(label)}</text>
  <text x="${W - 28}" y="${y}" class="value">${esc(value)}</text>`;
}).join('\n');

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(user.name || USER)} GitHub stats">
  <style>
    .title { font: 700 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #2f80ed; }
    .label { font: 600 14.5px 'Segoe UI', Ubuntu, Sans-Serif; fill: #8b949e; }
    .value { font: 700 15px 'Segoe UI', Ubuntu, Sans-Serif; fill: #2f80ed; text-anchor: end; }
    .langs { font: 600 12.5px 'Segoe UI', Ubuntu, Sans-Serif; fill: #8b949e; }
  </style>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="11" fill="none" stroke="#8b949e" stroke-opacity="0.35"/>
  <text x="28" y="40" class="title">${esc(user.name || USER)} · GitHub</text>
${rows}
  <text x="44" y="${78 + stats.length * 28 + 4}" class="langs">Top: ${esc(topLangs.join(' · ') || '—')}</text>
</svg>
`;

await writeFile('stats.svg', svg);
console.log(`stats.svg 生成：repos=${user.public_repos} stars=${stars} followers=${user.followers} langs=${topLangs.join(',')}`);
