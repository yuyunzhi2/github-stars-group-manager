// ==UserScript==
// @name         GitHub Stars Group Manager
// @namespace    https://github.com/yuyunzhi2
// @version      1.0.0
// @description  为 GitHub Stars 页面添加分组管理功能，支持自动推荐分组、Tab 切换、搜索筛选、JSON 导入导出
// @author       yuyunzhi2
// @match        https://github.com/*tab=stars*
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- Constants ---
  const API_BASE = 'https://api.github.com';
  const PER_PAGE = 100; // GitHub API max per page
  const STORAGE_KEYS = {
    GROUPS: 'star_groups',
    CACHE: 'star_cache',
    SETTINGS: 'star_settings',
    RULES: 'star_auto_rules',
  };

  // --- Utility: safe URL/color helpers (prevent XSS) ---
  function safeUrl(url) {
    if (!url) return '#';
    if (/^https?:\/\//i.test(url)) return url;
    return '#';
  }
  function safeColor(color) {
    if (/^#[0-9a-fA-F]{3,8}$/.test(color || '')) return color;
    return '#58a6ff'; // default
  }
  function normalizeRepo(repo) {
    return {
      full_name: repo.full_name || '',
      name: repo.name || '',
      owner: repo.owner?.login || (repo.full_name || '').split('/')[0],
      description: repo.description || '',
      language: repo.language || '',
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      stargazers_count: repo.stargazers_count || 0,
      html_url: repo.html_url || '',
      updated_at: repo.updated_at || repo.pushed_at || '',
      archived: !!repo.archived,
    };
  }

  // Placeholder classes - will be implemented in subsequent tasks
  class StorageManager { /* Task 2 */ }
  class APIFetcher { /* Task 3 */ }
  class GroupManager { /* Task 4 */ }
  class AutoGrouper { /* Task 5 */ }
  class SearchFilter { /* Task 6 */ }
  class UIRenderer { /* Task 7+8 */ }
  class ImportExport { /* Task 7 */ }
  class App { /* Task 9 */ }

  // --- Initialize with Turbo/pjax compatibility ---
  let app = null;

  function initApp() {
    // Only run on Stars tab
    if (!location.search.includes('tab=stars')) return;

    // Prevent duplicate initialization
    const existing = document.getElementById('sgm-container');
    if (existing) existing.remove();

    app = new App();
    app.init();
  }

  // Initial run
  initApp();

  // Turbo navigation (GitHub's SPA framework)
  document.addEventListener('turbo:load', initApp);
  document.addEventListener('turbo:render', initApp);

  // pjax fallback (some GitHub pages still use pjax)
  document.addEventListener('pjax:end', initApp);

  // URL change fallback (catches all navigation methods)
  let _lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      initApp();
    }
  }).observe(document, { subtree: true, childList: true });
})();
