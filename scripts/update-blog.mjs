#!/usr/bin/env node
// 把 zrxl_blog 的最新文章注入到 profile 的 README（<!-- BLOG:START/END --> 之间）。
// 零依赖（Node 18+ 自带 fetch）。GitHub Action 定时跑，也可本地跑。
//
// 环境变量：
//   GH_TOKEN   GitHub token（Action 用 github.token；本地用 `gh auth token`）。可省，但匿名有限流。
//   BLOG_REPO  默认 ZerbLion/zrxl_blog
//
// 数据源就是博客仓库的 posts/ 目录——不依赖 RSS，不依赖任何第三方服务。

import { readFileSync, writeFileSync } from 'node:fs';

const REPO = process.env.BLOG_REPO || 'ZerbLion/zrxl_blog';
const SITE = 'https://zerblion.github.io/zrxl_blog';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const MAX = 5;
const README = 'README.md';
const START = '<!-- BLOG:START -->';
const END = '<!-- BLOG:END -->';

function headers() {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'zerblion-profile' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function gh(path) {
  const r = await fetch(`https://api.github.com${path}`, { headers: headers() });
  if (!r.ok) throw new Error(`GitHub API ${r.status} for ${path}`);
  return r.json();
}

function parseFrontmatter(md) {
  const m = md.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(': ');
    if (i === -1) continue;
    fm[line.slice(0, i).trim()] = line.slice(i + 2).trim();
  }
  return fm;
}

async function main() {
  const items = await gh(`/repos/${REPO}/contents/posts`);
  const dirs = items.filter((i) => i.type === 'dir');

  const posts = [];
  for (const d of dirs) {
    try {
      const file = await gh(`/repos/${REPO}/contents/posts/${d.name}/index.md`);
      const md = Buffer.from(file.content, 'base64').toString('utf8');
      const fm = parseFrontmatter(md);
      posts.push({
        dir: d.name,
        title: fm.title || d.name,
        date: fm.date || (d.name.match(/^\d{4}-\d{2}-\d{2}/) || [''])[0],
        summary: fm.summary || '',
      });
    } catch (e) {
      console.error('skip', d.name, e.message);
    }
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const list = posts.length
    ? posts
        .slice(0, MAX)
        .map((p) => {
          const url = `${SITE}/#/post/${encodeURIComponent(p.dir)}`;
          const sum = p.summary ? ` — ${p.summary}` : '';
          return `- **[${p.title}](${url})**${sum} <sub>· ${p.date}</sub>`;
        })
        .join('\n')
    : '_还没有文章。_';

  const readme = readFileSync(README, 'utf8');
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (!re.test(readme)) {
    console.error(`README 缺少 ${START} / ${END} 标记`);
    process.exit(1);
  }
  const next = readme.replace(re, `${START}\n${list}\n${END}`);
  if (next !== readme) {
    writeFileSync(README, next);
    console.log(`已更新最新文章（${Math.min(posts.length, MAX)} 篇）`);
  } else {
    console.log('最新文章无变化');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
